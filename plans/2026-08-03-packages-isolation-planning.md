---
type: architecture
complexity: high
status: completed
related_issues: []
related_prs: []
estimated_hours: ~6-10
---

# Kế hoạch: Tách toàn bộ code tự phát triển vào `packages/` để tránh conflict khi merge upstream

> **Ngày lập kế hoạch:** 2026-08-03
> **Scope dự kiến:** `packages/` (mới), `server/config/database.js`, `server/services/agentPlatform.js`, `server/routes/admin/models.js`, `server/views/admin/models.ejs`, `server/views/layouts/admin.ejs`, `public/css/admin.css`, `server/app.js`, và toàn bộ file mới của tính năng Custom AI Provider (di chuyển vị trí), `AGENTS.md`
> **Priority:** medium-high (rủi ro dài hạn, không chặn chức năng hiện tại)

---

## 1. Phân tích / Bối cảnh

**Xác nhận cấu trúc fork thực tế (đã kiểm tra bằng `git`, không chỉ dựa vào lời người dùng):**
- Repo chỉ có 1 remote (`origin` → `nqdev-group/kiraap.git`), nhưng remote này có nhánh `main-forked` **giữ nguyên lịch sử commit của project gốc** (`origin/main-forked` và `origin/main` cùng chung 3 commit gần nhất tại thời điểm phân tích: `2a99d7b`, `45ee4c0`, ...). Điều này xác nhận: `main-forked` chính là nhánh mirror của project gốc mà người dùng "merge update về", còn `main` (và nhánh làm việc hiện tại `opcode/quyit-01`) là nơi chứa code tự phát triển đã bắt đầu phân nhánh (diverge) so với `main-forked`.
- → Rủi ro conflict là **có thật và cụ thể**: mỗi khi merge `main-forked` → `main`/`opcode/quyit-01`, bất kỳ file nào bị cả 2 bên (project gốc + code tự thêm) cùng sửa đều có khả năng conflict. File bị sửa **hoàn toàn mới thêm vào** (không tồn tại ở project gốc) thì **không thể conflict** — chỉ file đã tồn tại ở project gốc và bị sửa trực tiếp mới có rủi ro.

**Kiểm kê các thay đổi hiện tại (đang ở trạng thái staged, chưa commit) theo mức rủi ro:**

| Nhóm | File | Rủi ro conflict | Lý do |
|---|---|---|---|
| 🟢 File mới hoàn toàn | `server/models/AIProvider.js`, `server/models/ProviderApiKey.js`, `server/services/providerKeyManager.js`, `server/services/providerAdapters/{openai,anthropic,sseHelper,index}.js`, `server/routes/admin/providers.js`, `server/views/admin/providers.ejs` | **Không có** (project gốc không biết các file này tồn tại) | Nhưng người dùng muốn *toàn bộ* code tự thêm nằm trong `packages/` để nhất quán và dễ nhận diện "cái gì là của mình", không chỉ những phần có rủi ro conflict thật |
| 🔴 File gốc bị sửa trực tiếp — logic nghiệp vụ | `server/config/database.js` (viết lại toàn bộ retry loop), `server/services/agentPlatform.js` (chèn nhánh `if (model.providerId)` vào 3 hàm `generateText`/`generateTextStream`/`generateSingleImage`), `server/routes/admin/models.js` (thêm fetch provider + normalize `providerId`) | **Cao** | Đây chính xác là loại file "core logic" mà 1 project đang phát triển tích cực nhiều khả năng cũng sẽ sửa tiếp ở các phiên bản sau |
| 🟠 File gốc bị sửa trực tiếp — UI/template | `server/views/admin/models.ejs` (thêm select provider + JS), `server/views/layouts/admin.ejs` (thêm nav-group "NQDEV Platform"), `public/css/admin.css` (thêm 2 class `.nav-group*`) | **Trung bình** | UI/CSS đổi thường xuyên hơn logic nhưng conflict ở HTML/CSS dễ resolve tay hơn conflict logic |
| 🟡 Điểm nối tối thiểu, khó tránh hoàn toàn | `server/app.js` (2 dòng: `require` + `app.use`) | **Thấp, chấp nhận được** | Không thể mount route mà không sửa file bootstrap; đây là loại "hook point" tối giản, không phải logic nghiệp vụ |
| ⚪ Tài liệu | `AGENTS.md`, `docs/BUSINESS-DOCUMENT.md` | **Thấp** | Docs riêng của nqdev-group, project gốc nhiều khả năng không có các file này ở đúng dạng này, và conflict markdown dễ resolve tay |

