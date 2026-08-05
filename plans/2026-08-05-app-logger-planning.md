---
type: feature
complexity: medium
status: completed
related_issues: []
related_prs: []
estimated_hours: ~4
---

# Kế hoạch: Bổ sung structured logger (application-level) cho hệ thống

> **Ngày lập kế hoạch:** 2026-08-05
> **Scope dự kiến:** `packages/logger/` (**mới**), `server/app.js`, `server/config/database.js`, `server/seed.js`, các route/service/middleware hiện có console.log/console.error (~20 file), `Dockerfile`, `docker/docker-compose.yml`, `.env.example`, `.gitignore`, `AGENTS.md`
> **Priority:** medium

---

## 1. Phân tích / Bối cảnh

Hiện tại hệ thống **không có logger ứng dụng thực sự** — chỉ có 2 cơ chế rời rạc:

1. **`morgan('dev')`** (`server/app.js:44`) — log HTTP access theo format màu mè cho terminal, chỉ ghi ra stdout, không lưu file, không tách theo level, không dùng được ở production (không parse được, không rotate).
2. **`console.log` / `console.error` rải rác** — 45 lời gọi trên ~20 file (`server/app.js`, `server/seed.js`, tất cả route trong `server/routes/api/*` và `server/routes/auth.js`, `server/middleware/proxyAuth.js`, `server/services/apiKeyManager.js`, `packages/mongo-connect-retry/index.js`...). Không có level (error/warn/info/debug), không có timestamp nhất quán, không có cách filter/tìm kiếm, và **mất hoàn toàn khi container restart** vì không ghi file, không mount volume.

Lưu ý: `AILog` model (`server/models/AILog.js`) + trang `/admin/logs` là **nhật ký nghiệp vụ AI usage** (token, model, response time...) lưu trong MongoDB — đây là một concern hoàn toàn khác, **không nằm trong scope của kế hoạch này** và không bị đụng tới.

**Phát hiện quan trọng khi khảo sát:** `Dockerfile` hiện tại **không `COPY packages ./packages`** vào runtime image (chỉ copy `server` và `public`) — nghĩa là `@packages/*` (dùng bởi `mongo-connect-retry` và `ai-providers` ngay bây giờ) **đang bị thiếu trong image production**, một lỗ hổng có sẵn từ trước, không liên quan trực tiếp tới logger nhưng **sẽ chặn cứng** package `logger` mới hoạt động trong Docker nếu không sửa cùng lúc.

## 2. Approach / Strategy

**Thư viện:** đề xuất **`winston`** + **`winston-daily-rotate-file`** (không phải `pino`).
- Lý do chọn: ecosystem quen thuộc, transport `DailyRotateFile` cắm thẳng vào (rotate theo ngày + giữ N ngày, tự xoá file cũ), API level-based (`error/warn/info/http/debug`) rất khớp với các `console.error`/`console.log` đang có sẵn — migrate gần như 1-1.
- Vì sao không chọn `pino`: nhanh hơn nhưng output mặc định là JSON thuần (cần `pino-pretty` riêng cho dev), và app này không có yêu cầu throughput cao (self-hosted, single instance) nên lợi thế tốc độ của pino không đáng để đánh đổi độ quen thuộc/dễ đọc. Đây là quyết định có thể review lại nếu sau này cần.

**Cấu trúc code — tuân thủ quy ước `packages/` isolation (xem `AGENTS.md` mục "packages/ isolation"):**

```
packages/logger/
├── index.js       # tạo winston instance (console + 2 file transport: combined + error-only), export logger
└── httpLogger.js  # middleware thay thế morgan — stream request access-log vào logger.http()
```

`server/app.js` (file gốc, upstream) chỉ bị chạm ở **đúng 1 điểm nối tối giản**: thay `require('morgan')` + `app.use(morgan('dev'))` bằng `require('@packages/logger/index.js')` + `app.use(httpLogger)`, và đổi 4 dòng `console.log`/`console.error` (banner khởi động + error handler) sang gọi `logger.*` — giống hệt pattern đã áp dụng cho `mongo-connect-retry`.

