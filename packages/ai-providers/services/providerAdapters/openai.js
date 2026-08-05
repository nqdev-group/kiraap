const { createGeminiSSEStream } = require('./sseHelper.js');

/**
 * Adapter cho provider tương thích OpenAI (Chat Completions + Images generations)
 */

function toOpenAIMessages({ prompt, history = [], systemPrompt }) {
    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    for (const turn of history) {
        const role = turn.role === 'model' ? 'assistant' : 'user';
        const text = turn.parts?.map(p => p.text).filter(Boolean).join('\n') || '';
        if (text) messages.push({ role, content: text });
    }
    if (prompt) {
        messages.push({ role: 'user', content: prompt });
    }
    return messages;
}

function authHeaders(key, extraHeaders) {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        ...(extraHeaders || {})
    };
}

async function generateText({ prompt, history, systemPrompt, provider, keyInfo, model }) {
    const endpoint = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const payload = {
        model: model.modelId,
        messages: toOpenAIMessages({ prompt, history, systemPrompt }),
        temperature: model.parameters?.temperature ?? 0.7,
        max_tokens: model.parameters?.maxOutputTokens || undefined,
        stream: false
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: authHeaders(keyInfo.key, provider.extraHeaders),
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error?.message || `Provider API Error (${response.status})`);
    }

    return {
        text: data.choices?.[0]?.message?.content || '',
        tokenInput: data.usage?.prompt_tokens || 0,
        tokenOutput: data.usage?.completion_tokens || 0
    };
}

async function generateTextStream({ prompt, history, systemPrompt, provider, keyInfo, model }) {
    const endpoint = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const payload = {
        model: model.modelId,
        messages: toOpenAIMessages({ prompt, history, systemPrompt }),
        temperature: model.parameters?.temperature ?? 0.7,
        max_tokens: model.parameters?.maxOutputTokens || undefined,
        stream: true,
        // Không phải mọi backend OpenAI-compatible hỗ trợ field này — nếu không hỗ trợ,
        // provider chỉ đơn giản bỏ qua (đã verify với 9router), extractUsage bên dưới
        // sẽ luôn nhận null và usage vẫn log 0 như trước, không có regression.
        stream_options: { include_usage: true }
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: authHeaders(keyInfo.key, provider.extraHeaders),
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Provider API Error (${response.status})`);
    }

    const stream = createGeminiSSEStream(
        response.body,
        (parsed) => parsed.choices?.[0]?.delta?.content || '',
        (parsed) => parsed.usage ? { tokenInput: parsed.usage.prompt_tokens, tokenOutput: parsed.usage.completion_tokens } : null
    );
    return { stream };
}

async function generateImage({ prompt, aspectRatio, provider, keyInfo, model }) {
    const endpoint = `${provider.baseUrl.replace(/\/$/, '')}/images/generations`;

    const sizeMap = { '1:1': '1024x1024', '16:9': '1792x1024', '9:16': '1024x1792' };
    const size = sizeMap[aspectRatio] || '1024x1024';

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: authHeaders(keyInfo.key, provider.extraHeaders),
        body: JSON.stringify({ model: model.modelId, prompt, size, n: 1 })
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error?.message || `Provider API Error (${response.status})`);
    }

    const item = data.data?.[0];
    if (!item) {
        throw new Error('Provider không trả về dữ liệu ảnh');
    }

    let base64Data = item.b64_json;
    let mimeType = 'image/png';

    if (!base64Data && item.url) {
        const imgRes = await fetch(item.url);
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        base64Data = buffer.toString('base64');
        mimeType = imgRes.headers.get('content-type') || 'image/png';
    }

    if (!base64Data) {
        throw new Error('Provider không trả về dữ liệu ảnh hợp lệ');
    }

    return {
        mimeType,
        data: base64Data,
        textResponse: item.revised_prompt || '',
        tokenInput: 0,
        tokenOutput: 0
    };
}

/**
 * Chuyển text thành giọng nói (TTS) qua endpoint chuẩn OpenAI /audio/speech.
 * Theo chuẩn OpenAI thật, endpoint này trả về audio nhị phân (mặc định mp3)
 * trực tiếp trong response body — KHÔNG phải JSON — khác với các hàm khác trong
 * file này. Chưa verify với key Kira thật (xem Unknown 1 trong
 * plans/2026-08-05-kira-provider-full-parity-planning.md); nếu provider thật
 * trả JSON+base64 thay vì binary, cần sửa lại đoạn đọc response bên dưới.
 */
async function generateTTS({ text, voiceName, provider, keyInfo, model }) {
    const endpoint = `${provider.baseUrl.replace(/\/$/, '')}/audio/speech`;
    const payload = {
        model: model.modelId,
        input: text,
        voice: voiceName || model.parameters?.voiceName || 'alloy'
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: authHeaders(keyInfo.key, provider.extraHeaders),
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Provider API Error (${response.status})`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get('content-type') || 'audio/mpeg';

    return {
        data: buffer.toString('base64'),
        mimeType,
        tokenInput: 0,
        tokenOutput: 0
    };
}

/**
 * Khởi tạo tạo video (bước 1/2, async). Shape request/response CHƯA được verify
 * với key Kira thật (Unknown 2 trong plan) — field name giả định theo quy ước
 * OpenAI-style (snake_case) và theo mô tả sơ lược của doc Kira ("submit → poll
 * /videos/operations/:uuid"). Cần test thật và chỉnh lại field name nếu sai.
 */
async function generateVideo({ prompt, aspectRatio, durationSeconds, provider, keyInfo, model }) {
    const endpoint = `${provider.baseUrl.replace(/\/$/, '')}/videos/generations`;

    const payload = {
        model: model.modelId,
        prompt,
        aspect_ratio: aspectRatio || model.parameters?.aspectRatio || '16:9',
        duration_seconds: parseInt(durationSeconds || model.parameters?.durationSeconds || 6)
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: authHeaders(keyInfo.key, provider.extraHeaders),
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error?.message || `Provider API Error (${response.status})`);
    }

    const operationId = data.id || data.operation_id || data.uuid || data.name;
    if (!operationId) {
        throw new Error('Provider không trả về operation id cho video');
    }

    return { operationId };
}

/**
 * Poll trạng thái video (bước 2/2). Cùng ghi chú "chưa verify" như generateVideo ở trên.
 */
async function pollVideoOperation({ operationId, provider, keyInfo }) {
    const endpoint = `${provider.baseUrl.replace(/\/$/, '')}/videos/operations/${operationId}`;

    const response = await fetch(endpoint, {
        method: 'GET',
        headers: authHeaders(keyInfo.key, provider.extraHeaders)
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error?.message || `Provider API Error (${response.status})`);
    }

    const status = data.status || (data.done ? 'completed' : 'processing');
    if (status === 'failed' || status === 'error') {
        throw new Error(data.error?.message || 'Tạo video thất bại');
    }

    const done = data.done === true || status === 'completed' || status === 'succeeded';
    if (!done) {
        return { done: false };
    }

    const result = data.data?.[0] || data.result || data;
    const videoUrl = result.video_url || result.url || null;
    const videoBase64 = result.video_base64 || result.b64_json || null;
    const mimeType = result.mime_type || data.mime_type || 'video/mp4';

    if (!videoUrl && !videoBase64) {
        throw new Error('Provider không trả về dữ liệu video hợp lệ');
    }

    return { done: true, videoUrl, videoBase64, mimeType };
}

module.exports = { generateText, generateTextStream, generateImage, generateTTS, generateVideo, pollVideoOperation };