**Nguyên nhân gốc rễ cần giải quyết:** hiện tại code tự thêm bị **trộn lẫn (interleaved)** vào logic gốc thay vì được **tách biệt vật lý (isolated)** và chỉ **gọi vào (wired in)** từ 1 điểm nối tối giản. Đây là điều người dùng yêu cầu khắc phục cho cả code đã viết (retrofit) và quy ước cho code viết tiếp sau này.

## 2. Approach / Strategy

**Nguyên tắc cốt lõi (sẽ ghi thành convention trong `AGENTS.md`):**

> Không viết logic nghiệp vụ mới trực tiếp vào file đã tồn tại từ project gốc. Logic mới luôn nằm trong `packages/<tên-tính-năng>/`. File gốc chỉ được sửa để thêm **1 điểm nối tối giản** (1 `require` + 1 lời gọi/1 điều kiện rẽ nhánh/1 `include`) — không thêm logic thật vào đó.

**Cấu trúc `packages/` đề xuất** — mirror lại layout `server/` bên trong mỗi package để giữ pattern quen thuộc:
```
packages/
├── mongo-connect-retry/
│   └── index.js              # export connectWithRetry(mongoose, uri, opts)
└── ai-providers/
    ├── models/                # AIProvider.js, ProviderApiKey.js
    ├── services/              # providerKeyManager.js, providerAdapters/*, agentPlatformBridge.js (mới), modelConfigHelpers.js (mới)
    ├── routes/                # providers.js (admin CRUD)
    ├── views/                 # providers.ejs + các partial được include từ views gốc
    └── public/                # admin-nav.css (tách từ admin.css)
```

**Cơ chế `require` giữa `server/` và `packages/`:** đề xuất dùng **Node.js subpath imports** (`imports` field trong `package.json` gốc, hỗ trợ từ Node 14.6+, hiện repo chạy Node 20/24 nên tương thích):
```json
"imports": {
  "#packages/*": "./packages/*"
}
```
→ cho phép `require('#packages/ai-providers/services/providerKeyManager')` thay vì `require('../../../packages/ai-providers/services/providerKeyManager')`. Lợi ích: đường dẫn ổn định dù file gọi nằm sâu bao nhiêu cấp, và bản thân thay đổi này chỉ thêm 1 field mới vào `package.json` gốc — rủi ro conflict với project gốc gần như bằng 0 (project gốc khó có khả năng tự định nghĩa đúng field `imports` với đúng key này).
- **Đã cân nhắc và loại bỏ:** npm/yarn workspaces (`packages/*` làm workspace riêng, mỗi package có `package.json` riêng) — over-engineering cho quy mô hiện tại (không có nhu cầu version/publish riêng từng package, không có dependency riêng biệt cần cô lập), và **thay đổi hành vi cài đặt/build của toàn repo** — rủi ro lớn hơn vấn đề cần giải quyết.
- **Đã cân nhắc và loại bỏ:** git submodule riêng cho `packages/` — quá mức cho 1 Node app single-repo, không có nhu cầu tái sử dụng packages ở repo khác.

**Với từng nhóm file rủi ro cao/trung bình ở mục 1, chiến lược cụ thể:**

1. **`server/config/database.js`** → di chuyển toàn bộ retry loop vào `packages/mongo-connect-retry/index.js` (export `connectWithRetry(mongoose, uri)`), `database.js` co lại thành:
   ```js
   const mongoose = require('mongoose');
   const { connectWithRetry } = require('#packages/mongo-connect-retry');
   module.exports = () => connectWithRetry(mongoose, process.env.MONGODB_URI);
   ```
   Nếu project gốc sau này sửa `database.js` (vd. đổi cách đọc `MONGODB_URI`, thêm option connect), diff còn lại của nqdev chỉ là 2 dòng thêm — dễ resolve merge bằng tay trong vài giây.

