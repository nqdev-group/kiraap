---
type: bug-fix
complexity: low
status: completed
related_issues: []
related_prs: []
estimated_hours: ~1
---

# Kế hoạch: Khắc phục lỗi `Socket 'connect' timed out after 10001ms (connectTimeoutMS: 10000)`

> **Ngày lập kế hoạch:** 2026-08-03
> **Scope dự kiến:** `server/config/database.js` (duy nhất)
> **Priority:** medium

---

## 1. Phân tích / Bối cảnh

Ứng dụng kết nối MongoDB self-hosted tại `10.8.0.3:27017` (qua VPN, không phải LAN) — cấu hình trong `MONGODB_URI` đã có `directConnection=true`, `serverSelectionTimeoutMS=5000`, `connectTimeoutMS=10000` (di sản của lần fix "Server selection timed out after 5000 ms" trước đó trong cùng ngày, xem `plans/` chưa có file — fix đó nằm trong `.env`, không có plan riêng).

Lỗi lần này khác về bản chất: **`Socket 'connect' timed out`** xảy ra ở tầng TCP-connect (dùng `connectTimeoutMS`), sớm hơn cả bước server selection — nghĩa là driver không mở được socket TCP tới `10.8.0.3:27017` trong 10s, chứ không phải vấn đề định tuyến địa chỉ replica set (`hello.me`) như lần trước.

**Đã điều tra trực tiếp (2026-08-03):**
- `Test-NetConnection -ComputerName 10.8.0.3 -Port 27017` → `TcpTestSucceeded: True` (port có vẻ mở).
- Chạy `MongoClient.connect()` trực tiếp ngay sau đó → **thành công sau 358ms**, `serverStatus()` OK.
- Trước đó (trong phiên làm việc), cùng lệnh connect đã timeout 2 lần liên tiếp với cùng cấu hình `.env`, không đổi gì giữa các lần thử.

→ **Kết luận: đây là lỗi mạng/VPN chập chờn (intermittent), không phải lỗi cấu hình hay lỗi code.** `10.8.0.3` là địa chỉ VPN tới máy chủ MongoDB tự host — khi tunnel VPN có độ trễ/rớt gói tạm thời, cú connect *đầu tiên* có thể treo quá 10s, nhưng thử lại ngay sau thường thành công trong vài trăm ms.

**Vấn đề thực sự cần giải quyết không phải là "tại sao mạng chập chờn"** (ngoài tầm kiểm soát của code — do VPN/hạ tầng), **mà là: `server/config/database.js` hiện xử lý sai khi gặp 1 lần timeout ngẫu nhiên** — xem code hiện tại:

```js
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI);
        console.log(`✅ MongoDB đã kết nối: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ Lỗi kết nối MongoDB: ${error.message}`);
        process.exit(1);   // <-- kill toàn bộ process ngay ở lần thất bại ĐẦU TIÊN
    }
};
```

`server/app.js` gọi `connectDB()` không đợi (`connectDB();` không `await`) rồi tiếp tục `app.listen()` ngay sau — nghĩa là HTTP server đã bind cổng và bắt đầu nhận request, nhưng nếu lần connect đầu tiên timeout, `process.exit(1)` giết chết toàn bộ tiến trình Node (kể cả HTTP server vừa mở) chỉ vì 1 lần trục trặc mạng thoáng qua — dù thử lại ngay sau gần như luôn thành công (đã kiểm chứng thực tế ở trên).

## 2. Approach / Strategy

**Phương án chọn: thêm retry-with-backoff cho lần connect đầu tiên trong `connectDB()`, chỉ `process.exit(1)` sau khi đã thử hết số lần retry.**

- Tại sao không sửa timeout (`connectTimeoutMS`/`serverSelectionTimeoutMS`) trong `.env` thay vì retry: tăng timeout chỉ kéo dài thời gian chờ mỗi lần thử (đổi UX chờ lâu hơn lấy xác suất thành công cao hơn một chút), không giải quyết được trường hợp VPN rớt gói kéo dài hơn cả timeout mới. Retry với backoff xử lý đúng bản chất "chập chờn ngắn hạn" đã quan sát được (fail rồi thành công ngay sau đó).
- Tại sao không bỏ hẳn `process.exit(1)`: ứng dụng không có DB thì gần như mọi route đều lỗi ngầm (Mongoose sẽ throw khi query) — vẫn cần fail-fast rõ ràng nếu retry hết mà vẫn không kết nối được, để tránh chạy "âm thầm hỏng".
- Không đổi gì trong `.env` (`directConnection=true` vẫn đúng và cần giữ, đã xác nhận ở phiên trước — đây là fix cho vấn đề khác, không liên quan tới lỗi lần này).

