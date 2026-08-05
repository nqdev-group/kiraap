/**
 * Chuyển 1 SSE stream tuỳ ý (OpenAI/Anthropic...) thành 1 ReadableStream
 * phát ra đúng JSON shape Gemini mà server/routes/api/chat.js và
 * server/routes/api/proxy.js đang tự parse (candidates[0].content.parts[0].text,
 * usageMetadata).
 *
 * Nhờ vậy 2 file đó không cần biết/sửa gì khi nguồn là custom provider.
 *
 * @param {ReadableStream} upstreamBody - response.body của fetch tới provider ngoài
 * @param {(parsedJson: any) => string} extractText - lấy text delta từ 1 JSON event của provider gốc
 * @param {(parsedJson: any) => ({tokenInput?: number, tokenOutput?: number}|null)} [extractUsage] -
 *   lấy token usage (nếu có) từ 1 JSON event — optional, provider không hỗ trợ thì bỏ qua tham số này
 */
function createGeminiSSEStream(upstreamBody, extractText, extractUsage) {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const reader = upstreamBody.getReader();
    let buffer = '';
    // Usage thường đến rải rác qua nhiều event khác nhau (vd. Anthropic: tokenInput ở
    // message_start, tokenOutput ở message_delta) — merge nông, chỉ ghi đè field nào
    // thật sự có giá trị mới, không để 1 event chỉ có tokenOutput xoá mất tokenInput đã gom trước đó.
    let usage = null;

    function mergeUsage(partial) {
        if (!partial) return;
        usage = usage || {};
        if (partial.tokenInput !== undefined) usage.tokenInput = partial.tokenInput;
        if (partial.tokenOutput !== undefined) usage.tokenOutput = partial.tokenOutput;
    }

    function enqueueUsageEvent(controller) {
        if (!usage) return;
        const chunk = {
            candidates: [{ content: { parts: [{ text: '' }] } }],
            usageMetadata: {
                promptTokenCount: usage.tokenInput || 0,
                candidatesTokenCount: usage.tokenOutput || 0,
                totalTokenCount: (usage.tokenInput || 0) + (usage.tokenOutput || 0)
            }
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
    }

    return new ReadableStream({
        // pull() không được return cho tới khi enqueue được ít nhất 1 chunk (hoặc upstream kết thúc) —
        // không thể trông cậy vào việc engine tự gọi lại pull() khi 1 lượt đọc upstream không có text nào
        // (vd. delta đầu tiên chỉ có {role:"assistant", content:""}), việc này từng gây treo stream vô thời hạn.
        async pull(controller) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    // Emit usageMetadata (nếu gom được) như 1 event Gemini-shape cuối cùng trước khi
                    // đóng — chat.js/proxy.js đã tự đọc field này (dùng chung logic với Gemini native
                    // streaming), không cần sửa gì ở 2 file đó.
                    enqueueUsageEvent(controller);
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

                    if (extractUsage) {
                        mergeUsage(extractUsage(parsed));
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