2. **`server/services/agentPlatform.js`** → thay 3 khối `if (model.providerId) { ... nhiều dòng logic ... }` hiện tại bằng 1 lời gọi duy nhất tới hàm bridge mới `packages/ai-providers/services/agentPlatformBridge.js`, vd:
   ```js
   const customResult = await agentPlatformBridge.tryCustomProvider('generateText', { model, prompt, history, ... });
   if (customResult) return customResult;
   // ...code Google gốc, giữ nguyên 100%
   ```
   Bridge trả `null`/`undefined` nếu `model.providerId` không có → code gốc chạy tiếp như cũ, không đổi hành vi.

3. **`server/routes/admin/models.js`** → gom logic "fetch provider list" + "normalize `providerId` rỗng thành `null`" vào `packages/ai-providers/services/modelConfigHelpers.js`, gọi từ 3 điểm đã sửa (`GET /`, `POST /api`, `PUT /api/:id`), mỗi điểm chỉ còn 1 dòng gọi hàm helper.

4. **View/CSS (`models.ejs`, `admin.ejs`, `admin.css`)** → tách phần HTML/JS thêm vào thành EJS partial riêng dưới `packages/ai-providers/views/_model-provider-field.ejs` và `_admin-nav-group.ejs`, include bằng 1 dòng `<%- include(...) %>` tại đúng vị trí cũ. CSS: chuyển 2 class `.nav-group*` sang `packages/ai-providers/public/admin-nav.css`, serve qua `express.static` mount riêng, nạp bằng 1 `<link>` trong layout — **cần xác minh kỹ thuật trước khi làm** (xem Risk bên dưới, đường dẫn `include()` của EJS phụ thuộc cấu hình `views root` hiện tại của `express-ejs-layouts`).

5. **`server/app.js`** — giữ nguyên 2 dòng hiện tại (`require` route + `app.use`). Đây là điểm nối tối thiểu không thể giảm thêm mà vẫn mount được route — chấp nhận, không cố tách tiếp.

**Vì sao không rollback rồi làm lại từ đầu:** toàn bộ 2 tính năng (Custom AI Provider, Mongo retry) đã được người dùng duyệt và verify hoạt động đúng — approach ở đây là **retrofit/di chuyển vị trí (pure move)**, không đổi lại logic nghiệp vụ, để tránh phải test lại từ 0 và tránh rủi ro đổi hành vi ngoài ý muốn.

## 3. Công việc cần thực hiện (Todo)

