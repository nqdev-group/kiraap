---
type: bug-fix
complexity: medium
status: completed
related_issues: []
related_prs: []
estimated_hours: ~2
---

# Kế hoạch: Ghi nhận token vào/ra thật cho Custom AI Provider khi chat streaming

> **Ngày lập kế hoạch:** 2026-08-05
> **Scope dự kiến:** `packages/ai-providers/services/providerAdapters/{sseHelper,openai,anthropic}.js`, `server/routes/api/chat.js` (không đổi logic, chỉ hưởng lợi tự động), `server/routes/api/proxy.js` (bonus fix cùng nguyên nhân)
> **Priority:** medium

---

## 1. Phân tích / Bối cảnh

Đây là fix cho **known limitation đã ghi sẵn trong `AGENTS.md`** (mục "Custom AI Provider"):

> Known limitation: streamed chat via a custom provider logs `tokenInput`/`tokenOutput` as `0` (chat.js only reads `usageMetadata` from chunks, and adapters don't inject one to avoid relying on `stream_options`/usage-event support that not all OpenAI/Anthropic-compatible backends implement consistently). Non-streaming calls (`generateText`, used by `/v1/chat/completions` with `stream:false`) report real token counts from the provider's response.

Khảo sát code xác nhận đúng root cause:

- **Non-streaming đã đúng** — `providerAdapters/openai.js:52-56` và `anthropic.js:53-57` đã đọc `data.usage.{prompt_tokens,completion_tokens}` / `data.usage.{input_tokens,output_tokens}` từ response JSON và trả về `tokenInput`/`tokenOutput` thật. Không cần đụng vào.
- **Streaming bị 0 vì `sseHelper.js` (`createGeminiSSEStream`) chỉ forward text delta, không bao giờ forward usage** — hàm `extractText` chỉ lấy `parsed.choices[0].delta.content` (OpenAI) hoặc `parsed.delta.text` (Anthropic), không có cơ chế nào đọc/emit usage. `chat.js:157` (`if (chunk.usageMetadata) {...}`) đã có sẵn logic đọc `usageMetadata` — logic này hoạt động đúng với Gemini native streaming (Google luôn kèm `usageMetadata` ở chunk cuối) nhưng **không bao giờ được trigger** với custom provider vì sseHelper không bao giờ emit field đó.
- **Ảnh (`generateImage`) không phải bug** — OpenAI Images API không trả token usage (billing theo ảnh, không theo token), `tokenInput: 0, tokenOutput: 0` cứng trong `openai.js:124-125` là đúng, không sửa.
- **TTS/Video không áp dụng** — `agentPlatformBridge.js` chỉ export `generateText/generateTextStream/generateImage`, custom provider không hỗ trợ TTS/Video (Google-only, theo `AGENTS.md`).

**Phát hiện thêm (ngoài scope gốc nhưng cùng nguyên nhân):** `server/routes/api/proxy.js` (endpoint `/v1/chat/completions`, OpenAI-compatible công khai) — nhánh `stream: true` (dòng 157-278) **không hề gọi `tokenCounter.logUsage` dù chunk nào cả**, bất kể là Google hay custom provider. Khác với `chat.js` (SSR web UI) đã tự gọi `logUsage` sau khi stream kết thúc. Đây là 1 gap riêng, rộng hơn (ảnh hưởng cả model Google khi gọi qua `/v1` streaming), nhưng fix cùng cơ chế nên tiện làm chung — xem mục 6 để xác nhận có muốn gộp không.

**Verify thật với provider test (9router) trước khi lên plan** — gọi trực tiếp `https://9router.svr.quyit.id.vn/v1/chat/completions` với `stream: true, stream_options: { include_usage: true }`:

```
data: {...,"choices":[{"delta":{"role":"assistant"},...}]}
data: {...,"choices":[{"delta":{"content":"Hi."},...}]}
data: {...,"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3144,"completion_tokens":2,"total_tokens":3146}}
```

→ Xác nhận: 9router (provider thật đang cấu hình trong repo) **hỗ trợ `stream_options.include_usage`** và trả `usage` thật ở chunk cuối (gắn kèm `finish_reason:"stop"`, không phải chunk `choices:[]` riêng như OpenAI spec chuẩn mô tả — nghĩa là code đọc usage nên kiểm tra field `usage` ở top-level bất kỳ chunk nào, không giả định vị trí cố định).

## 2. Approach / Strategy

**Nguyên tắc: lấy usage thật từ trong luồng SSE có sẵn, không gọi thêm request nào.** Không estimate bằng heuristic ký tự khi provider không trả usage — giữ nguyên `0` như hiện tại cho trường hợp đó (xem lý do ở mục 6, cần xác nhận với user).

1. **`sseHelper.js`**: mở rộng `createGeminiSSEStream(upstreamBody, extractText, extractUsage)` — thêm tham số thứ 3 optional. Trong `pull()`, với mỗi `parsed` JSON event, nếu `extractUsage(parsed)` trả về object non-null thì merge vào biến closure `usage` (merge nông, không ghi đè field đã có bằng `undefined` — quan trọng cho Anthropic vì `tokenInput` và `tokenOutput` đến từ 2 event khác nhau). Khi `done` (upstream đóng), nếu `usage` đã có ít nhất 1 field, `enqueue` thêm 1 event Gemini-shape cuối cùng dạng `{candidates:[{content:{parts:[{text:''}]}}], usageMetadata:{promptTokenCount, candidatesTokenCount, totalTokenCount}}` **trước khi** `controller.close()` — đúng shape Gemini native streaming đã dùng, nên `chat.js:157` tự động nhặt được mà **không cần sửa `chat.js`**.
2. **`providerAdapters/openai.js`**: thêm `stream_options: { include_usage: true }` vào payload của `generateTextStream` (đã verify hoạt động với 9router ở mục 1). Thêm `extractUsage: (parsed) => parsed.usage ? { tokenInput: parsed.usage.prompt_tokens, tokenOutput: parsed.usage.completion_tokens } : null`, truyền vào `createGeminiSSEStream`.
3. **`providerAdapters/anthropic.js`**: thêm `extractUsage` đọc 2 loại event chuẩn của Anthropic Messages API streaming (input token luôn có ở `message_start`, output token cập nhật dần ở `message_delta` — theo tài liệu chính thức, không phải flag tùy chọn như OpenAI nên rủi ro thấp hơn, nhưng **chưa test thật** vì repo không có Anthropic key cấu hình sẵn):
   ```js
   (parsed) => {
     if (parsed.type === 'message_start') return { tokenInput: parsed.message?.usage?.input_tokens };
     if (parsed.type === 'message_delta') return { tokenOutput: parsed.usage?.output_tokens };
     return null;
   }
   ```
4. **`server/routes/api/chat.js`**: không sửa gì — logic đọc `chunk.usageMetadata` đã đúng sẵn, tự động hưởng lợi.
5. **(Cần xác nhận — mục 6) `server/routes/api/proxy.js`**: nếu gộp chung, thêm cùng cơ chế đọc `parsed.usageMetadata` trong loop streaming (dòng ~205-260) và gọi `tokenCounter.logUsage` sau khi stream kết thúc — hiện route này chưa `require` `tokenCounter`.

## 3. Công việc cần thực hiện (Todo)

- [x] Sửa `packages/ai-providers/services/providerAdapters/sseHelper.js`: thêm tham số `extractUsage`, cơ chế merge + emit `usageMetadata` event cuối trước khi close stream
- [x] Sửa `providerAdapters/openai.js`: thêm `stream_options: { include_usage: true }` + `extractUsage`
- [x] Sửa `providerAdapters/anthropic.js`: thêm `extractUsage` cho `message_start`/`message_delta`
- [x] Verify thật với 9router: chạy chat streaming qua UI thật (`/chat`, model `9r-route-combo-free`), kiểm tra `AILog` (`/admin/logs`) ghi `tokenInput`/`tokenOutput` khác 0
- [x] Sửa `server/routes/api/proxy.js` nhánh streaming: đọc `usageMetadata`, gọi `tokenCounter.logUsage` sau khi stream kết thúc — cần `require` thêm `tokenCounter`
- [x] Verify `proxy.js`: test `curl /v1/chat/completions` với `stream:true` qua `kira_sk_` key, kiểm tra `AILog` có ghi nhận
- [x] Cập nhật `AGENTS.md`: xoá/sửa lại đoạn "Known limitation" hiện tại cho khớp trạng thái mới (thật + có điều kiện provider hỗ trợ, không còn cứng `0`)

## 4. Risks & Unknowns

- **Risk 1 (đã giảm nhờ verify thật):** Không phải mọi OpenAI-compatible backend hỗ trợ `stream_options.include_usage` — với 9router đã xác nhận hoạt động, nhưng nếu admin cấu hình 1 provider khác không hỗ trợ, `extractUsage` trả `null` → `usage` vẫn rỗng → hành vi y hệt hiện tại (`0`), **không có regression**, chỉ đơn giản không cải thiện được cho backend đó.
- **Risk 2:** Thêm field lạ (`stream_options`) vào payload có rủi ro (dù thấp) 1 số backend OpenAI-compatible strict-schema từ chối request thay vì bỏ qua field không biết. → **Mitigation:** đã verify với 9router (provider thật trong repo) hoạt động bình thường; nếu phát sinh backend khác lỗi, cần bọc field này trong try hoặc thêm cấu hình bật/tắt per-provider (không làm trước khi có bằng chứng cần thiết — tránh over-engineer).
- **Unknown 1:** Anthropic `extractUsage` **chưa test thật** (không có Anthropic API key cấu hình trong repo để verify) — dựa theo tài liệu chính thức Messages API streaming. Cần test thật khi có key, hoặc chấp nhận rủi ro thấp vì đây là format chuẩn ổn định của chính Anthropic (không phải tùy chọn như OpenAI).
- **Unknown 2 (cần quyết định — mục 6):** Có estimate token bằng heuristic ký tự (`tokenCounter.estimateInputTokens`, đã có sẵn) khi provider không trả usage thật, thay vì giữ `0`? Ảnh hưởng tới độ tin cậy số liệu hiển thị ở `/admin/logs`.
- **Unknown 3 (cần quyết định — mục 6):** Gộp luôn fix cho `proxy.js` streaming (hiện thiếu `logUsage` hoàn toàn, kể cả cho Google) hay tách riêng vì đây là gap rộng hơn phạm vi "custom provider" ban đầu.

## 5. Success Criteria

- Chat streaming qua custom provider (9router) từ `/chat` (SSR UI) ghi `tokenInput`/`tokenOutput` khác 0 trong `AILog`, khớp gần đúng với số `usage` thật provider trả về.
- Chat streaming qua custom provider khi provider **không** hỗ trợ usage-in-stream vẫn hoạt động bình thường (không crash, không throw), chỉ log `0` như hành vi hiện tại — không có regression.
- Non-streaming custom provider (`generateText`) không đổi hành vi (đã đúng từ trước).
- (Nếu làm mục proxy.js) `/v1/chat/completions` với `stream:true` ghi `AILog` sau khi hoàn tất, cho cả Google và custom provider.
- `AGENTS.md` phản ánh đúng trạng thái mới, không còn mô tả sai là "logs 0" tuyệt đối.

## 6. Questions / Dependencies

- ✅ Đã xác nhận với user (2026-08-05): **giữ `0`** khi provider không trả usage thật trong stream — không estimate bằng heuristic ký tự, ưu tiên trung thực số liệu trên `/admin/logs` hơn là luôn có số khác 0.
- ✅ Đã xác nhận với user (2026-08-05): **gộp luôn** fix `server/routes/api/proxy.js` (streaming thiếu `logUsage` hoàn toàn, ảnh hưởng cả Google model) vào cùng lần implement này.

## 7. Kết quả triển khai (bổ sung sau khi hoàn thành — 2026-08-05)

- **Trạng thái:** ✅ Hoàn thành toàn bộ Todo ở mục 3.
- **File đã sửa:** [`packages/ai-providers/services/providerAdapters/sseHelper.js`](../packages/ai-providers/services/providerAdapters/sseHelper.js) (tham số `extractUsage` + merge + emit event `usageMetadata` cuối), [`providerAdapters/openai.js`](../packages/ai-providers/services/providerAdapters/openai.js) (`stream_options.include_usage` + `extractUsage`), [`providerAdapters/anthropic.js`](../packages/ai-providers/services/providerAdapters/anthropic.js) (`extractUsage` cho `message_start`/`message_delta`, chưa test thật vì repo không có Anthropic key), [`server/routes/api/proxy.js`](../server/routes/api/proxy.js) (`require tokenCounter` + đọc `usageMetadata` ở cả 2 nhánh đọc stream + gọi `logUsage` trước khi gửi final chunk), [`AGENTS.md`](../AGENTS.md) (thay đoạn "Known limitation" cũ bằng 2 gotcha mới mô tả đúng cơ chế thật).
- **Verify thật (không phải chỉ đọc code):**
  1. Gọi `/api/ai/chat` (SSR UI, model `9r-route-combo-free`) qua script trực tiếp → SSE trả về `{"type":"done","tokenInput":3156,"tokenOutput":11}` — khác 0.
  2. Test lại qua trình duyệt thật (`/chat`, chọn "9router - Combo Free", gửi tin nhắn) → kiểm tra `/admin/logs` → 2 dòng log mới nhất có `Token vào: 3,153/3,156`, `Token ra: 13/11`, khác hẳn các dòng log cũ (trước fix) vẫn đúng `0/0/0` — xác nhận không có regression cho dữ liệu cũ, chỉ request mới sau fix mới có số thật.
  3. Tạo 1 `UserApiKey` (`kira_sk_...`) tạm qua API, gọi `curl /v1/chat/completions` với `stream:true` qua key đó, model `9r-route-combo-free` → kiểm tra `/admin/logs` → dòng mới nhất ghi `Token vào: 3,162`, `Token ra: 64` — xác nhận `proxy.js` hoạt động đúng. Đã xoá key test sau khi verify xong.
  4. Anthropic `extractUsage` **chưa verify thật** (đúng như Risk/Unknown 1 đã lường trước — repo không có Anthropic API key cấu hình) — implement bám sát tài liệu chính thức Anthropic Messages API streaming, rủi ro thấp vì đây là format chuẩn ổn định, không phải flag tuỳ chọn.
- **Sai khác so với bản phác thảo ban đầu:** không có — implement khớp đúng thiết kế ở mục 2, kể cả chi tiết "usage đến trên cùng chunk với `finish_reason:'stop'`" đã verify trước khi lên plan.
- **Dọn dẹp:** không tạo file/thay đổi tạm nào còn sót lại ngoài scope; `UserApiKey` test đã xoá sau khi verify.