**Vấn đề mở cần quyết định khi implement — swap 45 `console.*` còn lại trong các file route/service/middleware:** đây là những file *đã tồn tại từ project gốc*. Theo đúng nghĩa đen của quy ước `packages/` thì không nên thêm logic mới vào đó, nhưng đổi `console.error(x, y)` → `logger.error(x, y)` không phải logic mới — chỉ là đổi hàm gọi, số dòng/diff tối thiểu. Precedent tương tự đã được chấp nhận ở Risk 3 của `plans/2026-08-03-packages-isolation-planning.md` (sửa trực tiếp vài dòng trong hàm dùng chung thay vì extract toàn bộ). Đề xuất: chấp nhận đổi trực tiếp, giữ diff mỗi dòng ở mức tối thiểu (chỉ đổi tên hàm, giữ nguyên message/tham số) để giảm rủi ro conflict khi merge từ `main-forked`.

**Format log:**
- Console: colorized, human-readable ở `NODE_ENV=development`; JSON ở `production` (dễ ingest nếu sau này đưa vào ELK/Loki).
- File: luôn JSON (`logs/combined-YYYY-MM-DD.log`, `logs/error-YYYY-MM-DD.log`), rotate hàng ngày, **giữ tối đa 7 ngày** cho cả 2 loại file (`maxFiles: '7d'` trong `winston-daily-rotate-file`) — file cũ hơn 7 ngày tự động bị xoá.
- **Không log dữ liệu nhạy cảm**: API key thật, JWT, mật khẩu, `Authorization` header — không bao giờ log nguyên `req.body`/`req.headers`, chỉ log các field cụ thể cần thiết (giống nguyên tắc "no-secrets-in-telemetry" của `observability-skill`).

## 3. Công việc cần thực hiện (Todo)

- [ ] Thêm `winston` + `winston-daily-rotate-file` vào `dependencies` trong `package.json`
- [ ] Tạo `packages/logger/index.js` — winston instance: level từ `LOG_LEVEL` env (mặc định `debug` khi dev, `info` khi production), console transport (format theo `NODE_ENV`), 2 `DailyRotateFile` transport (combined + error-only, `maxFiles: '7d'`), `exceptionHandlers`/`rejectionHandlers` để bắt uncaught error/unhandled rejection
- [ ] Tạo `packages/logger/httpLogger.js` — middleware dùng `morgan` với `stream` trỏ vào `logger.http()` (giữ format access-log quen thuộc nhưng đi qua logger để có timestamp/level/file nhất quán)
- [ ] Sửa `server/app.js`: thay khối `morgan` bằng `httpLogger`, thay banner khởi động + error handler (`console.log`/`console.error`) bằng `logger.info`/`logger.error` — đúng 1 điểm nối
- [ ] Sửa `server/config/database.js` → `packages/mongo-connect-retry/index.js`: đổi `console.log`/`console.error` sang `logger.*` (file này vốn đã ở trong `packages/`, không vướng quy ước)
- [ ] Migrate 45 `console.error`/`console.log` còn lại trong `server/seed.js`, `server/routes/api/*.js`, `server/routes/auth.js`, `server/routes/admin/dashboard.js`, `server/middleware/proxyAuth.js`, `server/services/apiKeyManager.js` sang `logger.error`/`logger.info` (diff tối thiểu, xem lưu ý ở mục 2)
- [ ] Thêm `logs/` vào `.gitignore` (kèm `.gitkeep` nếu cần giữ thư mục rỗng trong git)
- [ ] **Sửa `Dockerfile`**: thêm `COPY packages ./packages` (song song với `server`/`public`) và `mkdir -p logs && chown -R node:node` — vừa fix lỗ hổng có sẵn (packages/ thiếu trong image) vừa cho phép user `node` (non-root) ghi được file log
- [ ] Thêm volume `../logs:/app/logs` vào `docker/docker-compose.yml` (giống cách `public/uploads` đã được mount) để log không mất khi container restart/rebuild
- [ ] Thêm `LOG_LEVEL=debug` vào `.env.example` (kèm comment giải thích giá trị hợp lệ: error/warn/info/http/debug)
- [ ] Cập nhật `AGENTS.md`: thêm dòng `logger/` vào bảng "Danh sách package hiện có" trong `packages/README.md`, và thêm 1 bullet ngắn dưới "Conventions" về quy ước dùng logger (level nào dùng khi nào, cấm log secrets)
- [ ] Verify thủ công: chạy `npm run dev`, gọi thử vài route (kể cả 1 route lỗi cố ý) → kiểm tra console format đẹp + file `logs/*.log` sinh ra đúng JSON; build lại Docker image → xác nhận `@packages/logger` resolve được (không còn `MODULE_NOT_FOUND`) và `logs/` ghi được dưới user `node`