- [x] Thêm field `imports` vào `package.json` gốc (`#packages/*` + `#server/*`, thêm chiều ngược lại so với đề xuất ban đầu để `packages/` gọi ngược vào `server/middleware`/`models` ổn định); spike xác nhận **phải ghi rõ tên file** (`require('#packages/x/index.js')`) — subpath imports không tự resolve `index.js` như `require()` tương đối. Đã dọn file spike sau khi test.
- [x] Tạo `packages/README.md` ghi lại convention, kèm ví dụ đúng/sai của subpath imports
- [x] Tạo `packages/mongo-connect-retry/index.js`, di chuyển retry loop từ `server/config/database.js` sang, viết lại `database.js` thành wrapper mỏng (3 dòng) — verify lại bằng đúng 2 test đã dùng ở lần fix gốc (force-fail 5 lần đúng backoff, real `.env` connect 132ms không regression)
- [x] Tạo `packages/ai-providers/{models,services,routes,views,public}/`, di chuyển toàn bộ file mới hoàn toàn vào đúng vị trí, sửa require nội bộ (đa số không đổi vì cấu trúc thư mục con giữ nguyên tương đối)
- [x] Viết `packages/ai-providers/services/agentPlatformBridge.js` — export riêng `generateText`/`generateTextStream`/`generateImage` (khác với ví dụ dispatch-1-hàm `tryCustomProvider(...)` phác thảo ban đầu ở mục 2 — giữ 3 hàm riêng biệt khớp đúng chữ ký gọi hiện có, đơn giản hơn viết thêm 1 tầng dispatch). `agentPlatform.js` co lại còn 1 require + 3 hook point 1-điều-kiện-1-lời-gọi, xoá hẳn 3 method `_resolveCustomProvider`/`_generateTextViaProvider`/`_generateImageViaProvider` cũ.
- [x] Viết `packages/ai-providers/services/modelConfigHelpers.js` (`getActiveProviders`, `normalizeProviderId`), `routes/admin/models.js` co lại còn 1 require + 2 lời gọi 1 dòng
- [x] Spike kỹ thuật EJS `include()`: xác nhận **relative path từ file include hoạt động bình thường** kể cả khi trỏ ra ngoài `views` root cấu hình trong `app.js` — không cần fallback giữ view trong `server/views/`. Riêng full-page `res.render('admin/providers')` cần thêm: đổi `app.set('views', ...)` từ 1 string thành mảng `[server/views, packages/ai-providers/views]` (Express tự tìm theo thứ tự) — 1 dòng đổi, không có trong bản phác thảo gốc.
- [x] Tách UI: `_admin-nav-group.ejs` (tách toàn bộ, sạch) và `_model-provider-script.ejs` (chỉ phần tự-đứng-độc-lập: biến `MODEL_PROVIDERS` + 2 hàm `providerSelectOptions`/`toggleProviderGroup`) — xem quyết định "không tách 100%" bên dưới
- [x] Tách CSS: `.nav-group`/`.nav-group-label` → `packages/ai-providers/public/admin-nav.css`, mount `express.static` tại `/packages/ai-providers` trong `app.js`, thêm 1 `<link>` trong `admin.ejs`
- [x] Cập nhật `AGENTS.md`: thêm mục convention `packages/` isolation, cập nhật Directory layout (thêm cây `packages/`, sửa mô tả `server/` phần đã di dời), cập nhật 2 gotcha (MongoDB retry, Custom AI Provider) với đường dẫn mới + note quyết định không tách 100% UI
- [x] Rà soát `docs/BUSINESS-DOCUMENT.md`: tìm thấy 6 chỗ còn trỏ `server/models|services|routes|views/...` cũ (mục 3.1 AIProvider/ProviderApiKey, mục 6 WF-018 nguồn code, mục 9.3 bảng file-đã-phân-tích) — đã sửa hết sang `packages/ai-providers/...`
- [x] Test hồi quy thủ công toàn bộ: chạy `npm start` thật, connect Mongo qua retry logic mới (thành công, log `10.8.0.3`), login admin lấy JWT thật, `GET /admin/providers` và `GET /admin/models` trả 200 và chứa đúng nội dung từ view đã di chuyển, `GET /packages/ai-providers/admin-nav.css` trả 200 đúng nội dung CSS, full CRUD cycle qua HTTP thật (tạo provider → thêm key → tạo model gắn provider → xác nhận xoá provider bị chặn khi còn model tham chiếu → xoá model → xoá provider thành công) — không có bước nào lỗi, hành vi giống hệt trước khi tách.
- [x] Không commit — 22 file trước đó đã ở trạng thái staged từ phiên trước (không phải do phiên này tạo ra); toàn bộ thay đổi của bước tách `packages/` trong phiên này **chưa** được `git add`/commit, chờ người dùng review.

## 4. Risks & Unknowns

