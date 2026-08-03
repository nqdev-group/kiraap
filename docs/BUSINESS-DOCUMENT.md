# Kira Agent Platform (KiraAP) — Tài liệu Nghiệp vụ & Quy trình

> **Phiên bản tài liệu:** v1.0
> **Ngày phân tích:** 2026-07-28
> **Nguồn:** Phân tích từ codebase tại `D:\nqdev-wps\github\nqdev-group\kiraap`
> **Tech stack:** Node.js (Express 5) + MongoDB (Mongoose) + EJS (SSR) + Vanilla JS

> Repo đã có sẵn [SPECS.md](../SPECS.md) — một bản đặc tả kỹ thuật rất chi tiết viết bởi các phiên làm việc trước. Tài liệu này **kế thừa và tổ chức lại** thông tin đó theo góc nhìn nghiệp vụ (actors, quy trình, business rules) thay vì lặp lại thuần kỹ thuật. Khi có mâu thuẫn, ưu tiên đọc code trực tiếp; `feature.md` là tài liệu thiết kế ban đầu, đã lệch một phần so với hiện trạng (xem mục 9.2).

---

## MỤC LỤC

1. [Tổng quan hệ thống](#1-tổng-quan-hệ-thống)
2. [Kiến trúc kỹ thuật](#2-kiến-trúc-kỹ-thuật)
3. [Domain Model](#3-domain-model)
4. [Actors & Phân quyền](#4-actors--phân-quyền)
5. [Danh sách quy trình nghiệp vụ](#5-danh-sách-quy-trình-nghiệp-vụ)
6. [Chi tiết quy trình](#6-chi-tiết-quy-trình)
7. [API & Tích hợp](#7-api--tích-hợp)
8. [Cấu hình & Triển khai](#8-cấu-hình--triển-khai)
9. [Phụ lục](#9-phụ-lục)

---

## 1. TỔNG QUAN HỆ THỐNG

### 1.1 Mô tả hệ thống

> Nguồn: `README.md`, `AGENTS.md`

**Tên hệ thống:** Kira Agent Platform (KiraAP)
**Mục đích:** Web app tự lưu trữ (self-hosted), cho phép một cá nhân/tổ chức triển khai một "hệ sinh thái AI" thương hiệu riêng cho end-user, bằng cách bọc lại (wrap) Google Agent Platform / Vertex AI (Gemini + Veo), thay vì phụ thuộc trực tiếp vào dịch vụ AI bên thứ ba.
**Phạm vi:** Chat AI đa mô hình, tạo ảnh, tạo video, chuyển văn bản thành giọng nói (TTS), quản trị tập trung (kho API Key, người dùng, model, media, nhật ký), và một Proxy API tương thích chuẩn OpenAI để tích hợp vào công cụ bên thứ ba.
**Môi trường:** Không có staging/production tách biệt trong repo — chỉ có cấu hình qua `NODE_ENV` (`development`/`production`) và Docker Compose để tự triển khai.
**Ngôn ngữ giao diện:** Toàn bộ UI, thông báo lỗi, validation message đều bằng **Tiếng Việt** (quy ước bắt buộc — xem `AGENTS.md`).

### 1.2 Tính năng chính

| # | Tính năng | Mô tả | Trạng thái |
|---|-----------|-------|-----------|
| 1 | Trò chuyện AI (Chat) | Chat streaming (SSE) đa mô hình Gemini, hỗ trợ đính kèm file, lưu lịch sử hội thoại | ✅ Hoạt động |
| 2 | Tạo hình ảnh AI | Text-to-Image / Image-to-Image (ảnh tham chiếu), chọn tỷ lệ khung hình, tạo nhiều ảnh song song | ✅ Hoạt động |
| 3 | Tạo video AI | Text-to-Video / Image-to-Video (Long-Running Operation, polling), Gemini Omni Edit độc quyền | ✅ Hoạt động |
| 4 | Chuyển văn bản thành giọng nói (TTS) | 11 giọng đọc (map kiểu OpenAI ↔ Gemini gốc), xuất file WAV | ✅ Hoạt động |
| 5 | Quản trị kho API Key Google | Thêm/sửa/xoá key, xoay vòng tuần tự/ngẫu nhiên, tự động fallback khi lỗi/hết quota | ✅ Hoạt động |
| 6 | Quản trị người dùng & phân quyền | CRUD user, khoá/mở tài khoản, đổi role | ✅ Hoạt động |
| 7 | Quản trị catalog Model AI | Bật/tắt model, đặt model mặc định theo từng category, cấu hình system prompt & tham số | ✅ Hoạt động |
| 8 | Thư viện Media & Nhật ký AI | Duyệt/xoá media toàn hệ thống, xem/lọc/xuất CSV nhật ký sử dụng AI | ✅ Hoạt động |
| 9 | Proxy API tương thích OpenAI (`/v1`) | User tự tạo API Key cá nhân (`kira_sk_...`) để gọi KiraAP từ VS Code Continue/Cline, SDK OpenAI, script tự viết | ✅ Hoạt động |
| 10 | Trang tài liệu API trong ứng dụng | `/docs` — mô tả cách xác thực & ví dụ gọi từng endpoint Proxy | ✅ Hoạt động |

### 1.3 Hệ thống phụ thuộc (Dependencies)

**External Services:**
- **Google Agent Platform / Vertex AI** — backend AI duy nhất (Gemini text/image/TTS, Veo video), gọi trực tiếp bằng `fetch` (không dùng SDK chính thức của Google). Chi tiết endpoint/payload: `.agents/skills/agent-flatform-api/SKILL.md`.
- **MongoDB** — datastore duy nhất (self-hosted hoặc Atlas).

**Third-party Integrations:**
- **Công cụ dev tương thích OpenAI** (VS Code Continue/Cline, SDK OpenAI chính thức, script tự viết) — kết nối qua Proxy API `/v1/*` bằng API Key cá nhân dạng `kira_sk_...`.

---

## 2. KIẾN TRÚC KỸ THUẬT

### 2.1 Tech Stack

| Layer | Technology | Version | Ghi chú |
|-------|-----------|---------|--------|
| Runtime | Node.js | ≥ v18 (image Docker: `node:18-alpine`) | |
| Framework | Express | ^5.2.1 | |
| Database | MongoDB qua Mongoose | `^9.8.0` — lưu ý đây là major mới hơn v7/v8 phổ biến | |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` | `^9.0.3` / `^3.0.3` | Token đọc theo thứ tự: header `Authorization: Bearer` → cookie `token` |
| View engine | EJS + `express-ejs-layouts` | `^6.0.1` / `^2.5.1` | Dùng cho toàn bộ trang SSR (user + admin) |
| Frontend | Vanilla JS (ES6+), CSS thuần (custom properties) | - | Không framework/bundler |
| Upload | `multer` | `^2.2.0` | File tạm tại `public/uploads/temp/` |
| Bảo mật HTTP | `helmet` (CSP **tắt**), `cors`, `express-rate-limit` | `^8.3.0` / `^2.8.6` / `^8.6.0` | |
| Logging | `morgan` | `^1.11.0` | format `dev` |
| Deploy | Docker (multi-stage) + Docker Compose | - | `Dockerfile` ở gốc repo, `docker/docker-compose.yml` |
| AI Backend | Google Agent Platform / Vertex AI | REST trực tiếp | Không SDK, xem `.agents/skills/agent-flatform-api/SKILL.md` |

### 2.2 Kiến trúc tổng thể

> Nguồn: `SPECS.md` mục 3

```
Client (trình duyệt / công cụ bên thứ ba)
   │
   ├─ SSR pages (EJS)          → server/app.js   → server/views/**
   ├─ /api/**  (JSON, JWT)     → server/routes/api/**   → server/services/** → Google Agent Platform
   ├─ /admin/** (EJS, JWT+role)→ server/routes/admin/** → server/models/**
   └─ /v1/** (JSON, kira_sk_)  → server/routes/api/proxy.js → server/services/agentPlatform.js
```

- `server/app.js` khởi tạo Express, kết nối MongoDB, đăng ký toàn bộ middleware/route, và các route SSR cấp cao.
- `server/services/agentPlatform.js` là **lớp gọi Google duy nhất** — mọi route AI (`chat`, `image`, `video`, `tts`, `proxy`) đều đi qua đây, không route nào tự gọi Google trực tiếp.
- `server/services/apiKeyManager.js` chọn 1 API Key Google từ pool (cache 5 phút, xoay vòng `sequential`/`random`) cho mỗi lệnh gọi AI.
- `server/services/tokenCounter.js` parse `usageMetadata` từ response Google và ghi `AILog` cho mọi lệnh gọi.

### 2.3 Cấu trúc thư mục

> Nguồn: `AGENTS.md`

```
server/
├── app.js                 # Express bootstrap: middleware, route mounting, SSR page routes
├── seed.js                # npm run seed — tạo admin mặc định + catalog model AI
├── config/database.js     # Kết nối Mongoose
├── middleware/
│   ├── auth.js              # JWT auth (header → cookie); redirect trang admin, JSON cho API
│   ├── adminOnly.js          # Gate role==='admin', phải chạy SAU auth
│   ├── proxyAuth.js          # Xác thực Proxy OpenAI-compatible qua UserApiKey (kira_sk_)
│   └── rateLimiter.js        # aiLimiter / authLimiter / apiLimiter
├── models/                  # User, ApiKey, UserApiKey, ModelConfig, Conversation, Message, Media, Voice, AILog
├── routes/
│   ├── auth.js               # /api/auth
│   ├── api/                  # JSON APIs: chat, image, video, tts, conversations, user, apiKeys, models, proxy
│   └── admin/                # EJS admin panel: dashboard, users, apiKeys, models, media, logs, userApiKeys
├── services/
│   ├── agentPlatform.js       # Gọi Google Agent Platform / Vertex AI (Gemini, Veo, TTS)
│   ├── apiKeyManager.js       # Xoay vòng key pool + auto-fallback lỗi/quota
│   └── tokenCounter.js        # Ước tính & ghi log token usage
└── views/                   # EJS: layouts/{admin,user}, admin/*, auth/login, user/*

public/
├── assets/                 # logo, icon, audio mẫu giọng TTS
├── css/, js/                # 1 file / 1 concern, không bundler
└── uploads/                 # media phát sinh (images/videos/audios/temp) — gitignored trừ .gitkeep

.agents/
├── AGENTS.md                 # Quy tắc frontend: không dùng alert()/confirm()/prompt() native
└── skills/agent-flatform-api/SKILL.md  # Tham chiếu tích hợp Google Agent Platform (bắt buộc đọc trước khi sửa code gọi AI)

docker/docker-compose.yml    # app + mongo, build context = gốc repo
Dockerfile                   # multi-stage, non-root, node:18-alpine, EXPOSE 3000 — ở gốc repo
```

---

## 3. DOMAIN MODEL

> Nguồn: `server/models/*.js`

### 3.1 Entities chính

#### Entity: User

| Field | Type | Nullable | Mô tả |
|-------|------|----------|-------|
| `_id` | ObjectId | No | Primary key |
| `username` | String | No (unique, 3–30 ký tự) | Tên đăng nhập |
| `email` | String | No (unique, lowercase) | Email đăng nhập |
| `password` | String | No (`select:false`) | Hash bcrypt (salt rounds = 12) |
| `displayName` | String | Yes (≤50 ký tự) | Mặc định = `username` nếu bỏ trống |
| `avatar` | String | Yes | Đường dẫn ảnh đại diện |
| `role` | Enum `admin\|user` | No (default `user`) | Phân quyền |
| `isActive` | Boolean | No (default `true`) | Khoá tài khoản khi `false` |
| `createdAt`/`updatedAt` | DateTime | No | timestamps |

> Nguồn: `server/models/User.js`

#### Entity: ApiKey (Kho API Key Google — nội bộ, do Admin quản lý)

| Field | Type | Nullable | Mô tả |
|-------|------|----------|-------|
| `_id` | ObjectId | No | Primary key |
| `name` | String | No | Tên gợi nhớ |
| `key` | String | No | API Key Google Gemini/Vertex AI |
| `projectNumber` | String | Yes | Project Number Google Cloud — **bắt buộc** để dùng Veo/Omni |
| `isActive` | Boolean | No (default `true`) | Bật/tắt trong vòng xoay |
| `usageCount` | Number | No (default 0) | Số lần đã dùng |
| `lastUsedAt` | DateTime | Yes | |
| `lastError`/`lastErrorAt` | String/DateTime | Yes | Lỗi gần nhất (429/quota...) |

> Nguồn: `server/models/ApiKey.js` — **Không phải khoá của user**, khác hẳn `UserApiKey`.

#### Entity: UserApiKey (Khoá cá nhân của user — dùng cho Proxy API)

| Field | Type | Nullable | Mô tả |
|-------|------|----------|-------|
| `_id` | ObjectId | No | Primary key |
| `userId` | ObjectId → User | No | Chủ sở hữu |
| `name` | String | No (≤100 ký tự) | Tên gợi nhớ |
| `key` | String | No (unique) | Dạng `kira_sk_<64 hex>` |
| `isActive` | Boolean | No (default `true`) | |
| `usageCount` | Number | No (default 0) | |
| `lastUsedAt` | DateTime | Yes | |
| `expiresAt` | DateTime | Yes (`null` = vĩnh viễn) | |

> Nguồn: `server/models/UserApiKey.js` — static `generateKey()`, methods `maskedKey()` (chỉ hiện 4 ký tự cuối), `isValid()`.

#### Entity: ModelConfig (Catalog model AI)

| Field | Type | Nullable | Mô tả |
|-------|------|----------|-------|
| `_id` | ObjectId | No | Primary key |
| `category` | Enum `text\|image\|video\|tts` | No | Nhóm chức năng |
| `modelId` | String | No | ID model thật gọi tới Google (vd. `gemini-3.6-flash`) |
| `displayName` | String | No | Tên hiển thị trên UI |
| `isDefault` | Boolean | No | Đúng 1 bản ghi `true`/category (ràng buộc ở `pre('save')`) |
| `isActive` | Boolean | No (default `true`) | Ẩn/hiện trên UI chọn model |
| `systemPrompt` | String | Yes | Chỉ dùng cho `text` |
| `parameters` | Object | - | `temperature, maxOutputTokens, topP, topK, aspectRatio, voiceName, durationSeconds` |

> Nguồn: `server/models/ModelConfig.js`

#### Entity: Conversation

| Field | Type | Nullable | Mô tả |
|-------|------|----------|-------|
| `_id` | ObjectId | No | Primary key |
| `userId` | ObjectId → User | No | Chủ sở hữu |
| `title` | String | No (default "Cuộc trò chuyện mới", ≤200) | |
| `category` | Enum `chat\|image\|video\|tts` | No (default `chat`) | |
| `lastMessageAt` | DateTime | No | Dùng để sắp xếp danh sách |
| `messageCount` | Number | No (default 0) | |

> Nguồn: `server/models/Conversation.js` — index `{userId, lastMessageAt: -1}`.

#### Entity: Message

| Field | Type | Nullable | Mô tả |
|-------|------|----------|-------|
| `_id` | ObjectId | No | Primary key |
| `conversationId` | ObjectId → Conversation | No | |
| `role` | Enum `user\|assistant` | No | |
| `content` | String | Yes (default '') | |
| `mediaUrl`/`mediaType` | String/Enum | Yes | `''\|image\|video\|audio` |
| `attachments` | Array<{fileName, originalName, filePath, mimeType, fileSize}> | Yes | File đính kèm của message `user` |
| `modelUsed` | String | Yes | |
| `tokenInput`/`tokenOutput` | Number | No (default 0) | |

> Nguồn: `server/models/Message.js` — index `{conversationId, createdAt}`.

#### Entity: Media (Thư viện cá nhân)

| Field | Type | Nullable | Mô tả |
|-------|------|----------|-------|
| `_id` | ObjectId | No | Primary key |
| `userId` | ObjectId → User | No | |
| `type` | Enum `image\|video\|audio` | No | |
| `filePath`/`fileName`/`originalName` | String | No/No/Yes | |
| `fileSize`/`mimeType` | Number/String | Yes | |
| `prompt`/`modelUsed` | String | Yes | |
| `width`/`height`/`duration` | Number | Yes | |

> Nguồn: `server/models/Media.js` — index `{userId, type, createdAt}`.

#### Entity: Voice (Bảng ánh xạ giọng đọc TTS)

| Field | Type | Nullable | Mô tả |
|-------|------|----------|-------|
| `voiceId` | String | No (unique) | Tên "kiểu OpenAI" hoặc tên gốc Gemini |
| `name` | String | No | Tên hiển thị |
| `mappedTo` | String | No | Tên giọng Gemini thật sự được gọi |
| `gender`/`description`/`language` | String | Yes | |
| `isActive` | Boolean | No (default `true`) | |

> Nguồn: `server/models/Voice.js`

#### Entity: AILog (Nhật ký sử dụng AI)

| Field | Type | Nullable | Mô tả |
|-------|------|----------|-------|
| `_id` | ObjectId | No | Primary key |
| `userId`/`username` | ObjectId → User / String | No/Yes | |
| `modelUsed`/`category` | String/Enum | No | `text\|image\|video\|tts` |
| `prompt` (≤1000)/`responseContent` (≤2000) | String | Yes | Bị cắt bớt độ dài |
| `tokenInput`/`tokenOutput`/`tokenTotal` | Number | No (default 0) | |
| `apiKeyName` | String | Yes | Tên key Google đã dùng |
| `responseTime` | Number | No (ms) | |
| `status` | Enum `success\|error` | No | |
| `errorMessage` | String | Yes | |

> Nguồn: `server/models/AILog.js` — nhiều index phục vụ dashboard/phân tích theo thời gian, user, category, model.

### 3.2 Quan hệ giữa các Entity

```
User 1 ──── N Conversation
Conversation 1 ──── N Message
User 1 ──── N Media
User 1 ──── N UserApiKey
User 1 ──── N AILog

ApiKey (kho Google, độc lập)      — dùng nội bộ bởi apiKeyManager, không có FK trực tiếp
ModelConfig (catalog, độc lập)    — tham chiếu bằng string modelId trong Message/Media/AILog (không FK)
Voice (catalog, độc lập)          — voiceId "kiểu OpenAI" ánh xạ sang tên giọng Gemini thật (mappedTo)
```

| Quan hệ | Mô tả |
|--------|-------|
| User → Conversation | Một user có nhiều cuộc hội thoại, phân loại theo `category` (chat/image/video/tts) |
| Conversation → Message | Một hội thoại có nhiều tin nhắn xen kẽ `user`/`assistant` |
| User → Media | Thư viện media cá nhân (ảnh/video/audio đã tạo) |
| User → UserApiKey | Tối đa 10 khoá cá nhân/user để gọi Proxy API |
| User → AILog | Mọi lệnh gọi AI (thành công lẫn lỗi) đều được ghi log gắn với user |

### 3.3 Enums / Trạng thái

#### User.role

| Giá trị | Mô tả |
|--------|-------|
| `user` | Người dùng thường — dùng 4 tính năng AI, quản lý hội thoại/media/API key cá nhân |
| `admin` | Quản trị viên — toàn quyền `/admin/*`, không thể tự xoá tài khoản admin qua UI |

#### Conversation.category / Message.role / Media.type / AILog.category

| Giá trị | Mô tả |
|--------|-------|
| `chat` / `text` | Trò chuyện văn bản |
| `image` | Tạo ảnh |
| `video` | Tạo video |
| `tts` | Chuyển văn bản thành giọng nói |

#### AILog.status

| Giá trị | Mô tả |
|--------|-------|
| `success` | Gọi AI thành công |
| `error` | Gọi AI thất bại — `errorMessage` lưu chi tiết |

---

## 4. ACTORS & PHÂN QUYỀN

### 4.1 Danh sách Actors

| Actor | Mô tả | Xác thực |
|-------|-------|--------|
| `User` (khách/người dùng đăng ký) | Dùng Chat/Image/Video/TTS, quản lý hội thoại/media/profile/API key cá nhân | JWT (header `Bearer` hoặc cookie `token`) |
| `Admin` | Quản trị toàn hệ thống: kho API Key Google, catalog Model, người dùng, media, nhật ký, API key cá nhân của mọi user | JWT + `role === 'admin'` (middleware `auth` → `adminOnly`, theo đúng thứ tự) |
| `External Tool` (công cụ bên thứ ba) | Gọi KiraAP như một backend tương thích OpenAI (VS Code Continue/Cline, SDK OpenAI, script tự viết) | `UserApiKey` cá nhân (`Authorization: Bearer kira_sk_...`), không dùng JWT |
| `System` (nội bộ, không phải actor con người) | Xoay vòng/fallback API Key Google (`apiKeyManager`), ghi log token (`tokenCounter`) cho mọi lệnh gọi AI | Chạy nội bộ trong tiến trình Node, không qua HTTP |

> Không có actor "System" dạng cron/scheduled job thực sự trong repo — mọi tác vụ nền là các thao tác đồng bộ/async trong cùng request (không tìm thấy bằng chứng về `node-cron`/`bull`/queue trong `package.json`).

### 4.2 Ma trận phân quyền

| Resource | User | Admin | External Tool (Proxy) |
|----------|------|-------|------------------------|
| Chat/Image/Video/TTS (khởi tạo) | Execute (của chính mình) | Execute (như một user đã đăng nhập) | Execute (qua `/v1/*`, gắn với user sở hữu key) |
| Hội thoại & tin nhắn của chính mình | CRUD | - | - |
| Media của chính mình | CRUD | R + D (toàn hệ thống, `/admin/media`) | - |
| Profile & đổi mật khẩu của chính mình | RU | - | R (chỉ `/v1/user/profile`) |
| API Key cá nhân (`UserApiKey`) của chính mình | CRUD (tối đa 10 key) | R + toggle `isActive` + D (của **mọi** user, `/admin/user-api-keys`) | R (`/v1/user/api-keys`, chỉ của chính mình) |
| Kho API Key Google (`ApiKey`) | - | CRUD | - |
| Catalog Model (`ModelConfig`) | R (chỉ `isActive=true`) | CRUD | R (chỉ `isActive=true`, qua `/v1/models`) |
| Catalog Voice | R (chỉ `isActive=true`) | - (không có route admin CRUD riêng cho Voice — xem mục 9.2) | - |
| Người dùng (`User`) | - | CRUD (chặn xoá `role=admin`) | - |
| Nhật ký AI (`AILog`) | - | R + Export CSV | - |

> CRUD = Create/Read/Update/Delete; R = Read only; RU = Read/Update; - = Không có quyền.

---

## 5. DANH SÁCH QUY TRÌNH NGHIỆP VỤ

| # | Tên quy trình | Actor | Trigger | Kết quả |
|---|--------------|-------|---------|--------|
| WF-001 | Đăng ký tài khoản | User | `POST /api/auth/register` | Tạo `User` mới + trả JWT |
| WF-002 | Đăng nhập | User | `POST /api/auth/login` | Xác thực + trả JWT |
| WF-003 | Trò chuyện AI (Chat streaming) | User | `POST /api/ai/chat` | Stream SSE nội dung trả lời, lưu `Message`, ghi `AILog` |
| WF-004 | Tạo hình ảnh AI | User | `POST /api/ai/image` | 1–4 ảnh được sinh, lưu `Message`, trả `imageUrls` |
| WF-005 | Tạo video AI (LRO) | User | `POST /api/ai/video` + poll `POST /api/ai/video/status` | Video được sinh (bất đồng bộ), lưu `Media` + `Message` khi `done` |
| WF-006 | Chuyển văn bản thành giọng nói | User | `POST /api/ai/tts` | File WAV được tạo, lưu `Message`, trả `audioUrl` |
| WF-007 | Quản lý hội thoại | User | `GET/POST/PUT/DELETE /api/conversations` | CRUD hội thoại + tin nhắn liên quan |
| WF-008 | Quản lý API Key cá nhân | User | `POST/DELETE /api/user/api-keys` | Tạo/xoá `UserApiKey` (giới hạn 10 key) |
| WF-009 | Gọi Proxy API tương thích OpenAI | External Tool | `POST /v1/chat/completions`, `/v1/images/generations`, `/v1/audio/speech` | Kết quả trả về theo format chuẩn OpenAI |
| WF-010 | Xoay vòng & fallback API Key Google | System | Mỗi lệnh gọi AI (nội bộ) | Chọn 1 `ApiKey` từ pool, đánh dấu lỗi nếu thất bại |
| WF-011 | Quản trị kho API Key Google | Admin | `/admin/api-keys` | CRUD `ApiKey`, invalidate cache pool |
| WF-012 | Quản trị catalog Model AI | Admin | `/admin/models` | CRUD `ModelConfig`, đặt model mặc định/category |
| WF-013 | Quản trị người dùng | Admin | `/admin/users` | Cập nhật role/trạng thái/thông tin, xoá user (trừ admin) |
| WF-014 | Quản trị Media toàn hệ thống | Admin | `/admin/media` | Duyệt/xoá media (file vật lý + record DB) |
| WF-015 | Xem & xuất Nhật ký AI | Admin | `/admin/logs`, `/admin/logs/export` | Lọc log theo category/status/username, xuất CSV (≤5000 dòng) |
| WF-016 | Quản trị API Key cá nhân của mọi user | Admin | `/admin/user-api-keys` | Bật/tắt, xoá key của bất kỳ user nào |
| WF-017 | Seed dữ liệu khởi tạo | Admin (vận hành) | `npm run seed` | Tạo admin mặc định + seed catalog Model & Voice |

---

## 6. CHI TIẾT QUY TRÌNH

---

### WF-001/002: Đăng ký & Đăng nhập

**Mô tả:** Xác thực dựa trên JWT; đăng nhập chấp nhận cả email lẫn username.
**Actor:** User
**Trigger:** `POST /api/auth/register` hoặc `POST /api/auth/login`
**Nguồn code:** `server/routes/auth.js`

#### Điều kiện tiên quyết
- Rate-limit `authLimiter` (10 lần / 15 phút / IP) áp dụng cho cả 2 endpoint — chống brute-force.

#### Luồng chính — Đăng ký

```
Bước 1: User gửi POST /api/auth/register
         Input: { username, email, password, displayName? }

Bước 2: Kiểm tra trùng email → trùng username (2 query riêng biệt, tuần tự)

Bước 3: Tạo User mới
         → Mongoose pre('save') hook: hash password (bcrypt, salt=12),
           set displayName = username nếu bỏ trống

Bước 4: Sinh JWT (jwt.sign({id: userId}, JWT_SECRET, {expiresIn: JWT_EXPIRES_IN || '7d'}))

Bước 5: Trả về { success:true, data:{ token, user:{...} } }
```

#### Luồng chính — Đăng nhập

```
Bước 1: User gửi POST /api/auth/login
         Input: { account|email|username, password }
         (dùng field đầu tiên có giá trị trong 3 field, theo thứ tự account → email → username)

Bước 2: Tìm User theo $or:[{email},{username}] kèm .select('+password')
         (password mặc định select:false)

Bước 3: Kiểm tra isActive → nếu false, chặn 403

Bước 4: So sánh password bằng bcrypt.compare

Bước 5: Sinh JWT, trả về { success:true, data:{ token, user:{...} } }
```

#### Luồng ngoại lệ

| Tình huống | Điều kiện | Xử lý |
|-----------|----------|-------|
| Email/username đã tồn tại | Đăng ký | `400 { success:false, message }` |
| ValidationError của Mongoose | Đăng ký (vd. username < 3 ký tự) | `400`, gộp tất cả message lỗi bằng `, ` |
| Sai tài khoản/mật khẩu | Đăng nhập | `401`, message chung (không tiết lộ email/username tồn tại hay không) |
| Tài khoản bị khoá (`isActive=false`) | Đăng nhập | `403 { message: 'Tài khoản của bạn đã bị khoá' }` |
| Quá 10 lần thử/15 phút | Cả 2 | `429` (theo `authLimiter`) |

#### Business Rules
- **Rule 1:** Password luôn bị hash bằng bcrypt (12 salt rounds) trước khi lưu, không bao giờ lưu plaintext.
- **Rule 2:** `displayName` mặc định = `username` nếu không truyền — set trong `pre('save')`, không phải ở tầng route.
- **Rule 3:** JWT không có cơ chế refresh/blacklist — hết hạn (`JWT_EXPIRES_IN`, mặc định 7 ngày) là phải đăng nhập lại; không có logout server-side (client tự xoá token).

---

### WF-003: Trò chuyện AI (Chat streaming)

**Mô tả:** Chat với model Gemini qua streaming SSE, hỗ trợ đính kèm file, tự động lưu lịch sử.
**Actor:** User
**Trigger:** `POST /api/ai/chat` (JWT + `aiLimiter`)
**Nguồn code:** `server/routes/api/chat.js`, `server/services/agentPlatform.js`

#### Điều kiện tiên quyết
- Có ít nhất `prompt` hoặc 1 file đính kèm.
- File đính kèm (`files`, tối đa 5): ảnh JPG/PNG/WEBP/GIF, PDF, TXT, CSV, DOC/DOCX, ≤20MB/file.

#### Luồng chính

```
Bước 1: User gửi POST /api/ai/chat (multipart/form-data)
         Input: { prompt?, conversationId?, modelId?, files[]? }

Bước 2: Tạo mới hoặc lấy lại Conversation (theo conversationId + userId)
         Nếu không có → tạo mới với title = 100 ký tự đầu của prompt, category='chat'

Bước 3: Đọc từng file đính kèm → base64 → gộp vào mảng attachments
         → Lưu metadata file (attachmentsMeta) → xoá file temp ngay sau khi đọc

Bước 4: Lưu Message role='user' (content + attachmentsMeta)

Bước 5: Lấy 20 message gần nhất của Conversation làm lịch sử (history),
         convert sang định dạng Gemini { role, parts:[{text}] }

Bước 6: Mở kết nối SSE (Content-Type: text/event-stream), gửi { type:'meta', conversationId }

Bước 7: Gọi agentPlatform.generateTextStream({prompt, history, attachments, modelId, user})
         → Đọc từng chunk qua ReadableStream, parse JSON, forward { type:'text', content }
         → Song song, parse usageMetadata (token input/output) từ chunk cuối

Bước 8: Khi stream kết thúc:
         → Lưu Message role='assistant' (fullText, modelUsed, tokenInput/Output)
         → Cập nhật Conversation.lastMessageAt + messageCount += 2
         → Ghi AILog (tokenCounter.logUsage), status='success'
         → Gửi { type:'done', tokenInput, tokenOutput } rồi đóng kết nối
```

#### Luồng ngoại lệ

| Tình huống | Điều kiện | Xử lý |
|-----------|----------|-------|
| Thiếu cả prompt và file | Trước khi tạo conversation | `400 { message: 'Vui lòng nhập tin nhắn hoặc đính kèm file' }` |
| File không đúng định dạng cho phép | Multer `fileFilter` | Lỗi từ multer, request bị từ chối |
| Lỗi trong lúc stream (Google trả lỗi/mạng) | Sau khi đã mở SSE | Gửi `{ type:'error', message }` qua SSE rồi đóng kết nối (không set lại HTTP status vì header đã gửi) |
| Vượt `aiLimiter` (30 req/phút) | Trước xử lý | `429` |

#### Business Rules
- **Rule 1:** Chỉ 20 tin nhắn gần nhất được dùng làm context lịch sử — không giới hạn theo token, chỉ theo số lượng message.
- **Rule 2:** File temp bị xoá ngay sau khi đọc thành base64 — nếu request crash giữa chừng trước bước này, file rò rỉ trong `public/uploads/temp/` (nợ kỹ thuật đã biết, xem `SPECS.md` mục 9).
- **Rule 3:** Nếu client không truyền `modelId`, hệ thống dùng model `text` có `isDefault=true` trong DB, cuối cùng fallback về hằng số cứng trong code nếu DB trống.

---

### WF-004: Tạo hình ảnh AI

**Mô tả:** Sinh 1–4 ảnh từ prompt, có thể kèm tối đa 3 ảnh tham chiếu (Image-to-Image).
**Actor:** User
**Trigger:** `POST /api/ai/image` (JWT + `aiLimiter`)
**Nguồn code:** `server/routes/api/image.js`

#### Luồng chính

```
Bước 1: User gửi POST /api/ai/image (multipart)
         Input: { prompt, aspectRatio?, modelId?, conversationId?, count?, refImages[]? }

Bước 2: Validate prompt bắt buộc

Bước 3: Đọc tối đa 3 refImages → base64 → xoá file temp

Bước 4: Tạo/lấy Conversation (category='image') → lưu Message role='user'

Bước 5: Gọi agentPlatform.generateImage({prompt, refImages, aspectRatio, count(1-4), modelId, user})
         → count > 1: gọi Google song song bằng Promise.all cho từng ảnh riêng lẻ
           (không phải 1 lệnh gọi trả về nhiều ảnh)

Bước 6: Với MỖI ảnh trả về, lưu 1 Message role='assistant' riêng
         (mediaUrl, tokenInput/Output chia đều theo số ảnh)

Bước 7: Cập nhật Conversation.messageCount += (1 + số ảnh)

Bước 8: Trả { imageUrl, imageUrls[], textResponse, conversationId, modelUsed }
```

#### Business Rules
- **Rule 1:** `count` bị ép về khoảng `[1,4]`.
- **Rule 2:** Token input/output của mỗi lượt gọi được **chia đều** cho số ảnh khi lưu vào từng `Message` (không phải token thật của riêng ảnh đó).

---

### WF-005: Tạo video AI (Long-Running Operation)

**Mô tả:** Video generation là tác vụ bất đồng bộ dài hạn (LRO) — client phải chủ động poll trạng thái.
**Actor:** User
**Trigger:** `POST /api/ai/video` (khởi tạo) → `POST /api/ai/video/status` (poll, lặp lại)
**Nguồn code:** `server/routes/api/video.js`

#### Luồng chính

```
Bước 1: User gửi POST /api/ai/video
         Input: { prompt, aspectRatio?, durationSeconds?, modelId?, refMedia? (ảnh/video, ≤50MB) }

Bước 2: Tạo/lấy Conversation (category='video') → lưu Message role='user'

Bước 3: Gọi agentPlatform.initiateVideo(...) → trả operationName + apiKey + projectNumber
         (client phải giữ 3 giá trị này để dùng lại ở bước poll)

Bước 4: Trả về { operationName, modelUsed, conversationId, apiKey, projectNumber }

--- Client lặp lại định kỳ ---

Bước 5: User (client) gửi POST /api/ai/video/status
         Input: { operationName, modelId?, apiKey, projectNumber, conversationId? }

Bước 6: agentPlatform.pollVideo(...) kiểm tra trạng thái LRO trên Google

Bước 7: Nếu done=true:
         → Lưu Media (type='video', filePath, fileName, prompt, modelUsed)
         → Nếu có conversationId: lưu Message role='assistant' (mediaUrl, mediaType='video')
           + cập nhật Conversation
         → Ghi AILog (category='video', status='success')

Bước 8: Trả { success:true, data: result } (result.done cho biết đã xong hay chưa)
```

#### Business Rules
- **Rule 1:** Model `gemini-omni-flash-preview` đi qua endpoint Interactions riêng (trả video ngay, polling được **giả lập** bằng `operationName` dạng `omni_direct:...`); các model Veo dùng `predictLongRunning` + `fetchPredictOperation` polling thật.
- **Rule 2:** Bắt buộc phải có `projectNumber` cấu hình cho `ApiKey` Google mới tạo được video (Veo/Omni).
- **Rule 3:** `durationSeconds` giới hạn theo model: `veo-3.1-lite`/`veo-3.0` chấp nhận `[4,6,8]`s; `veo-2.0` chấp nhận `[5,6,7,8]`s (xem `.agents/skills/agent-flatform-api/SKILL.md`).
- **Rule 4:** Client (frontend) chịu trách nhiệm giữ state `apiKey`/`projectNumber`/`operationName` giữa các lần poll — server không lưu trạng thái LRO đang chờ.

---

### WF-006: Chuyển văn bản thành giọng nói (TTS)

**Mô tả:** Sinh audio WAV từ văn bản (nhập trực tiếp hoặc từ file TXT/PDF).
**Actor:** User
**Trigger:** `POST /api/ai/tts` (JWT + `aiLimiter`)
**Nguồn code:** `server/routes/api/tts.js`

#### Luồng chính

```
Bước 1: User gửi POST /api/ai/tts
         Input: { text?, voiceName?, modelId?, conversationId?, textFile? (TXT/PDF, ≤5MB) }

Bước 2: Nếu có textFile → đọc nội dung file, ghi đè lên `text`, xoá file temp

Bước 3: Validate text không rỗng; nếu > 5000 ký tự → cắt còn 5000

Bước 4: Tạo/lấy Conversation (category='tts') → lưu Message role='user' (content=text)

Bước 5: Gọi agentPlatform.generateTTS({text, voiceName (default 'Kore'), modelId, user})
         → Voice "kiểu OpenAI" (alloy/echo/fable/onyx/nova/shimmer) map cứng sang
           giọng Gemini thật (Kore/Fenrir/Aoede/Charon)
         → Nếu Google trả PCM thô (mimeType chứa l16/pcm/wav): tự thêm 44-byte WAV
           header (24kHz, mono, 16-bit) trước khi lưu .wav

Bước 6: Lưu Message role='assistant' (mediaUrl=audioUrl, mediaType='audio')
         → Cập nhật Conversation.messageCount += 2

Bước 7: Trả { audioUrl, conversationId, modelUsed }
```

#### Business Rules
- **Rule 1:** Giới hạn cứng 5000 ký tự/lần — phần vượt quá bị cắt bỏ âm thầm (không báo lỗi cho user).
- **Rule 2:** Bảng ánh xạ giọng đầy đủ (11 giọng: 6 tên "kiểu OpenAI" + 5 tên gốc Gemini) nằm ở collection `Voice`, seed sẵn qua `server/seed.js`.

---

### WF-008: Quản lý API Key cá nhân (cho Proxy API)

**Mô tả:** User tự tạo/xoá API Key riêng để gọi KiraAP như một dịch vụ tương thích OpenAI.
**Actor:** User
**Trigger:** `GET/POST/DELETE /api/user/api-keys`
**Nguồn code:** `server/routes/api/apiKeys.js`, `server/models/UserApiKey.js`

#### Luồng chính — Tạo key

```
Bước 1: User gửi POST /api/user/api-keys
         Input: { name }

Bước 2: Validate name không rỗng

Bước 3: Đếm số key hiện có của user → nếu ≥ 10 → chặn tạo mới

Bước 4: Sinh key: UserApiKey.generateKey() → 'kira_sk_' + 32 bytes random hex

Bước 5: Tạo bản ghi UserApiKey (userId, name, key)

Bước 6: Trả về FULL key — CHỈ 1 LẦN DUY NHẤT tại thời điểm tạo
         (các lần GET sau chỉ trả dạng mask 'kira_sk_••••••••xxxx')
```

#### Business Rules
- **Rule 1:** Tối đa **10 key/user**.
- **Rule 2:** Full key chỉ hiển thị đúng 1 lần lúc tạo — đây là quy ước bảo mật giống các nền tảng API key thương mại (Stripe, OpenAI...); nếu user làm mất key phải xoá và tạo lại.
- **Rule 3:** User chỉ được xoá key của chính mình (`findOneAndDelete({_id, userId})`).

---

### WF-009: Gọi Proxy API tương thích OpenAI

**Mô tả:** Cho phép công cụ bên thứ ba (không biết gì về KiraAP) gọi thẳng vào KiraAP bằng giao thức chuẩn OpenAI.
**Actor:** External Tool
**Trigger:** `POST /v1/chat/completions` | `POST /v1/images/generations` | `POST /v1/audio/speech` | `GET /v1/models` | `GET /v1/user/profile` | `GET /v1/user/api-keys`
**Nguồn code:** `server/routes/api/proxy.js`, `server/middleware/proxyAuth.js`

#### Điều kiện tiên quyết
- Header `Authorization: Bearer kira_sk_xxxxx` — key phải tồn tại, `isActive=true`, chưa hết hạn (`expiresAt`).
- **Không dùng JWT** — toàn bộ router `use(proxyAuth)` thay vì `auth`.

#### Luồng chính — `POST /v1/chat/completions`

```
Bước 1: proxyAuth xác thực UserApiKey → gắn req.user, req.apiKey
         → tăng usageCount + lastUsedAt bất đồng bộ (không chờ)

Bước 2: Convert messages[] định dạng OpenAI → Gemini:
         - role='system'/'developer' → gộp vào systemPrompt
         - role='user' → history.push({role:'user', parts})
         - role='assistant'/'model' → history.push({role:'model', parts})
         - content có thể là string HOẶC array parts (hỗ trợ payload phức tạp
           từ VS Code Continue/Cline) → extractMessageText() chuẩn hoá

Bước 3: Tách prompt = tin nhắn user CUỐI CÙNG; phần còn lại = history gửi cho Gemini

Bước 4: Nếu stream=true:
         → Header SSE chuẩn OpenAI (chat.completion.chunk)
         → Chunk đầu tiên LUÔN có delta.role='assistant' (để tương thích
           VS Code Continue/Cline — quy ước riêng, không phải chuẩn OpenAI gốc)
         → Forward từng đoạn text từ Gemini, chunk cuối finish_reason='stop',
           kết thúc bằng 'data: [DONE]\n\n'
         Ngược lại (stream=false):
         → Gọi generateText (không stream) → trả 1 object chat.completion
           kèm usage {prompt_tokens, completion_tokens, total_tokens}
```

#### Luồng chính — `POST /v1/images/generations` & `POST /v1/audio/speech`
- Map field `size` (OpenAI, vd. `1792x1024`) sang `aspectRatio` (Gemini, vd. `16:9`).
- `/v1/audio/speech` trả **stream file audio/wav trực tiếp** (không phải JSON) nếu file đã lưu thành công trên đĩa; ngược lại trả JSON `{url}`.

#### Business Rules
- **Rule 1:** Error shape của toàn bộ `/v1/*` theo chuẩn OpenAI `{ error: { message, type, code } }` — **khác** với error shape nội bộ `{ success:false, message }` của `/api/*`.
- **Rule 2:** `req.user` gắn từ chủ sở hữu `UserApiKey` — mọi conversation/message/media/log sinh ra qua Proxy API vẫn thuộc về user đó, dùng chung dữ liệu với giao diện web.
- **Rule 3:** Route `/v1/*` **không** áp `aiLimiter`/`authLimiter` (khác với `/api/ai/*`) — không tìm thấy rate-limit riêng cho Proxy API trong code (xem mục 9.2, điểm mở).

---

### WF-010: Xoay vòng & fallback API Key Google (System)

**Mô tả:** Cơ chế nội bộ chọn 1 trong nhiều `ApiKey` Google cho mỗi lệnh gọi AI, giúp phân tải quota và tự động dùng key dự phòng khi gặp lỗi.
**Actor:** System
**Trigger:** Mọi lệnh gọi trong `agentPlatform.js` (chat/image/video/tts) — nội bộ, không phải HTTP endpoint.
**Nguồn code:** `server/services/apiKeyManager.js`

#### Luồng chính

```
Bước 1: refreshKeys() — nếu cache (5 phút) đã hết hạn, load lại toàn bộ
         ApiKey có isActive=true từ MongoDB vào bộ nhớ (this.keys)

Bước 2: getNextKey(strategy):
         - 'sequential' (mặc định): round-robin theo this.currentIndex
         - 'random': chọn ngẫu nhiên trong danh sách

Bước 3: Tăng usageCount + lastUsedAt của key được chọn (bất đồng bộ, không chờ)

Bước 4: Trả { key, projectNumber, name, _id } cho agentPlatform sử dụng

--- Khi lệnh gọi Google thất bại (429/lỗi khác) ---
Bước 5: markKeyError(keyId, errorMessage) — ghi lastError/lastErrorAt vào ApiKey
         (KHÔNG tự động tắt isActive hay retry với key khác trong cùng request —
          xem Business Rule 2)
```

#### Business Rules
- **Rule 1:** Nếu không có `ApiKey` nào `isActive=true` trong DB, mọi lệnh gọi AI ném lỗi ngay `'Không có API Key nào được cấu hình...'`.
- **Rule 2:** `markKeyError` chỉ **ghi nhận** lỗi để admin xem trong trang quản trị — không tự động loại key khỏi vòng xoay hay tự retry sang key khác trong cùng lượt gọi (không phải "auto-fallback" theo nghĩa retry tức thời, dù README mô tả là "tự động chuyển sang API Key dự phòng"). Việc loại bỏ key lỗi là **thao tác thủ công** của Admin (tắt `isActive` tại `/admin/api-keys`).
- **Rule 3:** Xoá 1 `ApiKey` ở `/admin/api-keys` sẽ gọi `apiKeyManager.invalidateCache()` để buộc load lại danh sách ngay, thay vì chờ hết 5 phút cache.

---

## 7. API & TÍCH HỢP

### 7.1 API Overview

**Base URL nội bộ:** `/api/**` (JSON, JWT) · `/admin/**` (EJS, JWT + role admin) · `/v1/**` (JSON, API Key cá nhân)
**Authentication:** JWT (`Authorization: Bearer` hoặc cookie `token`) cho `/api`, `/admin`; `Authorization: Bearer kira_sk_...` cho `/v1`
**Content-Type:** `application/json` (trừ upload dùng `multipart/form-data`, và `/v1/audio/speech` trả `audio/wav`)
**Error shape:** `{ success:false, message }` (nội bộ) vs `{ error:{ message, type, code } }` (Proxy `/v1`, chuẩn OpenAI)

### 7.2 Danh sách Endpoints

> Nguồn: `server/app.js`, `server/routes/**`

#### Auth — mount `/api/auth`

| Method | Endpoint | Auth | Mô tả |
|--------|---------|------|-------|
| `POST` | `/api/auth/register` | rate-limited | Đăng ký |
| `POST` | `/api/auth/login` | rate-limited | Đăng nhập (email hoặc username) |
| `GET` | `/api/auth/me` | JWT | Thông tin user hiện tại |
| `PUT` | `/api/auth/profile` | JWT | Cập nhật `displayName`, `avatar` |
| `PUT` | `/api/auth/password` | JWT | Đổi mật khẩu |

#### AI Generation — mount `/api/ai/*` (JWT + `aiLimiter` 30 req/phút)

| Method | Endpoint | Mô tả |
|--------|---------|-------|
| `POST` | `/api/ai/chat` | Chat streaming SSE, tối đa 5 file đính kèm |
| `POST` | `/api/ai/image` | Tạo 1–4 ảnh, tối đa 3 ảnh tham chiếu |
| `POST` | `/api/ai/video` | Khởi tạo video (LRO), 1 file tham chiếu |
| `POST` | `/api/ai/video/status` | Poll trạng thái video |
| `POST` | `/api/ai/tts` | Chuyển văn bản → giọng nói |

#### Conversations — mount `/api/conversations` (JWT)

| Method | Endpoint | Mô tả |
|--------|---------|-------|
| `GET` | `/` | Danh sách hội thoại (lọc `category`, phân trang) |
| `POST` | `/` | Tạo hội thoại mới |
| `GET` | `/:id/messages` | Toàn bộ tin nhắn của 1 hội thoại |
| `PUT` | `/:id` | Đổi tên hội thoại |
| `DELETE` | `/:id` | Xoá hội thoại + tin nhắn liên quan |

#### User & User API Keys (JWT)

| Method | Endpoint | Mô tả |
|--------|---------|-------|
| `GET`/`PUT` | `/api/user/profile` | Xem/cập nhật `displayName` |
| `GET` | `/api/user/media` | Thư viện media cá nhân |
| `DELETE` | `/api/user/media/:id` | Xoá 1 media của chính mình |
| `GET` | `/api/user/api-keys` | Danh sách key cá nhân |
| `POST` | `/api/user/api-keys` | Tạo key mới (trả full 1 lần) |
| `DELETE` | `/api/user/api-keys/:id` | Xoá key |

#### Models & Voices — mount `/api/models` (công khai, không auth)

| Method | Endpoint | Mô tả |
|--------|---------|-------|
| `GET` | `/api/models` | Model đang `isActive` (lọc `category`) |
| `GET` | `/api/models/voices` | Giọng đọc TTS đang hoạt động |

#### Proxy API tương thích OpenAI — mount `/v1` (API Key cá nhân)

| Method | Endpoint | Mô tả |
|--------|---------|-------|
| `GET` | `/v1/models` | Danh sách model, format OpenAI |
| `GET` | `/v1/user/profile` | Thông tin user sở hữu key |
| `GET` | `/v1/user/api-keys` | Danh sách key của user (mask) |
| `POST` | `/v1/chat/completions` | Chat Completions (stream + non-stream) |
| `POST` | `/v1/images/generations` | Images generations |
| `POST` | `/v1/audio/speech` | TTS, trả stream audio/wav |

#### Admin Panel — mount `/admin/*` (JWT + `role=admin`)

| Method | Endpoint | Mô tả |
|--------|---------|-------|
| `GET` | `/admin/login` | Trang đăng nhập admin (không layout) |
| `GET` | `/admin` | Dashboard tổng quan |
| `GET` | `/admin/users` | Trang danh sách user |
| `PUT` | `/admin/users/api/:id` | Cập nhật user |
| `DELETE` | `/admin/users/api/:id` | Xoá user (chặn nếu `role=admin`) |
| `GET` | `/admin/api-keys` | Trang danh sách kho API Key Google |
| `POST` | `/admin/api-keys/api` | Thêm API Key |
| `PUT` | `/admin/api-keys/api/:id` | Sửa API Key |
| `DELETE` | `/admin/api-keys/api/:id` | Xoá API Key (invalidate cache pool) |
| `GET` | `/admin/models` | Trang danh sách Model |
| `POST` | `/admin/models/api` | Thêm Model |
| `PUT` | `/admin/models/api/:id` | Sửa Model |
| `DELETE` | `/admin/models/api/:id` | Xoá Model |
| `GET` | `/admin/media` | Trang thư viện media toàn hệ thống |
| `DELETE` | `/admin/media/api/:id` | Xoá 1 media (file + record) |
| `GET` | `/admin/logs` | Trang nhật ký AI (lọc/phân trang) |
| `GET` | `/admin/logs/export` | Xuất CSV (≤5000 dòng, có BOM cho Excel) |
| `GET` | `/admin/logs/api/:id` | Chi tiết 1 log |
| `GET` | `/admin/user-api-keys` | Trang quản lý key cá nhân của mọi user |
| `PUT` | `/admin/user-api-keys/api/:id` | Bật/tắt key |
| `DELETE` | `/admin/user-api-keys/api/:id` | Xoá key |

#### Trang SSR người dùng — đăng ký trực tiếp trong `server/app.js`

| Method | Endpoint | Trang |
|--------|---------|-------|
| `GET` | `/`, `/chat` | Trò chuyện |
| `GET` | `/image` | Tạo hình ảnh |
| `GET` | `/video` | Tạo video |
| `GET` | `/tts` | Tạo giọng nói |
| `GET` | `/profile` | Cài đặt tài khoản |
| `GET` | `/api-keys` | Quản lý API Key cá nhân |
| `GET` | `/docs` | Tài liệu API (mô tả Proxy `/v1/*` cho end-user) |

### 7.3 Webhook & Events

> Không tìm thấy bằng chứng về webhook/event pub-sub nào trong codebase — mọi giao tiếp là request/response hoặc SSE (chat) / polling (video LRO).

### 7.4 Tích hợp bên ngoài

| Service | Mục đích | Config Key |
|---------|--------|-----------|
| Google Agent Platform / Vertex AI | Backend AI (Gemini text/image/TTS, Veo video) | Quản lý runtime qua Admin Panel (`ApiKey.key`, `ApiKey.projectNumber`), **không phải** biến môi trường |
| MongoDB | Datastore | `MONGODB_URI` |

> Chi tiết endpoint/payload gọi Google: [`.agents/skills/agent-flatform-api/SKILL.md`](../.agents/skills/agent-flatform-api/SKILL.md) — không lặp lại ở đây theo đúng quy ước của `AGENTS.md`.

---

## 8. CẤU HÌNH & TRIỂN KHAI

### 8.1 Environment Variables

> Nguồn: `.env.example` (đã xác minh trực tiếp qua `git show HEAD:.env.example`) — khớp hoàn toàn với mô tả trong `README.md`/`AGENTS.md`

| Biến | Ví dụ | Bắt buộc | Mô tả |
|-----|-------|---------|-------|
| `PORT` | `3001` | No (default nội bộ `3000`) | Port server |
| `NODE_ENV` | `development`/`production` | ✅ | Môi trường |
| `MONGODB_URI` | `mongodb://localhost:27017/kiraapDB` | ✅ | Kết nối MongoDB |
| `JWT_SECRET` | (chuỗi ngẫu nhiên) | ✅ | Khoá ký JWT |
| `JWT_EXPIRES_IN` | `7d` | No (default `'7d'` trong code) | Thời hạn JWT |
| `ADMIN_EMAIL` | `admin@kiraap.com` | ✅ (dùng khi seed) | Email admin mặc định |
| `ADMIN_PASSWORD` | `Admin@123` | ✅ (dùng khi seed) | Mật khẩu admin mặc định |
| `ADMIN_USERNAME` | `admin` | ✅ (dùng khi seed) | Username admin mặc định |

> **Lưu ý quan trọng:** API Key Google (Gemini/Vertex AI) và Project Number **không** cấu hình qua biến môi trường — được quản lý hoàn toàn runtime qua Admin Panel (`/admin/api-keys`), lưu trong collection `ApiKey`.

### 8.2 Database Setup

```bash
# Seed dữ liệu khởi tạo (admin mặc định + catalog Model/Voice)
npm run seed
```

### 8.3 Chạy ứng dụng

```bash
# Cài dependencies
npm install

# Development (nodemon)
npm run dev

# Production
npm start

# Docker (build từ Dockerfile gốc repo + docker/docker-compose.yml)
docker compose -f docker/docker-compose.yml up --build
# Sau lần chạy đầu tiên, seed dữ liệu trong container:
docker compose -f docker/docker-compose.yml exec app npm run seed
```

> Docker Compose yêu cầu file `.env` tại **gốc repo** trước khi chạy (`env_file: ../.env`). `docker/docker-compose.yml` override `MONGODB_URI` để trỏ vào service `mongo` nội bộ và cố định `PORT=3000`.

### 8.4 Background Jobs / Cron

> Không có bằng chứng về cron job hay hàng đợi (queue) trong codebase. `apiKeyManager` dùng cache in-memory tự làm mới theo TTL (5 phút) khi có request tới, không phải scheduled job độc lập.

---

## 9. PHỤ LỤC

### 9.1 Glossary (Thuật ngữ)

| Thuật ngữ | Định nghĩa |
|----------|-----------|
| LRO (Long-Running Operation) | Tác vụ bất đồng bộ dài hạn của Google (video generation) — client phải poll `operationName` để biết khi nào xong |
| `ApiKey` | Khoá API **Google** dùng chung, quản lý bởi Admin, dùng trong mọi lệnh gọi AI nội bộ |
| `UserApiKey` | Khoá cá nhân dạng `kira_sk_...` do user tự tạo, dùng để gọi Proxy API `/v1/*` |
| Proxy API | Lớp tương thích OpenAI (`/v1/*`) cho phép công cụ bên thứ ba gọi KiraAP như thể gọi OpenAI |
| Xoay vòng key (key rotation) | Cơ chế chọn luân phiên 1 trong nhiều `ApiKey` Google cho mỗi lệnh gọi, giúp phân tải quota |
| Omni Direct | Cách gọi video qua model `gemini-omni-flash-preview` — trả kết quả ngay, không polling thật, giả lập bằng `operationName` tiền tố `omni_direct:` |

### 9.2 Câu hỏi còn mở (Open Questions)

Các điểm chưa xác định được rõ ràng hoặc có dấu hiệu chưa hoàn thiện trong codebase:

- [ ] `apiLimiter` được định nghĩa trong `server/middleware/rateLimiter.js` nhưng **không được gắn** (`use`) vào bất kỳ router nào — có thể là rate-limit dự định cho `/v1/*` hoặc các route chung nhưng bị sót khi refactor.
- [ ] Không tìm thấy route CRUD dành cho `Voice` trong `server/routes/admin/*` — catalog giọng đọc hiện chỉ có thể sửa qua `npm run seed` hoặc thao tác DB trực tiếp; chưa rõ đây là tính năng chưa làm hay có chủ đích.
- [ ] README mô tả cơ chế API Key là "tự động chuyển sang API Key dự phòng nếu gặp lỗi hoặc hết quota", nhưng đọc code (`apiKeyManager.markKeyError`) cho thấy hệ thống chỉ **ghi nhận lỗi**, không tự động retry sang key khác trong cùng lượt gọi hay tự tắt `isActive` — cần làm rõ với đội phát triển gốc liệu đây là hành vi dự định hay tài liệu README đang mô tả chưa chính xác.
- [ ] Không có test suite, linter hay formatter nào được cấu hình (không có `.eslintrc*`, `.prettierrc*`, script `test`) — không thể xác minh hành vi bằng test tự động.
- [ ] `feature.md` là tài liệu thiết kế/kế hoạch UI ban đầu (chứa đường dẫn ảnh cục bộ của tác giả gốc), một số phần (models, layout thư mục cốt lõi) vẫn đúng nhưng **chưa cập nhật** theo các bổ sung sau này: `UserApiKey`, `Voice`, toàn bộ Proxy API, trang `/docs`, `admin/user-api-keys`. Không nên dùng `feature.md` làm nguồn sự thật cho API hiện tại.
- [x] ~~`.env.example` không đọc được trực tiếp...~~ Đã xác minh trực tiếp (2026-08-03, qua `git show HEAD:.env.example`) — bảng biến môi trường ở mục 8.1 khớp 100% với file thật, không có sai lệch.

### 9.3 Files đã phân tích

| File | Mục đích |
|------|--------|
| `README.md` | Tổng quan dự án, tính năng, hướng dẫn cài đặt |
| `AGENTS.md` | Tri thức dự án chuẩn hoá: stack, cấu trúc, quy ước, gotchas |
| `SPECS.md` | Đặc tả kỹ thuật chi tiết hiện trạng codebase (nguồn tham chiếu chính) |
| `feature.md` | Tài liệu thiết kế/kế hoạch UI ban đầu (một phần đã lỗi thời) |
| `CHANGELOG.md` | Lịch sử thay đổi |
| `.agents/AGENTS.md` | Quy tắc frontend: không dùng dialog native |
| `package.json` | Dependencies & scripts |
| `server/app.js` | Bootstrap Express, mounting toàn bộ route |
| `server/models/*.js` (9 file) | Toàn bộ schema MongoDB |
| `server/middleware/*.js` (4 file) | auth, adminOnly, proxyAuth, rateLimiter |
| `server/routes/auth.js` | Đăng ký/đăng nhập/đổi mật khẩu |
| `server/routes/api/*.js` (9 file) | chat, image, video, tts, conversations, user, apiKeys, models, proxy |
| `server/routes/admin/*.js` (7 file) | dashboard, users, apiKeys, models, media, logs, userApiKeys |
| `server/services/*.js` (3 file) | agentPlatform (đọc chữ ký hàm), apiKeyManager, tokenCounter |
| `server/seed.js` | Dữ liệu khởi tạo: admin, catalog Model, catalog Voice |
| `Dockerfile`, `docker/docker-compose.yml` | Triển khai container |

### 9.4 Lịch sử tài liệu

| Ngày | Phiên bản | Thay đổi |
|------|----------|---------|
| 2026-07-28 | v1.0 | Tạo mới từ phân tích codebase, tổ chức theo góc nhìn nghiệp vụ (actors, workflows, business rules) dựa trên `SPECS.md` + đọc trực tiếp source code |
