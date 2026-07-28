# SPECS.md — Đặc tả kỹ thuật dự án KiraAP

Tài liệu này mô tả **trạng thái thực tế hiện tại** của mã nguồn (không phải kế hoạch dự kiến — xem [feature.md](feature.md) cho tài liệu thiết kế/kế hoạch triển khai ban đầu, một số phần đã lệch so với code hiện tại). Đây là bản đặc tả tổng hợp từ việc đọc toàn bộ `server/` và `public/`.

## 1. Tổng quan

**Kira Agent Platform (KiraAP)** là một web app tự lưu trữ (self-hosted), cho phép một cá nhân/tổ chức triển khai dịch vụ AI của riêng mình (dưới thương hiệu riêng) bằng cách bọc lại (wrap) Google Agent Platform / Vertex AI. Sản phẩm gồm 2 mặt:

- **User-facing**: giao diện SSR (EJS) + JS thuần cho 4 tính năng AI — Chat, Tạo ảnh, Tạo video, TTS — cùng trang quản lý API Key cá nhân và tài liệu API.
- **Admin Panel**: quản lý kho API Key Google (xoay vòng/fallback), người dùng, danh mục model AI, thư viện media, nhật ký sử dụng.

Ngoài ra hệ thống còn cung cấp một **Proxy API tương thích chuẩn OpenAI** (`/v1/...`) để người dùng có thể cắm KiraAP vào các công cụ bên thứ ba (VS Code Continue/Cline, SDK OpenAI, script tự viết...) bằng API Key cá nhân dạng `kira_sk_...`.