- **Risk 1:** Cơ chế `include()` của EJS có thể resolve đường dẫn khác với kỳ vọng khi partial nằm ngoài `server/views/` (ví dụ dưới `packages/`) — nếu `express-ejs-layouts`/EJS engine giới hạn `root` về đúng `server/views/`, phần tách UI ra `packages/` có thể không hoạt động được như mong đợi mà không cấu hình thêm (`views` option dạng array, hoặc dùng đường dẫn tuyệt đối). → **Mitigation:** làm spike nhỏ (1 partial test) trước khi tách toàn bộ 2 khối UI thật; nếu không khả thi gọn gàng, fallback: giữ view partial vật lý trong `server/views/partials/ai-providers/` (chấp nhận 1 ngoại lệ nhỏ cho phần view) nhưng vẫn giữ mọi logic JS/CSS/model/service trong `packages/`.
- **Risk 2:** Việc di chuyển file đang ở trạng thái *staged* (theo `git status`, 22 file đã stage) có thể gây rối khi vừa retrofit vừa còn thay đổi dở của 2 tính năng — → **Mitigation:** làm bước tách `packages/` như 1 đơn vị commit riêng, tách bạch rõ với commit của tính năng gốc (không gộp chung), để lịch sử git dễ đọc và dễ revert riêng từng phần nếu cần.
- **Risk 3:** Tách quá mức các điểm nối rất nhỏ/ổn định (vd. 1 dòng `<a>` nav-item, 2 dòng `app.js`) có thể tạo thêm độ phức tạp gián tiếp lớn hơn lợi ích chống conflict thực tế mang lại. → **Mitigation:** áp dụng nguyên tắc tách theo từng trường hợp cụ thể, không tách máy móc 100% — ưu tiên tách các khối **logic nghiệp vụ** và **UI block lớn**, chấp nhận giữ nguyên các điểm nối 1-2 dòng thực sự tối giản (đã liệt kê ở mục 1, nhóm "chấp nhận được").
- **Unknown 1:** Chưa có dữ liệu thực tế về tần suất/mức độ project gốc (`main-forked`) sửa đổi chính xác các file này ở các bản cập nhật tương lai — ROI của việc tách sâu (đặc biệt UI/CSS) phụ thuộc vào việc này. → **Plan:** sau lần merge `main-forked` → `main` kế tiếp, so sánh thực tế số dòng conflict trước/sau để đánh giá lại mức độ đầu tư hợp lý cho các lần sau.
- **Unknown 2:** Node subpath imports (`#packages/*`) hoạt động tốt với `require()` (CommonJS) từ Node 16+ nhưng cần xác nhận không có tool nào trong repo (nodemon, bất kỳ transpiler nào) làm sai lệch resolution — repo hiện dùng thuần CommonJS không transpile nên rủi ro này thấp nhưng cần xác nhận bằng 1 lần chạy `npm run dev` thật sau khi thêm field `imports`.

## 5. Success Criteria

- Không còn logic nghiệp vụ mới (Custom AI Provider, Mongo retry) nằm trực tiếp trong file đã tồn tại ở project gốc — mỗi file gốc bị chạm chỉ còn 1-3 dòng hook point (import + gọi hàm/điều kiện/include).
- `packages/` chứa toàn bộ code tự phát triển, có `README.md` mô tả convention để các phiên sau tự tuân theo mà không cần nhắc lại.
- `AGENTS.md` phản ánh đúng cấu trúc mới (đường dẫn file đã đổi).
- Test hồi quy thủ công xác nhận hành vi ứng dụng **không đổi** so với trước khi tách (MongoDB retry, AI Provider admin CRUD, chat Google + custom provider).
- Convention mới đủ rõ để áp dụng ngay cho các tính năng tiếp theo, không cần lập lại kế hoạch riêng mỗi lần.

## 6. Questions / Dependencies

- Cần xác nhận: cách người dùng thực hiện "merge update từ project đó về" trong thực tế — merge trực tiếp `main-forked` vào `main`/branch làm việc qua `git merge`, hay qua cách khác (cherry-pick tay, so sánh diff riêng)? Ảnh hưởng tới việc có cần thêm `.gitattributes` (`merge=ours`/`merge=union` theo path) hỗ trợ thêm hay không — chưa đưa vào scope kế hoạch này vì chưa có xác nhận. **Vẫn để ngỏ sau khi triển khai** — chưa cần thiết để hoàn thành retrofit này, nhưng nên hỏi khi có merge thật đầu tiên để đánh giá lại Unknown 1.
- Cần quyết định trước khi thực thi: chấp nhận dùng Node subpath imports (`#packages/*`) hay giữ `require` bằng đường dẫn tương đối thông thường cho dễ tra cứu bằng full-text search? → **Đã chốt: dùng subpath imports**, đã triển khai và verify hoạt động đúng (kèm phát hiện quan trọng: phải ghi rõ tên file, không tự resolve `index.js`).
- Risk 1 (EJS include path) → **Đã làm spike, xác nhận khả thi**, xem mục 7.

