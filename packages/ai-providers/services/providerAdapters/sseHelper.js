/**
 * Chuyển 1 SSE stream tuỳ ý (OpenAI/Anthropic...) thành 1 ReadableStream
 * phát ra đúng JSON shape Gemini mà server/routes/api/chat.js và
 * server/routes/api/proxy.js đang tự parse (candidates[0].content.parts[0].text).
 *
 * Nhờ vậy 2 file đó không cần biết/sửa gì khi nguồn là custom provider.
 *
 * @param {ReadableStream} upstreamBody - response.body của fetch tới provider ngoài
 * @param {(parsedJson: any) => string} extractText - lấy text delta từ 1 JSON event của provider gốc
 */
function createGeminiSSEStream(upstreamBody, extractText) {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const reader = upstreamBody.getReader();
    let buffer = '';

    return new ReadableStream({
        async pull(controller) {
            console.error(`[DEBUG pull] calling reader.read()... ${Date.now()}`);
            const { done, value } = await reader.read();
            console.error(`[DEBUG pull] reader.read() resolved: done=${done}, bytes=${value?.length}, ${Date.now()}`);
            if (done) {
                controller.close();
                return;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            console.error(`[DEBUG pull] processing ${lines.length} lines, buffer remainder=${JSON.stringify(buffer.substring(0,80))}`);

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;

                const jsonStr = trimmed.slice(5).trim();
                if (!jsonStr || jsonStr === '[DONE]') continue;

                let parsed;
                try {
                    parsed = JSON.parse(jsonStr);
                } catch (e) {
                    continue; // bỏ qua dòng JSON không hợp lệ
                }

                const text = extractText(parsed);
                if (text) {
                    const chunk = { candidates: [{ content: { parts: [{ text }] } }] };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
                }
            }
        }
    });
}

module.exports = { createGeminiSSEStream };
