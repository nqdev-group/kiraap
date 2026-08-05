const { createGeminiSSEStream } = require('./sseHelper.js');

/**
 * Adapter cho provider tương thích Anthropic (Messages API)
 * Không hỗ trợ generateImage — Anthropic không có API tạo ảnh.
 */

function toAnthropicMessages({ prompt, history = [] }) {
    const messages = [];
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
        'x-api-key': key,
        'anthropic-version': extraHeaders?.['anthropic-version'] || '2023-06-01',
        ...(extraHeaders || {})
    };
}

async function generateText({ prompt, history, systemPrompt, provider, keyInfo, model }) {
    const endpoint = `${provider.baseUrl.replace(/\/$/, '')}/v1/messages`;
    const payload = {
        model: model.modelId,
        system: systemPrompt || undefined,
        max_tokens: model.parameters?.maxOutputTokens || 4096,
        messages: toAnthropicMessages({ prompt, history }),
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

    const textBlock = data.content?.find(c => c.type === 'text');

    return {
        text: textBlock?.text || '',
        tokenInput: data.usage?.input_tokens || 0,
        tokenOutput: data.usage?.output_tokens || 0
    };
}

async function generateTextStream({ prompt, history, systemPrompt, provider, keyInfo, model }) {
    const endpoint = `${provider.baseUrl.replace(/\/$/, '')}/v1/messages`;
    const payload = {
        model: model.modelId,
        system: systemPrompt || undefined,
        max_tokens: model.parameters?.maxOutputTokens || 4096,
        messages: toAnthropicMessages({ prompt, history }),
        stream: true
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

    const stream = createGeminiSSEStream(response.body, (parsed) => {
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            return parsed.delta.text || '';
        }
        return '';
    });
    return { stream };
}

module.exports = { generateText, generateTextStream };