## 7. Kết quả triển khai (bổ sung sau khi hoàn thành — 2026-08-03)

- **Trạng thái:** ✅ Hoàn thành toàn bộ Todo ở mục 3. Chưa commit — chờ người dùng review/yêu cầu commit theo quy ước của repo.
- **File/thư mục mới:** `packages/README.md`, `packages/mongo-connect-retry/index.js`, `packages/ai-providers/{models/AIProvider.js,ProviderApiKey.js}`, `packages/ai-providers/services/{providerKeyManager.js,agentPlatformBridge.js,modelConfigHelpers.js,providerAdapters/{index,openai,anthropic,sseHelper}.js}`, `packages/ai-providers/routes/providers.js`, `packages/ai-providers/views/{admin/providers.ejs,_admin-nav-group.ejs,_model-provider-script.ejs}`, `packages/ai-providers/public/admin-nav.css`.
- **File gốc đã co lại thành hook point tối giản:** [`package.json`](../package.json) (+`imports` field), [`server/config/database.js`](../server/config/database.js) (3 dòng), [`server/services/agentPlatform.js`](../server/services/agentPlatform.js) (1 require + 3 hook point 1-điều-kiện-1-gọi, xoá 3 method cũ ~140 dòng), [`server/routes/admin/models.js`](../server/routes/admin/models.js) (1 require + 2 lời gọi), [`server/app.js`](../server/app.js) (route require trỏ sang package, +1 dòng `views` array, +1 dòng static mount), [`server/views/layouts/admin.ejs`](../server/views/layouts/admin.ejs) (1 `include()` thay 7 dòng HTML, +1 `<link>`), [`server/views/admin/models.ejs`](../server/views/admin/models.ejs) (1 `include()` thay 12 dòng JS), [`public/css/admin.css`](../public/css/admin.css) (xoá 2 dòng rule).
- **File cũ đã xoá** (nội dung đã di chuyển nguyên vẹn sang `packages/`): `server/models/AIProvider.js`, `server/models/ProviderApiKey.js`, `server/services/providerKeyManager.js`, `server/services/providerAdapters/*.js` (4 file, kèm xoá thư mục rỗng), `server/routes/admin/providers.js`, `server/views/admin/providers.ejs`.
- **Sai khác so với bản phác thảo ban đầu (mục 2), có chủ đích:**
  1. Thêm chiều `#server/*` → `./server/*` vào `imports` (bản phác thảo chỉ có `#packages/*`) — cần thiết vì `packages/ai-providers/routes/providers.js` phải gọi ngược vào `server/middleware/{auth,adminOnly}.js` và `server/models/ModelConfig.js`; dùng subpath thay vì `../../../server/...` cho ổn định dài hạn, cùng lý do với chiều ngược lại.
  2. `agentPlatformBridge.js` export 3 hàm riêng (`generateText`/`generateTextStream`/`generateImage`) thay vì 1 hàm dispatch `tryCustomProvider(methodName, params)` như ví dụ phác thảo — khớp thẳng với 3 điểm gọi hiện có trong `agentPlatform.js`, không cần thêm tầng dispatch/switch không cần thiết.
  3. Full-page `res.render('admin/providers')` cần thêm 1 thay đổi không có trong phác thảo: `app.set('views', ...)` đổi từ string sang mảng `[server/views, packages/ai-providers/views]` để Express tìm thấy view đã di chuyển — EJS `include()` (dùng cho 2 partial) không cần thay đổi này vì tự resolve theo đường dẫn tương đối của file gọi.
  4. **`models.ejs` chỉ tách được một phần** (đúng như Risk 3 đã lường trước): tách sạch được phần tự-đứng-độc-lập (`MODEL_PROVIDERS`, `providerSelectOptions()`, `toggleProviderGroup()`) ra `_model-provider-script.ejs`; các lời gọi `providerSelectOptions(...)` và đọc field `providerId` vẫn nằm trong các hàm dùng chung `openAddModelModal`/`editModel`/`saveModel`/`updateModel` (các hàm này xử lý mọi field của model, không riêng provider) — chấp nhận đây là điểm nối tối thiểu còn lại, tách tiếp sẽ phải viết lại toàn bộ 4 hàm này, lợi ích không tương xứng độ phức tạp thêm vào.