**Thiết kế retry:**
- Số lần thử: 5 lần (1 lần đầu + 4 lần retry) — đủ để vượt qua chập chờn ngắn, không kéo dài startup quá lâu.
- Backoff: cố định hoặc tăng dần nhẹ, ví dụ `2s, 4s, 6s, 8s` giữa các lần — tổng thời gian chờ tối đa hợp lý (~20-30s cộng thời gian mỗi lần connect timeout).
- Log rõ từng lần thử thất bại (lần mấy/tổng số, lỗi gì) để dễ chẩn đoán nếu thực sự VPN đứt lâu.
- Giữ nguyên `console.log`/`console.error` tiếng Việt theo convention hiện có của file.

## 3. Công việc cần thực hiện (Todo)

- [x] Sửa `server/config/database.js`: bọc `mongoose.connect()` trong loop retry-with-backoff (5 lần, delay `2s,4s,6s,8s`), chỉ `process.exit(1)` sau lần cuối thất bại
- [x] Log rõ mỗi lần retry (số thứ tự `lần X/5`, lỗi, thời gian chờ trước lần kế tiếp)
- [x] Test thủ công: ép `MONGODB_URI` trỏ `127.0.0.1:1` (ECONNREFUSED ngay, không cần chờ timeout thật) → xác nhận log đúng 5 lần `lần 1/5`...`lần 5/5`, backoff đúng 2/4/6/8s, rồi `process.exit(1)` (exit code 1)
- [x] Test thủ công: chạy lại với `.env` thật (kết nối đúng) → kết nối thành công trong 132ms, không có delay/regression nào từ logic retry
- [x] Cập nhật gotcha trong `AGENTS.md` — thêm 1 dòng mới trong mục Gotchas giải thích `directConnection=true` + retry loop trong `connectDB()`, lý do vì sao (VPN chập chờn) và cảnh báo không nên bỏ retry loop

## 4. Risks & Unknowns

- **Risk 1:** Nếu VPN đứt dài hạn (không phải chập chờn ngắn), retry sẽ chỉ kéo dài thời gian trước khi `process.exit(1)` — không giải quyết được vấn đề gốc (ngoài tầm code). → **Mitigation:** log rõ để người vận hành biết đây là lỗi hạ tầng, không phải bug code, và cần tự kiểm tra VPN/mongod bên ngoài.
- **Risk 2:** Nếu Mongoose driver tự có internal retry riêng cho `serverSelectionTimeoutMS` mà chưa kiểm tra kỹ, retry ở tầng `connectDB()` có thể chồng lấp (double retry) → cần đọc kỹ hành vi mặc định của Mongoose `connect()` trước khi thêm loop ngoài, tránh retry quá dày.
- **Unknown:** Chưa rõ tần suất thực tế của hiện tượng chập chờn này (1 lần/ngày? nhiều lần/giờ?) — nếu quá thường xuyên, có thể cần trao đổi với người quản lý VPN/hạ tầng thay vì chỉ vá ở tầng code.

## 5. Success Criteria

- `connectDB()` không còn giết chết toàn bộ process chỉ vì 1 lần timeout đơn lẻ khi mạng/VPN chập chờn ngắn hạn (đã tái hiện được hiện tượng "fail rồi thành công ngay sau" trong lúc điều tra).
- Log khi retry phải đủ rõ để người vận hành phân biệt được "đang retry do mạng chập chờn" và "đã hết retry, cần kiểm tra hạ tầng".
- Trường hợp Mongo thực sự không thể kết nối sau toàn bộ số lần retry, app vẫn dừng rõ ràng (`process.exit(1)`) như hành vi cũ — không âm thầm chạy tiếp mà không có DB.

## 6. Questions / Dependencies

- Số lần retry và thời gian backoff cụ thể (5 lần / 2-8s) là đề xuất mặc định — người dùng đã duyệt plan mà không yêu cầu đổi số, giữ nguyên như đề xuất.

## 7. Kết quả triển khai (bổ sung sau khi hoàn thành — 2026-08-03)

- **File thay đổi:** [`server/config/database.js`](../server/config/database.js) (retry loop), [`AGENTS.md`](../AGENTS.md) (gotcha mới).
- **Chưa commit** — chờ người dùng review/yêu cầu commit theo quy ước của repo (chỉ commit khi được yêu cầu rõ ràng).
- Không phát hiện double-retry với Mongoose driver (Risk 2 ở mục 4) trong lúc test — hành vi quan sát được khớp đúng thiết kế: đúng 5 lần thử, không có lần "âm thầm" nào ngoài dự kiến.
- Bài học: khi chẩn đoán lỗi timeout MongoDB, luôn thử lại kết nối thủ công ngay sau khi thấy lỗi trước khi kết luận là lỗi cấu hình — nếu lần thử lại thành công nhanh, đó là dấu hiệu chập chờn mạng/VPN, không phải lỗi code hay `.env`.
