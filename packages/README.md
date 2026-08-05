# packages/

Nơi chứa **toàn bộ code tự phát triển (nqdev-group)** trên nền project fork. Xem `plans/2026-08-03-packages-isolation-planning.md` để biết bối cảnh/lý do đầy đủ.

## Quy tắc bắt buộc

**Không viết logic nghiệp vụ mới trực tiếp vào file đã tồn tại từ project gốc.** Logic mới luôn nằm trong `packages/<tên-tính-năng>/`. File gốc (`server/`, `public/`) chỉ được sửa để thêm **một điểm nối tối giản** — 1 `require` + 1 lời gọi hàm / 1 điều kiện rẽ nhánh / 1 `include()` — không thêm logic thật vào đó.

Lý do: repo này là fork của một project vẫn đang phát triển (nhánh `main-forked` mirror lại project gốc, được merge định kỳ vào `main`/nhánh làm việc). File nào chỉ tồn tại trong `packages/` thì **không thể conflict** khi merge, vì project gốc không biết tới thư mục này. File gốc bị chạm chỉ còn vài dòng ổn định thì conflict (nếu có) cũng chỉ mất vài giây để resolve tay.

## Cấu trúc mỗi package

Mirror lại layout của `server/` bên trong từng package để giữ pattern quen thuộc:

```
packages/<ten-tinh-nang>/
├── models/     # Mongoose schemas riêng của package
├── services/   # business logic, bridge/helper gọi vào từ file gốc
├── routes/     # Express routers riêng của package
├── views/      # EJS partials, include() từ view gốc
└── public/     # CSS/JS/asset tĩnh riêng, mount qua express.static
```

## Cách require từ `server/` vào `packages/`

Dùng alias `@packages/*` qua thư viện [`module-alias`](https://www.npmjs.com/package/module-alias):

- `package.json` khai báo `"_moduleAliases": { "@packages": "packages" }`.
- `server/app.js` — file entrypoint duy nhất — gọi `require('module-alias/register')` ở **dòng đầu tiên**, trước mọi require khác. Vì alias được đăng ký toàn cục 1 lần lúc app khởi động, mọi file require `@packages/...` ở bất kỳ đâu sau đó (kể cả sâu trong `packages/` gọi lẫn nhau) đều resolve đúng — không cần đăng ký lại ở từng file.

```js
const { connectWithRetry } = require('@packages/mongo-connect-retry/index.js');
```

**Lưu ý khi test/debug độc lập:** nếu bạn `require()` trực tiếp 1 file dùng `@packages/...` mà **không** đi qua `server/app.js` trước (vd. `node -e "require('./server/config/database')"`), alias sẽ **chưa được đăng ký** và sẽ throw `MODULE_NOT_FOUND`. Phải `require('module-alias/register')` trước, hoặc chạy qua entrypoint thật.

Đường dẫn ngược lại — từ `packages/` gọi vào `server/` (vd. middleware, model dùng chung) — vẫn dùng Node.js subpath imports gốc (`imports` field, không qua `module-alias`), vì hướng này không cần alias hiển thị đẹp trong editor:

```json
"imports": { "#server/*": "./server/*" }
```

```js
const auth = require('#server/middleware/auth.js');
```

Subpath imports (`#server/*`) **không** tự resolve `index.js` như `require()` tương đối — phải ghi rõ tên file (`#server/models/ModelConfig.js`, không phải `#server/models/ModelConfig`). `module-alias` (`@packages/*`) thì có tự resolve `index.js` như `require()` bình thường, nhưng để nhất quán/dễ grep, các file trong repo vẫn ghi rõ `/index.js` khi require một package qua entry point của nó.

`jsconfig.json` ở gốc repo khai báo `paths` cho `@packages/*` để VSCode gợi ý autocomplete/go-to-definition khi gõ `require('@packages/...')` — đây chỉ là hỗ trợ editor, `module-alias` mới là thứ thực sự làm nó chạy được lúc runtime.

## Danh sách package hiện có

| Package | Mục đích | Được gọi từ |
|---|---|---|
| `mongo-connect-retry/` | Retry-with-backoff cho lần connect MongoDB đầu tiên (chập chờn VPN) | `server/config/database.js` |
| `ai-providers/` | Custom AI Provider (OpenAI/Anthropic compatible) — models, key rotation, adapters, admin CRUD, UI | `server/services/agentPlatform.js`, `server/routes/admin/models.js`, `server/app.js`, `server/views/layouts/admin.ejs`, `server/views/admin/models.ejs` |
| `logger/` | Structured application logger (winston) — console + file JSON rotate hàng ngày (giữ 7 ngày), thay `console.log`/`console.error` và `morgan` | `server/app.js` và hầu hết route/service/middleware trong `server/` (xem `plans/2026-08-05-app-logger-planning.md`) |