## 4. Risks & Unknowns

- **Risk 1 (nghiêm trọng, có sẵn từ trước):** `Dockerfile` không copy `packages/` vào runtime image → mọi `@packages/*` (kể cả `logger` mới lẫn `mongo-connect-retry`/`ai-providers` đang chạy) có nguy cơ throw `MODULE_NOT_FOUND` trong image production hiện tại. → **Mitigation:** sửa `Dockerfile` như todo ở trên; nên verify bằng 1 lần build+run Docker thật trước khi coi việc này là xong, vì đây có thể là bug đang âm thầm tồn tại độc lập với logger.
- **Risk 2:** User `node` (non-root, set ở cuối `Dockerfile`) cần quyền ghi vào `logs/` — nếu quên `chown` sẽ lỗi `EACCES` khi container chạy thật dù chạy `npm run dev` ở local (chạy bằng user hiện tại) vẫn OK. → **Mitigation:** thêm `mkdir -p logs && chown -R node:node /app` cùng chỗ với `public/uploads` hiện có.
- **Risk 3:** Rò rỉ dữ liệu nhạy cảm (API key, JWT, prompt/response người dùng chứa PII) vào file log text tồn tại lâu dài (khác với console log bay mất khi restart). → **Mitigation:** quy ước rõ ràng "không log nguyên object request/response", chỉ log field cụ thể; review lại các message hiện có khi migrate (vd. `proxyAuth.js` không được log key thật).
- **Risk 4:** Đổi 45 dòng rải trên nhiều file gốc (upstream) → tăng khả năng conflict khi merge `main-forked` sau này. → **Mitigation:** diff tối giản (chỉ đổi tên hàm gọi), không refactor thêm gì khác trong cùng lần sửa.
- **Unknown 1:** Có cần request correlation ID (gắn 1 ID theo mỗi request để trace xuyên suốt streaming/proxy) ngay ở phiên bản đầu không? → **Plan:** đề xuất **để sau** (stretch goal), vì hiện chưa có nhu cầu cụ thể và làm tăng scope đáng kể; chỉ implement level+file+rotation trước.
- ~~Unknown 2: retention~~ — ✅ đã chốt (2026-08-05): **giữ tối đa 7 ngày** cho cả `combined` và `error` log, file cũ hơn tự xoá.

## 5. Success Criteria

- Toàn bộ `console.log`/`console.error` trong `server/` và `packages/` (trừ các trường hợp bootstrap trước khi logger init xong, nếu có) được thay bằng logger có level.
- Log xuất hiện cả ở console (đọc được, có màu ở dev) và ở file rotate dưới `logs/` — hoạt động đúng cả khi chạy `npm run dev` local lẫn trong Docker container.
- Không log lộ secret nào (API key, JWT, mật khẩu) — kiểm tra bằng cách grep `logs/*.log` sau khi test luồng đăng nhập + gọi AI.
- `docker compose -f docker/docker-compose.yml up --build` chạy được, không lỗi `MODULE_NOT_FOUND` cho bất kỳ `@packages/*` nào, và `logs/` ghi được file (không lỗi `EACCES`).
- `AGENTS.md`/`packages/README.md` phản ánh đúng package `logger/` mới.

## 6. Questions / Dependencies

- ✅ Đã xác nhận với user (2026-08-05): dùng **winston** (thay vì pino) theo rationale ở mục 2.
- ✅ Đã xác nhận với user (2026-08-05): ghi log ra file, retention **7 ngày**.
- Có cần triển khai correlation ID ngay trong lần này hay để version sau (khuyến nghị: để sau)?
- Việc sửa `Dockerfile` để fix Risk 1 có nên tách thành 1 commit/PR riêng (vì bản chất là fix 1 bug có sẵn, không phải feature logger) hay gộp chung? Đề xuất gộp chung vì nếu không fix thì tính năng logger không chạy được trong Docker — nhưng nên ghi rõ trong commit message đây là 2 việc khác nhau.