- **Test hồi quy (xem Todo mục 3):** chạy server thật với `.env` thật, Mongo connect qua retry logic mới thành công, full CRUD Provider/Key/Model qua HTTP thật (kèm test "chặn xoá khi còn tham chiếu"), verify 2 trang admin đã di chuyển view trả đúng nội dung, verify static CSS mount — dọn sạch dữ liệu test sau khi xong, kill server test.
- **Bài học:** Node subpath imports (`imports` field trong `package.json`) là cơ chế tốt để tách code khỏi cấu trúc thư mục vật lý, nhưng **khác hành vi với `require()` tương đối** ở chỗ không tự resolve `index.js` — phải luôn kiểm chứng bằng 1 spike nhỏ trước khi áp dụng rộng, đừng giả định nó "hoạt động y hệt require thường".

### Addendum (2026-08-03, cùng ngày) — đổi hướng `server/` → `packages/` sang `@packages/*` + `module-alias`

Sau khi hoàn thành mục 7 ở trên, người dùng yêu cầu thêm khai báo `jsconfig.json` cho alias `@packages/*` (phục vụ IntelliSense VSCode), rồi ngay sau đó yêu cầu đổi luôn code thật sang dùng `@packages/*` thay vì `#packages/*`. Vì Node không tự hiểu prefix `@` (chỉ `imports` field với key bắt đầu `#` mới được Node công nhận), đã cài thêm `module-alias` (`npm install module-alias`) làm cơ chế resolve runtime thật:

- `package.json`: bỏ `#packages/*` khỏi `imports` (không còn dùng), thêm `"_moduleAliases": {"@packages": "packages"}`. Giữ nguyên `#server/*` trong `imports` — chiều `packages/` → `server/` không đổi.
- `server/app.js`: thêm `require('module-alias/register')` làm **dòng đầu tiên tuyệt đối** của file (trước cả `dotenv`) — bắt buộc phải chạy trước bất kỳ `require('@packages/...')` nào.
- Đổi cả 4 chỗ dùng `require('#packages/...')` sang `require('@packages/...')`: `server/app.js`, `server/config/database.js`, `server/services/agentPlatform.js`, `server/routes/admin/models.js`.
- Verify: chạy lại server thật — `@packages/mongo-connect-retry/index.js` và `@packages/ai-providers/routes/providers.js` (kéo theo mọi require nội bộ của `ai-providers/`) đều resolve đúng (nếu sai sẽ crash ngay ở bước require, trước khi tới log khởi động — nhưng app khởi động bình thường, MongoDB retry chạy đúng 5 lần/backoff như thiết kế trước khi thoát do VPN chập chờn thật ở thời điểm test, không liên quan tới thay đổi lần này).
- `packages/README.md` và gotcha "packages/ isolation" trong `AGENTS.md` đã cập nhật để phản ánh đúng cơ chế mới (`@packages/*` + `module-alias` cho chiều `server` → `packages`, giữ `#server/*` cho chiều ngược lại, `jsconfig.json` chỉ là hỗ trợ editor không ảnh hưởng runtime).
- **Lưu ý quan trọng cho phiên sau:** nếu test/debug 1 file dùng `@packages/...` bằng cách require trực tiếp (không qua `server/app.js`), phải tự gọi `require('module-alias/register')` trước — nếu không sẽ gặp `MODULE_NOT_FOUND` dù code không có lỗi gì.

### Addendum (2026-08-05) — Test thực tế tính năng Custom AI Provider với `9router` + seed dữ liệu

Người dùng cung cấp thông tin 1 provider thật (`9router`, OpenAI-compatible, `https://9router.svr.quyit.id.vn/v1`, key tên `unit-test`) để test toàn bộ luồng vừa tách ra `packages/ai-providers/` hoạt động đúng trên dữ liệu thật (không phải mock), đồng thời yêu cầu đưa luôn thông tin provider này vào `server/seed.js` để tự động có sẵn ở các lần seed sau (không phải chỉ test 1 lần rồi bỏ).

