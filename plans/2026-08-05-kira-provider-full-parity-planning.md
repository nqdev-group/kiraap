---
type: feature
complexity: high
status: planning
related_issues: []
related_prs: []
estimated_hours: ~8
---

# Kế hoạch: Thêm Custom AI Provider "Kira" (kiraai.vn) — full parity text/image/TTS/video

> **Ngày lập kế hoạch:** 2026-08-05
> **Scope dự kiến:** `server/seed.js`, `.env.example` (user tự thêm — xem mục 3), `packages/ai-providers/services/agentPlatformBridge.js`, `packages/ai-providers/services/providerAdapters/openai.js`, `server/services/agentPlatform.js` (3 hook point mới), `packages/ai-providers/views/_model-provider-script.ejs`, `server/views/admin/models.ejs`
> **Priority:** medium

---

## 1. Phân tích / Bối cảnh

User yêu cầu thêm 1 Custom AI Provider mới tên "Kira" (`https://kiraai.vn/`), "tương tự 9router" — nhưng khi đọc tài liệu API (`https://kiraai.vn/documents/`) phát hiện Kira **hỗ trợ nhiều hơn 9router đáng kể**:

| Category | 9router (hiện tại) | Kira (theo doc) |
|---|---|---|
| `text` (chat) | ✅ Có, đã hoạt động (`providerId` set trong seed) | ✅ `/chat/completions`, hỗ trợ streaming |
| `image` | ❌ Đã thêm rồi bị xoá (kiến trúc có hỗ trợ nhưng seed thiếu `providerId` — xem `plans/2026-08-05-seed-9router-nontext-models.md`) | ✅ `/images/generations`, models `kira-3.0-image`/`kira-2.0-image` |
| `tts` | ❌ Không | ✅ `/audio/speech`, models `kira-3.0-flash-tts`/`kira-2.0-flash-tts`, voices Kore/Fenrir/Puck/Charon/Aoede |
| `video` | ❌ Không | ✅ `/videos/generations` (async, 2 bước: submit → poll `/videos/operations/:uuid`), models `kira-3.0-video`/`kira-3.0-video-flash` |

User đã xác nhận (AskUserQuestion) muốn **full parity cả 4 category**, không chỉ dừng ở text/image như 9router hiện có.

**Đối chiếu kiến trúc hiện tại — đây là lý do việc này KHÔNG đơn giản chỉ là "thêm seed":**

- `packages/ai-providers/services/agentPlatformBridge.js` hiện chỉ export `generateText`, `generateTextStream`, `generateImage` — **không có `generateTTS`/`generateVideo`**.
- `server/services/agentPlatform.js` — `generateText()` (dòng 66), `generateTextStream()` (dòng 184), `generateSingleImage()` (dòng 316) đều có nhánh `if (model.providerId) { return aiProvidersBridge... }`. Nhưng **`initiateVideo()` (dòng 468) và `generateTTS()` (dòng 672) hoàn toàn không có nhánh này** — chúng luôn build endpoint Google trực tiếp từ `model.modelId`, bỏ qua `providerId`.
- UI admin cũng đang **hard-code giới hạn** provider selector chỉ cho `text`/`image`:
  - `packages/ai-providers/views/_model-provider-script.ejs:12` — `toggleProviderGroup()`: `(cat === 'text' || cat === 'image')`
  - `server/views/admin/models.ejs:61` — `const showProvider = m.category === 'text' || m.category === 'image';`
- Điều này khớp với gotcha đã ghi sẵn trong `AGENTS.md`: *"Scope is intentionally text (chat) + image categories only ... video/tts remain Google-only"* — đây là giới hạn **chủ động của kiến trúc**, không phải thiếu sót ngẫu nhiên. Mở rộng sang tts/video là **mở rộng kiến trúc thật sự**, không phải chỉ thêm data.

**Điểm khác biệt kỹ thuật giữa Kira TTS và Google TTS (đã biết từ code hiện tại):** Google trả **raw PCM 24kHz 16-bit mono**, phải tự dựng 44-byte WAV header thủ công (`agentPlatform.js:734-765`). Kira dùng endpoint OpenAI-shape `/audio/speech` — theo chuẩn OpenAI thật, endpoint này trả **binary audio (mp3 mặc định)** trực tiếp trong response body, không cần dựng header. **Chưa verify thật** vì repo chưa có `KIRA_API_KEY` — cần test khi có key thật trước khi chốt code (xem mục 4, Unknown 1).