## 7. Kết quả thực thi (2026-08-05)

✅ Đã implement toàn bộ Todo ở mục 3, theo đúng approach đã duyệt (winston, retention 7 ngày):

- Tạo `packages/logger/index.js` (winston instance, console + 2 `DailyRotateFile` `maxFiles: '7d'`, exception/rejection handlers) và `packages/logger/httpLogger.js` (morgan không màu → `logger.http()`).
- Hook point tối giản trong `server/app.js` (require + `httpLogger` + banner/error handler dùng `logger.*`), giống hệt pattern `mongo-connect-retry`.
- Migrate toàn bộ ~46 `console.*` còn lại (14 file: `server/seed.js`, `server/routes/auth.js`, `server/routes/admin/dashboard.js`, `server/middleware/proxyAuth.js`, `server/services/{tokenCounter,apiKeyManager}.js`, `server/routes/api/{chat,conversations,image,proxy,tts,user,video}.js`, `packages/mongo-connect-retry/index.js`, `packages/ai-providers/services/providerKeyManager.js`) sang `logger.error`/`logger.info`/`logger.warn`, diff tối giản (chỉ đổi tên hàm). Chỉ còn `console.log` trong `server/views/user/docs.ejs` — đây là code mẫu API hiển thị cho end-user trong trang docs, không phải logging thật, cố tình không đụng.
- Sửa `Dockerfile` (`COPY packages ./packages` + `mkdir -p logs`) và `docker/docker-compose.yml` (volume `../logs:/app/logs`) — fix luôn Risk 1 (lỗ hổng `@packages/*` thiếu trong image production).
- Cập nhật `packages/README.md` (thêm dòng `logger/`) và `AGENTS.md` (tech stack, directory layout, 1 bullet Conventions về logging).
- **Không tự sửa được `.env.example`** — bị chặn bởi permission deny rule bảo vệ file `.env*`. Cần user tự thêm thủ công:
  ```
  # Mức log tối thiểu sẽ được ghi (error, warn, info, http, debug)
  # Mặc định: debug ở development, info ở production
  LOG_LEVEL=debug
  ```

**Verify đã chạy thật (không chỉ đọc code):**
- `node --check` toàn bộ file đã sửa — không lỗi cú pháp.
- Chạy `node server/app.js` local (Windows, không qua Docker) → banner khởi động, kết nối MongoDB, gọi `GET /`, `GET /api/does-not-exist` (404), `GET /admin` (302) → console hiển thị màu đẹp theo level, `logs/combined-2026-08-05.log` ghi đúng JSON tương ứng từng dòng, không lẫn mã màu ANSI.
- `docker build` bằng `Dockerfile` đã sửa → build thành công, `COPY packages ./packages` chạy OK.
- `docker run` image vừa build (ép `MONGODB_URI` trỏ tới cổng không tồn tại để test path lỗi) → log lỗi kết nối Mongo xuất hiện đúng ở cả console (JSON, vì `NODE_ENV=production`) lẫn `logs/error-*.log`; không có `MODULE_NOT_FOUND` cho `@packages/logger`; `docker exec ... whoami` xác nhận chạy dưới user `node` (non-root) và vẫn ghi file `logs/` được (không `EACCES`) nhờ `chown -R node:node` đã thêm.
- Container/image test đã dọn dẹp (`docker stop` + `docker rmi`) sau khi verify xong.

**Việc còn lại (do user quyết định/tự làm):**
- [ ] Tự thêm `LOG_LEVEL=debug` vào `.env.example` (nội dung ở trên) — bị chặn bởi deny rule, agent không sửa được.
- [ ] Quyết định có cần correlation ID (Unknown 1) hay để version sau — hiện chưa implement, đúng như khuyến nghị deferred.
- [ ] Review lại danh sách message log đã migrate xem có message nào vô tình chứa dữ liệu nhạy cảm không (chưa audit từng dòng message cụ thể, chỉ đảm bảo không đổi nội dung message khi migrate).