**Test đã thực hiện (server thật đang chạy ở `localhost:3001`, MongoDB thật `10.8.0.3`):**
1. Gọi trực tiếp `GET https://9router.svr.quyit.id.vn/v1/models` bằng key cung cấp → xác nhận kết nối được, trả về **392 models** (chuẩn OpenAI `/v1/models`).
2. Đăng nhập admin thật qua `POST /api/auth/login`, lấy JWT.
3. Tạo `AIProvider` "9router" qua `POST /admin/providers/api` → thành công.
4. Thêm `ProviderApiKey` tên "unit-test" qua `POST /admin/providers/api/:id/keys` → thành công.
5. Đăng ký `ModelConfig` mới vào "Mô hình AI" (`category: text`, `modelId: 9r-route-combo-free`, `providerId` trỏ về provider vừa tạo, `isDefault: false` — không ghi đè model mặc định hiện có) qua `POST /admin/models/api` → thành công.
6. Test end-to-end thật: gọi `agentPlatform.generateText({ modelId: '9r-route-combo-free', ... })` — đi đúng qua nhánh `if (model.providerId)` → `packages/ai-providers/services/agentPlatformBridge.js` → `providerAdapters/openai.js` → nhận phản hồi chat thật sau ~16s ("Có, tôi đang hoạt động."). Xác nhận toàn bộ chuỗi hook point sau khi tách `packages/` (`agentPlatform.js` → bridge → adapter) hoạt động đúng trên dữ liệu thật, không chỉ trên code tách tĩnh.

**Kết quả:** người dùng chọn **giữ lại** Provider + Model này trong database thật (không xoá sau test) — đây là mục đích chính, không phải test rồi dọn.

**Thêm seed cho `9router` vào [`server/seed.js`](../server/seed.js):**
- Seed `AIProvider` "9router" (idempotent, `findOne({name: '9router'})` trước khi tạo).
- Seed `ProviderApiKey` "unit-test" — **có điều kiện**: chỉ tạo nếu biến môi trường `NINEROUTER_API_KEY` tồn tại (không hardcode giá trị API key thật vào source code); nếu thiếu biến, log cảnh báo và bỏ qua bước này thay vì lỗi hoặc seed key rỗng.
- Thêm 1 `ModelConfig` mới vào mảng `defaultModels` (`category: text`, `modelId: 9r-route-combo-free`, `providerId` = id provider vừa seed, `isDefault: false`).
- `seed.js` giờ cần `require('module-alias/register')` làm dòng đầu (trước đây không cần vì chỉ dùng model nội bộ `server/models/`) — vì giờ seed cả `AIProvider`/`ProviderApiKey` từ `@packages/ai-providers/models/`, đúng lưu ý gotcha đã ghi ở mục 7 phía trên (require `@packages/...` trực tiếp ngoài `server/app.js` phải tự register module-alias).
- Cập nhật `.env` (giá trị thật, đã gitignore) và `.env.example` (placeholder `your_9router_api_key_here`) với biến mới `NINEROUTER_API_KEY`.
- Verify: chạy `npm run seed` thật — toàn bộ 3 mục trên đều báo "đã tồn tại" đúng (vì đã tạo qua API ở bước test trên) → xác nhận logic idempotent đúng, không tạo trùng lặp.

**Phát hiện phụ (không thuộc scope, chưa sửa):** `.env` hiện có `NODE_TLS_REJECT_UNAUTHORIZED=0`, tắt xác thực chứng chỉ TLS cho toàn bộ tiến trình Node (áp dụng cho mọi HTTPS request, kể cả gọi tới `9router` trong lúc test) — rủi ro bảo mật (MITM) nếu không có lý do hạ tầng cụ thể (có thể liên quan tới self-signed cert nội bộ nào đó). Chưa xác minh lý do cấu hình này tồn tại, không tự ý xoá — cần hỏi người dùng ở phiên sau nếu muốn rà soát.