## 2. Ngăn xếp công nghệ

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Runtime | Node.js ≥ 18 | |
| Web framework | Express 5 | |
| Database | MongoDB qua Mongoose `^9.8.0` | |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` | Token qua header `Authorization: Bearer` hoặc cookie `token` |
| View engine | EJS + `express-ejs-layouts` | Dùng cho toàn bộ trang SSR (user + admin) |
| Frontend | Vanilla JS ES6+, CSS thuần (custom properties) | Không dùng framework/bundler |
| Upload | `multer` | Lưu file tạm tại `public/uploads/temp/` |
| Bảo mật tầng HTTP | `helmet` (CSP tắt), `cors`, `express-rate-limit` | |
| Logging | `morgan` (dev format) | |
| AI Backend | Google Agent Platform / Vertex AI (REST, gọi trực tiếp bằng `fetch`, không dùng SDK) | Xem `.agents/skills/agent-flatform-api/SKILL.md` |

## 3. Kiến trúc hệ thống

```
Client (browser / công cụ bên thứ ba)
   │
   ├─ SSR pages (EJS)         → server/app.js  → server/views/**
   ├─ /api/**  (JSON, JWT)    → server/routes/api/**   → server/services/** → Google Agent Platform
   ├─ /admin/** (EJS, JWT+role)→ server/routes/admin/** → server/models/**
   └─ /v1/** (JSON, kira_sk_) → server/routes/api/proxy.js → server/services/agentPlatform.js
```

- `server/app.js` khởi tạo Express, kết nối MongoDB (`server/config/database.js`), đăng ký toàn bộ middleware và route, và các route SSR cấp cao (`/`, `/chat`, `/image`, `/video`, `/tts`, `/profile`, `/api-keys`, `/docs`).
- `server/services/agentPlatform.js` là lớp gọi API Google duy nhất — mọi route AI (`chat.js`, `image.js`, `video.js`, `tts.js`, `proxy.js`) đều đi qua đây, không route nào tự gọi Google trực tiếp.
- `server/services/apiKeyManager.js` chọn 1 API Key Google từ pool (cache 5 phút, xoay vòng `sequential` hoặc `random`) cho mỗi lệnh gọi AI.
- `server/services/tokenCounter.js` parse `usageMetadata` từ response Google và ghi `AILog` cho mọi lệnh gọi (thành công lẫn lỗi).

## 4. Mô hình dữ liệu (MongoDB / Mongoose)

| Model | Trường chính | Ghi chú |
|---|---|---|
| **User** | `username`, `email`, `password` (bcrypt, `select:false`), `displayName`, `avatar`, `role: admin\|user`, `isActive` | `pre('save')` tự hash password + set `displayName` mặc định |
| **ApiKey** | `name`, `key`, `projectNumber`, `isActive`, `usageCount`, `lastUsedAt`, `lastError(At)` | Khoá API **Google** dùng nội bộ, quản lý qua Admin Panel — không phải khoá của user |
| **UserApiKey** | `userId`, `name`, `key` (unique, `kira_sk_...`), `isActive`, `usageCount`, `lastUsedAt`, `expiresAt` | Khoá cá nhân do user tự tạo để gọi `/v1/*`; static `generateKey()`, methods `maskedKey()`/`isValid()` |
| **ModelConfig** | `category: text\|image\|video\|tts`, `modelId`, `displayName`, `isDefault`, `isActive`, `systemPrompt`, `parameters {temperature, maxOutputTokens, topP, topK, aspectRatio, voiceName, durationSeconds}` | `pre('save')` đảm bảo chỉ 1 `isDefault=true` mỗi category |
| **Conversation** | `userId`, `title`, `category: chat\|image\|video\|tts`, `lastMessageAt`, `messageCount` | Index `{userId, lastMessageAt}` |
| **Message** | `conversationId`, `role: user\|assistant`, `content`, `mediaUrl`, `mediaType`, `attachments[{fileName, originalName, filePath, mimeType, fileSize}]`, `modelUsed`, `tokenInput`, `tokenOutput` | Index `{conversationId, createdAt}` |
| **Media** | `userId`, `type: image\|video\|audio`, `filePath`, `fileName`, `originalName`, `fileSize`, `mimeType`, `prompt`, `modelUsed`, `width`, `height`, `duration` | Thư viện media cá nhân; index `{userId, type, createdAt}` |
| **Voice** | `voiceId` (unique), `name`, `mappedTo` (tên giọng Gemini thật), `gender`, `description`, `language`, `isActive` | Bảng ánh xạ giọng "kiểu OpenAI" (alloy, echo...) → giọng Gemini thật (Kore, Fenrir...) |
| **AILog** | `userId`, `username`, `modelUsed`, `category: text\|image\|video\|tts`, `prompt`, `responseContent` (truncated), `tokenInput/Output/Total`, `apiKeyName`, `responseTime`, `status: success\|error`, `errorMessage` | Ghi mọi lệnh gọi AI, phục vụ dashboard + xuất CSV; nhiều index cho phân tích theo thời gian/model/category |

## 5. Đặc tả API

Quy ước response nội bộ: `{ success: boolean, message?, data? }`. Proxy `/v1/*` dùng quy ước OpenAI: `{ error: { message, type, code } }` khi lỗi.

### 5.1 Auth — `server/routes/auth.js` (mount tại `/api/auth`)

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/register` | rate-limited | Đăng ký; kiểm tra trùng email/username; trả JWT |
| POST | `/login` | rate-limited | Đăng nhập bằng email **hoặc** username (`account`/`email`/`username`); trả JWT |
| GET | `/me` | JWT | Thông tin user hiện tại |
| PUT | `/profile` | JWT | Cập nhật `displayName`, `avatar` |
| PUT | `/password` | JWT | Đổi mật khẩu (yêu cầu mật khẩu hiện tại đúng, mật khẩu mới ≥ 6 ký tự) |

### 5.2 AI Generation — `server/routes/api/{chat,image,video,tts}.js` (mount tại `/api/ai/*`)

Tất cả yêu cầu JWT + `aiLimiter` (30 req/phút/IP).

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/ai/chat` | Chat streaming (SSE). Nhận `prompt`, `conversationId?`, `modelId?`, tối đa 5 file đính kèm (`files`, ≤20MB/file: ảnh, PDF, TXT, CSV, DOC/DOCX). Tự tạo/tiếp tục `Conversation`, lưu lịch sử 20 tin nhắn gần nhất làm context, stream từng token qua `data: {type: text\|meta\|done\|error}` |
| POST | `/api/ai/image` | Tạo ảnh. Nhận `prompt`, `aspectRatio?`, `modelId?`, `count?` (1–4), tối đa 3 ảnh tham chiếu (`refImages`, ≤10MB/ảnh). Trả `imageUrl(s)` |
| POST | `/api/ai/video` | Khởi tạo tạo video (Long-Running Operation). Nhận `prompt`, `aspectRatio?`, `durationSeconds?`, `modelId?`, 1 file tham chiếu ảnh/video (`refMedia`, ≤50MB). Trả `operationName` để poll |
| POST | `/api/ai/video/status` | Poll trạng thái LRO bằng `operationName` (+ `apiKey`, `projectNumber`, `modelId` do client giữ từ bước khởi tạo). Khi `done`, lưu `Media` + `Message` + ghi `AILog` |
| POST | `/api/ai/tts` | Chuyển văn bản thành giọng nói. Nhận `text` (≤5000 ký tự, cắt bớt nếu dài hơn) hoặc file TXT/PDF (`textFile`, ≤5MB), `voiceName?`, `modelId?`. Trả `audioUrl` (WAV) |

### 5.3 Conversations — `server/routes/api/conversations.js` (mount tại `/api/conversations`, tất cả yêu cầu JWT)

| Method | Path | Mô tả |
|---|---|---|
| GET | `/` | Danh sách hội thoại của user (lọc `category`, phân trang) |
| POST | `/` | Tạo hội thoại mới |
| GET | `/:id/messages` | Toàn bộ tin nhắn của 1 hội thoại (kiểm tra sở hữu) |
| PUT | `/:id` | Đổi tên hội thoại |
| DELETE | `/:id` | Xoá hội thoại + toàn bộ tin nhắn liên quan |

### 5.4 User & User API Keys — `server/routes/api/{user,apiKeys}.js` (mount tại `/api/user`, `/api/user/api-keys`)

| Method | Path | Mô tả |
|---|---|---|
| GET/PUT | `/api/user/profile` | Xem/cập nhật `displayName` |
| GET | `/api/user/media` | Thư viện media cá nhân (lọc `type`, phân trang) |
| DELETE | `/api/user/media/:id` | Xoá 1 media của chính user |
| GET | `/api/user/api-keys` | Danh sách API key cá nhân (đã mask) |
| POST | `/api/user/api-keys` | Tạo key mới dạng `kira_sk_...` — **trả full key đúng 1 lần duy nhất**; giới hạn **tối đa 10 key/user** |
| DELETE | `/api/user/api-keys/:id` | Xoá key (chỉ của chính mình) |

### 5.5 Models & Voices (công khai, không cần auth) — `server/routes/api/models.js` (mount tại `/api/models`)

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/models` | Danh sách model đang `isActive` (lọc theo `category`) cho UI chọn model |
| GET | `/api/models/voices` | Danh sách giọng đọc TTS đang hoạt động |

### 5.6 Proxy API tương thích OpenAI — `server/routes/api/proxy.js` (mount tại `/v1`)

Toàn bộ route yêu cầu `proxyAuth` (không phải JWT) — header `Authorization: Bearer kira_sk_xxxxx`, key phải tồn tại, `isActive`, chưa hết hạn.

| Method | Path | Mô tả |
|---|---|---|
| GET | `/v1/models` | Danh sách model (định dạng OpenAI `object: 'model'`) |
| GET | `/v1/user/profile` | Thông tin user sở hữu key |
| GET | `/v1/user/api-keys` | Danh sách key của user (đã mask) |
| POST | `/v1/chat/completions` | Tương thích OpenAI Chat Completions — hỗ trợ `stream: true` (SSE, định dạng `chat.completion.chunk` chuẩn OpenAI, chunk đầu có `delta.role: "assistant"` để tương thích VS Code Continue/Cline) và non-stream |
| POST | `/v1/images/generations` | Tương thích OpenAI Images — map `size` (`1792x1024`, `1024x1792`...) sang `aspectRatio` Gemini |
| POST | `/v1/audio/speech` | Tương thích OpenAI TTS — stream audio/wav |

Có trang tài liệu API trong ứng dụng tại **`/docs`** (SSR, `server/views/user/docs.ejs`) mô tả chi tiết auth + ví dụ từng endpoint cho end-user.

### 5.7 Admin Panel — `server/routes/admin/*.js` (mount tại `/admin/*`, JWT + `role=admin`)

| Path | Mô tả |
|---|---|
| `GET /admin/login` | Trang đăng nhập admin (không layout) |
| `GET /admin` | Dashboard: tổng số user/API key/model/media, số request hôm nay, tổng token, top 5 model (7 ngày), biểu đồ usage 7 ngày, 10 log gần nhất |
| `/admin/users` | CRUD user: cập nhật `role/isActive/displayName/email/password`; xoá (chặn xoá tài khoản `role=admin`) |
| `/admin/api-keys` | CRUD **kho API Key Google** dùng chung (không phải key của user); xoá key sẽ gọi `apiKeyManager.invalidateCache()` |
| `/admin/models` | CRUD `ModelConfig`, nhóm theo 4 category |
| `/admin/media` | Duyệt/xoá media toàn hệ thống (xoá cả file vật lý lẫn record DB) |
| `/admin/logs` | Xem `AILog` (lọc category/status/username, phân trang); `/admin/logs/export` xuất CSV (giới hạn 5000 dòng, BOM cho Excel); `/admin/logs/api/:id` xem chi tiết |
| `/admin/user-api-keys` | Quản lý tập trung **API Key cá nhân của tất cả user** — bật/tắt, xoá |

### 5.8 Trang SSR người dùng — đăng ký trực tiếp trong `server/app.js`

`/` và `/chat` (Chat), `/image` (Tạo ảnh), `/video` (Tạo video), `/tts` (TTS), `/profile` (Cài đặt tài khoản), `/api-keys` (Quản lý API Key cá nhân), `/docs` (Tài liệu API) — tất cả render qua `layouts/user`.

## 6. Quy tắc nghiệp vụ đáng chú ý

- **Auth token**: đọc theo thứ tự `Authorization: Bearer` → cookie `token`. Trang admin (HTML) bị lỗi auth sẽ `redirect('/admin/login')`; API luôn trả JSON `{success:false, message}`.
- **Rate limit** (`server/middleware/rateLimiter.js`): `aiLimiter` 30 req/phút (mọi endpoint AI), `authLimiter` 10 req/15 phút (register/login), `apiLimiter` 100 req/phút (dùng chung, hiện chưa thấy route nào gắn — xem mục 8).
- **Xoay vòng API Key Google** (`apiKeyManager`): cache danh sách key `isActive` trong 5 phút; chiến lược mặc định `sequential` (round-robin), có thể chuyển `random`; mỗi lần lấy key sẽ tăng `usageCount` bất đồng bộ (không chờ).
- **Chọn model mặc định**: mỗi category (`text/image/video/tts`) có đúng 1 `ModelConfig.isDefault=true` (được ràng buộc ở tầng schema); nếu client không truyền `modelId`, hoặc `modelId` không tồn tại/`isActive=false`, hệ thống dùng model default của category, cuối cùng fallback về hằng số cứng trong code nếu DB trống hoàn toàn.
- **Video LRO**: model `gemini-omni-flash-preview` đi qua endpoint Interactions riêng (`/v1beta1/.../interactions`, trả video ngay — không polling thật, được giả lập bằng `operationName` dạng `omni_direct:...`); các model Veo còn lại dùng `predictLongRunning` + `fetchPredictOperation` polling chuẩn. Bắt buộc phải có `projectNumber` cấu hình cho API Key mới tạo được video.
- **TTS**: nếu response Google trả PCM thô (mimeType chứa `l16`/`pcm`/`wav`), server tự thêm 44-byte WAV header (24kHz, mono, 16-bit) trước khi lưu file `.wav`; ngược lại giữ nguyên định dạng gốc (vd. `.mp3`).
- **Voice mapping**: giọng kiểu OpenAI (`alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`) được map cứng trong `agentPlatform.generateTTS` sang giọng Gemini thật (`Kore`, `Fenrir`, `Aoede`, `Charon`); danh sách đầy đủ + mô tả nằm ở collection `Voice` (seed sẵn 11 giọng, gồm cả 6 tên kiểu OpenAI và 5 tên gốc Gemini).
- **Giới hạn User API Key**: tối đa 10 key/user; full key chỉ hiển thị 1 lần lúc tạo, các lần sau chỉ trả dạng mask `kira_sk_••••••••xxxx`.
- **Ảnh sinh ra**: `count` bị giới hạn về khoảng `[1,4]`; `count>1` chạy song song bằng `Promise.all` gọi API Google riêng lẻ cho từng ảnh (không phải 1 lệnh gọi trả nhiều ảnh).
- **Xoá tài khoản admin**: `DELETE /admin/users/api/:id` chặn cứng nếu `user.role === 'admin'`.

## 7. Tích hợp bên ngoài — Google Agent Platform / Vertex AI

Chi tiết đầy đủ (endpoint, payload mẫu Node/PHP/Python, hướng dẫn) nằm ở [.agents/skills/agent-flatform-api/SKILL.md](.agents/skills/agent-flatform-api/SKILL.md) — không lặp lại ở đây. Danh mục model được seed sẵn (`server/seed.js`):

| Category | Model IDs đã seed | Default |
|---|---|---|
| text | `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-pro`, `gemini-3-flash-preview`, `gemini-2.5-flash`, `gemini-2.5-pro` | `gemini-3.6-flash` |
| image | `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-3-pro-image`, `gemini-2.5-flash-image` | `gemini-3.1-flash-image` |
| video | `veo-3.1-lite-generate-001`, `veo-3.0-generate-001`, `veo-2.0-generate-001`, `gemini-omni-flash-preview` | `veo-3.1-lite-generate-001` |
| tts | `gemini-3.1-flash-tts-preview`, `gemini-2.5-flash-tts`, `gemini-2.5-flash-preview-tts` | `gemini-3.1-flash-tts-preview` |

## 8. Bảo mật & vận hành

- `helmet` chạy với `contentSecurityPolicy: false` và `crossOriginEmbedderPolicy: false` — CSP đang **tắt chủ động**.
- Mật khẩu hash bằng `bcryptjs` (salt rounds = 12), field `password` luôn `select:false` trừ khi truy vấn tường minh (`.select('+password')`).
- Không có test suite, linter hay formatter nào được cấu hình trong repo.
- `apiLimiter` được định nghĩa trong `rateLimiter.js` nhưng — theo rà soát route hiện tại — **chưa được gắn (`use`) vào bất kỳ router nào**; chỉ `aiLimiter` và `authLimiter` đang thực sự hoạt động.
- Triển khai container hoá: [Dockerfile](Dockerfile) (multi-stage, non-root, `node:18-alpine`, đặt ở gốc repo) + [docker/docker-compose.yml](docker/docker-compose.yml) (app + MongoDB). Yêu cầu file `.env` ở gốc repo trước khi `docker compose up`.

## 9. Giới hạn / nợ kỹ thuật đã biết

- `feature.md` là tài liệu kế hoạch/thiết kế **ban đầu** của tác giả gốc (chứa đường dẫn ảnh cục bộ `/Users/huykira/...`) — nhiều phần đã đúng với code hiện tại (models, layout thư mục cốt lõi), nhưng **chưa cập nhật** theo các bổ sung sau này: `UserApiKey`, `Voice`, toàn bộ Proxy API `/v1/*`, trang `/docs`, route `admin/user-api-keys`. Coi `feature.md` là tài liệu lịch sử/tham khảo thiết kế UI, không phải nguồn sự thật cho API hiện tại — dùng tài liệu này (SPECS.md) và [AGENTS.md](AGENTS.md) thay thế.
- Không có cơ chế xoá tự động file trong `public/uploads/temp/` nếu request bị crash giữa chừng trước bước `fs.unlinkSync` (rò rỉ file tạm khi lỗi bất ngờ).
- `apiLimiter` định nghĩa nhưng không dùng (xem mục 8) — có thể là sót khi refactor.
