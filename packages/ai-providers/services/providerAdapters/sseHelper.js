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
        // pull() không được return cho tới khi enqueue được ít nhất 1 chunk (hoặc upstream kết thúc) —
        // không thể trông cậy vào việc engine tự gọi lại pull() khi 1 lượt đọc upstream không có text nào
        // (vd. delta đầu tiên chỉ có {role:"assistant", content:""}), việc này từng gây treo stream vô thời hạn.
        async pull(controller) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    controller.close();
                    return;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                let enqueued = false;
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

                    // Provider có thể trả lỗi (quá tải, hết quota...) như 1 event SSE bình thường
                    // (HTTP status vẫn 200) thay vì đóng kết nối với status lỗi — nếu không kiểm tra
                    // riêng, lỗi này bị extractText() bỏ qua lặng lẽ (không khớp choices[].delta.content)
                    // và stream kết thúc rỗng, không có gì hiển thị cho người dùng mà cũng không báo lỗi.
                    if (parsed.error) {
                        throw new Error(parsed.error.message || JSON.stringify(parsed.error));
                    }

                    const text = extractText(parsed);
                    if (text) {
                        const chunk = { candidates: [{ content: { parts: [{ text }] } }] };
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
                        enqueued = true;
                    }
                }

                if (enqueued) return;
            }
        }
    });
}

module.exports = { createGeminiSSEStream };