**Điểm cần lưu ý về video polling:** `server/routes/api/video.js` route `/status` **đã** thread `modelId` qua mỗi lần poll (dòng 113, 124) — nghĩa là `pollVideo()` trong `agentPlatform.js` có thể tự resolve lại `ModelConfig` + kiểm tra `providerId` mỗi lần poll, **không cần** trick prefix operationName như case đặc biệt `omni_direct:` (dòng 597) đang dùng cho Gemini Omni. `apiKey`/`projectNumber` mà client gửi kèm khi poll là field riêng của Google — nhánh custom-provider trong `pollVideo()` sẽ tự resolve `ProviderApiKey` mới qua `providerKeyManager.getNextKey()`, bỏ qua 2 field đó, không cần đổi gì ở `video.js` (route này đã generic, chỉ cần `agentPlatform.js` trả đúng shape `{done, videoUrl, mimeType, fileName, fileSize}`).

## 2. Approach / Strategy

Chia làm 3 phase theo độ phức tạp tăng dần, có thể dừng sau mỗi phase nếu cần review:

### Phase 1 — Provider + seed text/image (rẻ, mirror đúng pattern 9router + image đã có bridge sẵn)

- Seed `AIProvider` mới: `name: 'kira'`, `type: 'openai'`, `baseUrl: 'https://kiraai.vn/api/v1'`, `keyRotationStrategy: 'sequential'` — y hệt pattern `9router` trong `server/seed.js`.
- Env var mới: `KIRA_API_KEY` (mirror `NINEROUTER_API_KEY`).
- Seed `ModelConfig` cho `text` (`kira-3.5-flash` làm ví dụ, có thể thêm cả `kira-mini-1.0`/`kira-3.5-pro`/`kira-2.5-pro`/`kira-2.5-flash`) và `image` (`kira-3.0-image`, `kira-2.0-image`) — **nhớ set `providerId`** cho cả 2 category (bài học từ `plans/2026-08-05-seed-9router-nontext-models.md`: thiếu field này là lỗi rất dễ mắc lại).
- **Không cần code mới** — `agentPlatformBridge.generateText/generateTextStream/generateImage` đã tổng quát theo `provider.baseUrl`/`provider.type`, tự động hoạt động với Kira miễn `AIProvider.type = 'openai'` đúng.

### Phase 2 — TTS (độ phức tạp trung bình, single-call)

