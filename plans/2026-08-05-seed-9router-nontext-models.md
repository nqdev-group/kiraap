---
type: bug-fix
complexity: low
impact: medium
related_issues: []
related_prs: []
time_spent_hours: ~0.1
status: completed
---

# Kế hoạch: Thêm rồi bỏ model "9router - Combo Free" cho image/video/tts trong seed data

> **Ngày:** 2026-08-05
> **Phạm vi:** [server/seed.js](../server/seed.js) (chỉ file này)
> **Trạng thái:** ✅ Đã hoàn thành — user chọn phương án xoá cả 3 entry thay vì sửa `providerId`

---

## 1. Bối cảnh

Sau khi implement xong token tracking cho Custom AI Provider (commit `18ca952`, xem `plans/2026-08-05-custom-provider-token-tracking-planning.md`), user tự tay chỉnh `server/seed.js` để thêm model `9r-route-combo-free` (provider `9router`, đã có sẵn trong seed cho category `text`) vào thêm 3 category nữa: `image`, `video`, `tts` — cùng nằm trong commit `18ca952` ("feat: implement token tracking for custom AI providers in streaming chat and enhance logging in proxy route").

## 2. Công việc đã thực hiện

Thêm 3 entry mới vào mảng `defaultModels` trong `seed()`:

- `server/seed.js:169-176` — category `image`, modelId `9r-route-combo-free`, `aspectRatio: '1:1'`.
- `server/seed.js:207-213` — category `video`, modelId `9r-route-combo-free`, `aspectRatio: '16:9', durationSeconds: 4`.
- `server/seed.js:237-243` — category `tts`, modelId `9r-route-combo-free`, `voiceName: 'alloy'`.

**⚠️ Vấn đề phát hiện khi rà lại (chưa sửa, chỉ ghi nhận):** cả 3 entry mới đều **thiếu field `providerId: nineRouterProviderId`** — so với entry `text` cùng modelId ở `server/seed.js:126-134` đã có field này. Đối chiếu với luồng routing trong [server/services/agentPlatform.js](../server/services/agentPlatform.js):

- **`image`** — `generateSingleImage()` (dòng 316) kiểm tra `if (model.providerId)` để rẽ qua `aiProvidersBridge.generateImage`. Vì entry seed thiếu `providerId`, model này sẽ **không** route tới 9router — nó sẽ rơi vào nhánh Google Agent Platform mặc định (dòng 320 trở đi), gửi request tới `aiplatform.googleapis.com` với `modelId: '9r-route-combo-free'` — **model này không tồn tại trên Google Vertex AI**, request sẽ lỗi 400/404 khi có user chọn model này.
- **`video`** — `initiateVideo()` (dòng 468) **không hề có nhánh kiểm tra `providerId`** — luôn build endpoint Google Veo trực tiếp từ `model.modelId`. Custom provider hiện **không hỗ trợ video** (đúng theo `AGENTS.md`: "video/tts remain Google-only"), nên dù có thêm `providerId` vào seed, video vẫn sẽ lỗi tương tự vì kiến trúc hiện tại chưa có `aiProvidersBridge.generateVideo`.
- **`tts`** — `generateTTS()` (dòng 672) cũng **không có nhánh `providerId`**, cùng lý do như video — TTS qua custom provider hiện chưa được implement ở tầng bridge (`agentPlatformBridge.js` chỉ export `generateText/generateTextStream/generateImage`).

Nói cách khác: **cả 3 model mới seed đều sẽ lỗi runtime nếu user chọn dùng**, không phải do thiếu `providerId` đơn thuần mà còn do kiến trúc hiện tại (theo đúng scope đã ghi trong `AGENTS.md`) chủ động giới hạn Custom AI Provider ở `text` + `image` only (Anthropic không có API ảnh nên trước đây `image` custom-provider chỉ test qua OpenAI-type provider) và `video`/`tts` vẫn Google-only.

**Cập nhật (cùng ngày, sau khi báo cáo phát hiện trên):** user tự sửa lại `server/seed.js`, **xoá hẳn cả 3 entry mới** (`image`, `video`, `tts` cho `9r-route-combo-free`) thay vì chỉ thêm `providerId` cho riêng entry `image`. Seed file trở về đúng như trước khi có nhánh thêm 3 category này — chỉ còn giữ lại entry `text` (đã có `providerId` từ trước, hoạt động đúng).

## 3. Files đã thay đổi

| File | Thay đổi |
|---|---|
| [server/seed.js](../server/seed.js) | Thêm rồi xoá 3 entry `defaultModels` cho modelId `9r-route-combo-free` ở category `image`, `video`, `tts` — kết quả cuối: cả 3 đã bị xoá, chỉ còn entry `text` (đúng, có `providerId`) |

## 4. Trạng thái hiện tại

Thay đổi thêm (commit `18ca952`) đã push. Thay đổi xoá lại (revert 3 entry) **hiện đang uncommitted** trên working tree (`git status` báo `server/seed.js` modified) — chưa commit. Diff xác nhận cả 3 block bị xoá sạch, không còn `providerId` half-fix nào sót lại.

Nếu trước đó đã chạy `npm run seed` với data cũ, 3 model lỗi này **vẫn còn trong DB** (`ModelConfig` collection) — seed script chỉ tạo mới (`findOne` + `if (!existing)`), xoá code seed không tự xoá data đã tồn tại trong DB.

## 5. Việc còn mở (chưa làm, để quyết định sau)

- [ ] Commit thay đổi revert này (hiện chưa commit).
- [ ] Nếu đã từng chạy `npm run seed` sau lần thêm ban đầu — cần dọn tay 3 document rác trong `ModelConfig` collection (category `image`/`video`/`tts`, modelId `9r-route-combo-free`), vì xoá seed code không tự xoá data cũ trong DB.
- [ ] Nếu tương lai muốn custom provider hỗ trợ `image` cho 9router thật — nhớ thêm `providerId: nineRouterProviderId` khi seed lại (bài học ở mục 6), video/tts vẫn cần thêm bridge method mới ở tầng kiến trúc trước khi seed được.

## 6. Bài học rút ra

- Khi seed 1 model mới cho category nào đó, cần đối chiếu ngay với nhánh routing tương ứng trong `agentPlatform.js` (`if (model.providerId)` có tồn tại cho category đó không) — không phải category nào cũng đã wire xong custom-provider bridge, dù DB schema (`ModelConfig.providerId`) cho phép set ở bất kỳ category nào.
- `AGENTS.md` đã ghi rõ "Scope is intentionally text (chat) + image categories only" cho Custom AI Provider — bất kỳ thay đổi seed nào thêm `video`/`tts` cho 1 provider custom cần được coi là mở rộng scope (cần xác nhận), không phải chỉ là "thêm data".
- Xoá seed code không dọn data cũ trong DB — cần nhớ kiểm tra/dọn tay nếu seed đã từng chạy với data sai trước khi sửa.