- `providerAdapters/openai.js`: thêm `generateTTS({ text, voiceName, provider, keyInfo, model })` — POST `${baseUrl}/audio/speech`, đọc response dạng **binary** (`response.arrayBuffer()` → `Buffer`), lấy `mimeType` từ header `Content-Type` (fallback `audio/mpeg`) thay vì parse JSON như các method khác trong file này.
- `agentPlatformBridge.js`: thêm `generateTTS({ text, voiceName, model, user, startTime })` — gọi adapter, tự lưu file vào `public/uploads/audios/`, tự `Media.create()` + `tokenCounter.logUsage()` (self-contained, giống hệt cách `generateImage` trong file này đang làm — **không** tái dùng phần lưu-file/DB của `agentPlatform.js`'s Google-path vì logic đó gắn chặt với xử lý PCM/WAV riêng của Google).
- `server/services/agentPlatform.js`: thêm nhánh `if (model.providerId) { return aiProvidersBridge.generateTTS(...) }` vào đầu `generateTTS()` (dòng 672), **trước** khi build endpoint Google — theo đúng vị trí/pattern các nhánh `providerId` khác trong file.
- Voice mapping: **cần verify thật** — doc nói "OpenAI voice mapping supported" nhưng liệt kê tên voice kiểu Google (Kore/Fenrir/...). Không đoán mapping, để nguyên `voiceName` client gửi pass-through tới Kira và test thật với vài giá trị trước khi quyết định có cần bảng map riêng hay không (xem Unknown 1).

### Phase 3 — Video (phức tạp nhất, async 2 bước)

- `providerAdapters/openai.js`: thêm `generateVideo({ prompt, aspectRatio, durationSeconds, provider, keyInfo, model })` (POST `/videos/generations`, trả về `{ operationId }`) và `pollVideoOperation({ operationId, provider, keyInfo })` (GET `/videos/operations/:uuid`, trả `{ done, videoUrl hoặc videoBase64, mimeType }` — **chưa biết chính xác shape response**, cần verify thật khi có key, xem Unknown 2).
- `agentPlatformBridge.js`: thêm `generateVideo(...)` (submit, trả `{ operationName, modelUsed, apiKeyName }` — **không** trả `apiKey`/`projectNumber` vì đó là field riêng Google, để `undefined`, route hiện tại đã tolerant với việc này) và `pollVideo(...)` (poll, tự resolve lại `ProviderApiKey` qua `providerKeyManager`, tự tải + lưu file video nếu `done`, trả đúng shape `{done, videoUrl, mimeType, fileName, fileSize}` mà `server/routes/api/video.js` đang đọc).
- `server/services/agentPlatform.js`: thêm nhánh `providerId` vào **cả** `initiateVideo()` (dòng 468) và `pollVideo()` (dòng 596). Với `initiateVideo()`, nhánh này phải đặt **trước** đoạn `apiKeyInfo.projectNumber` bắt buộc (dòng 482-485) — key của custom provider không có khái niệm `projectNumber`, nếu không sẽ throw nhầm lỗi "Chưa cấu hình Project Number" cho provider Kira.
- `server/routes/api/video.js`: **không cần sửa** — route đã generic, chỉ cần bridge trả đúng shape.

### Phase 4 — UI admin (nhỏ, đi kèm phase 2+3)

- `packages/ai-providers/views/_model-provider-script.ejs:12`: mở rộng điều kiện `toggleProviderGroup()` thêm `'tts'`, `'video'`.
- `server/views/admin/models.ejs:61`: mở rộng `showProvider` thêm `'tts'`, `'video'`.

## 3. Công việc cần thực hiện (Todo)

- [ ] **Phase 1:** Sửa `server/seed.js` — thêm `AIProvider` "kira", seed model `text`+`image` với `providerId` (nhớ set, không lặp lại lỗi cũ)
- [ ] Thêm `KIRA_API_KEY=your_kira_api_key_here` vào `.env.example` — **user tự thêm tay**, file này bị chặn bởi permission deny rule (đã gặp khi làm plan logger trước đó)
- [ ] Verify Phase 1 thật: chat + tạo ảnh qua model Kira trên UI thật, kiểm tra `AILog`
- [ ] **Phase 2:** Thêm `generateTTS` vào `providerAdapters/openai.js` + `agentPlatformBridge.js`, thêm nhánh `providerId` vào `agentPlatform.js:generateTTS()`
- [ ] Verify Phase 2 thật với `KIRA_API_KEY` thật — xác nhận response `/audio/speech` là binary hay JSON+base64, xác nhận voice nào hoạt động
- [ ] **Phase 3:** Thêm `generateVideo`/`pollVideoOperation` vào `providerAdapters/openai.js`, `generateVideo`/`pollVideo` vào `agentPlatformBridge.js`, nhánh `providerId` vào `agentPlatform.js:initiateVideo()` + `pollVideo()` (đặt trước check `projectNumber`)
- [ ] Verify Phase 3 thật — xác nhận shape response thật của `/videos/generations` và `/videos/operations/:uuid`
- [ ] **Phase 4:** Mở rộng `toggleProviderGroup()` và `showProvider` cho `tts`/`video`
- [ ] Seed model `tts`+`video` cho Kira (chỉ sau khi Phase 2/3 code xong, tránh lặp lại lỗi "seed model chưa có backend hỗ trợ" từng gặp với 9router)
- [ ] Cập nhật `AGENTS.md`: sửa lại câu "Scope is intentionally text (chat) + image categories only ... video/tts remain Google-only" cho khớp trạng thái mới (Kira hỗ trợ đủ 4 category, 9router vẫn chỉ text)

## 4. Risks & Unknowns

- **Unknown 1 (Phase 2):** Chưa có `KIRA_API_KEY` thật để verify format response `/audio/speech` (binary vs JSON) và cách map `voiceName`. → **Plan:** test thật bằng `curl`/script nhỏ (như đã làm với 9router ở `plans/2026-08-05-custom-provider-token-tracking-planning.md`) ngay khi có key, trước khi viết code chính thức — không đoán.
- **Unknown 2 (Phase 3):** Chưa biết chính xác shape JSON của response `/videos/generations` (submit) và `/videos/operations/:uuid` (poll) — doc chỉ mô tả sơ lược "async operation", không có example payload đầy đủ. → **Plan:** test thật trước khi code, tương tự Unknown 1.
- **Risk 1:** `initiateVideo()` hiện bắt buộc `apiKeyInfo.projectNumber` (dòng 482-485) *trước khi* biết `model.providerId` — nếu thêm nhánh `providerId` sai vị trí (sau đoạn check này thay vì trước) sẽ khiến mọi video request qua Kira bị lỗi nhầm "Chưa cấu hình Project Number" dù không liên quan. → **Mitigation:** đặt nhánh `providerId` ngay đầu hàm, trước cả `apiKeyManager.getNextKey()` nếu được (custom-provider path dùng `providerKeyManager` riêng, không cần gọi `apiKeyManager` của Google chút nào).
- **Risk 2:** TTS/Video billing — Kira docs không nói rõ có trả `usage`/token cho audio/video không (thường ảnh/audio/video tính theo đơn vị, không theo token, giống OpenAI Images API hiện tại đang log `tokenInput:0, tokenOutput:0`). → **Mitigation:** mặc định log `0` cho token audio/video (nhất quán với cách `image` đang làm), không suy đoán số liệu.
- **Risk 3:** Mở rộng UI (`toggleProviderGroup`, `showProvider`) cho `tts`/`video` sẽ khiến provider Kira **và** hiển thị luôn cho **cả** những model `tts`/`video` chưa qua Kira (kể cả model Google gốc) — cần đảm bảo default vẫn là "Google (mặc định)" (option rỗng, đã có sẵn trong `providerSelectOptions()`) để không phá model Google hiện có khi admin mở form edit.
- **Risk 4 (kế thừa từ `plans/2026-08-05-seed-9router-nontext-models.md`):** Nếu seed model `tts`/`video` cho Kira **trước khi** Phase 2/3 code xong — lặp lại đúng lỗi đã gặp với 9router (model xuất hiện trong dropdown nhưng gọi thì lỗi runtime). → **Mitigation:** thứ tự Todo đã cố tình đặt "seed model tts+video" ở cuối, sau khi code Phase 2/3 xong và verify — không đảo thứ tự.

## 5. Success Criteria

- Chat + tạo ảnh qua model Kira (`kira-3.5-flash`, `kira-3.0-image`) hoạt động trên UI thật, `AILog` ghi nhận đúng token (đã có token tracking từ `plans/2026-08-05-custom-provider-token-tracking-planning.md`, tự động áp dụng cho Kira vì cùng `type: 'openai'`).
- TTS qua Kira tạo ra file audio phát được thật (không phải file hỏng do sai giả định format response).
- Video qua Kira hoàn thành đúng luồng submit → poll → tải file, không bị lỗi "Chưa cấu hình Project Number".
- 9router không bị ảnh hưởng gì (vẫn chỉ `text`, không tự nhiên "được" hiện tts/video trong dropdown trừ khi admin chủ động seed thêm).
- `AGENTS.md` phản ánh đúng: kiến trúc custom-provider giờ hỗ trợ đủ 4 category (không còn "video/tts remain Google-only" tuyệt đối).

## 6. Questions / Dependencies

- ✅ Đã xác nhận với user (2026-08-05): scope **full parity** (text + image + tts + video), không dừng ở text/image như 9router.
- Cần `KIRA_API_KEY` thật trước khi implement Phase 2/3 (Phase 1 không cần, vì `/chat/completions` và `/images/generations` đã có pattern verify sẵn qua 9router, đủ tin cậy để code trước, test sau).
- Tên hiển thị/`name` của `AIProvider` nên là `'kira'` hay `'kiraai'`? Đề xuất `'kira'` (ngắn, khớp cách gọi của user trong yêu cầu), có thể đổi dễ dàng vì chỉ là 1 string trong seed, không phải quyết định khó đảo ngược.
