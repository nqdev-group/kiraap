# Changelog

Tất cả các thay đổi đáng chú ý của dự án **Kira Agent Platform (KiraAP)** được ghi lại trong file này.

Định dạng dựa theo [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), phiên bản theo [Semantic Versioning](https://semver.org/).

## [Unreleased] - 2026-07-27

### Documentation
- Cập nhật README với ảnh demo giao diện, bảng công nghệ sử dụng (tech stack table), và hướng dẫn cài đặt chi tiết hơn. (`45ee4c0`)

## [1.0.0] - 2026-07-26

Phát hành mã nguồn mở đầu tiên của Kira Agent Platform.

### Added
- Khởi tạo mã nguồn mở Kira Agent Platform (KiraAP) v1.0.0: Chat AI, Tạo ảnh, Tạo video, TTS, Admin Panel, xoay vòng API Key. (`b02825d`)
- Bổ sung Proxy API tương thích OpenAI: `GET /v1/user/profile`, `GET /v1/user/api-keys`, lọc `GET /v1/models`, và tích hợp route `/docs` (trang tài liệu API) vào ứng dụng. (`d4d5183`)
- Thêm file `compass.yml` để quản lý dự án dạng config-as-code (Atlassian Compass). (`47f4b8a`)

### Fixed
- Sửa layout responsive trên di động, hỗ trợ sao chép đầy đủ API Key, và loại bỏ script bị trùng lặp. (`9987268`)
- Hỗ trợ định dạng payload phức tạp từ các extension VS Code (Continue/Cline) và khởi tạo đúng `delta.role: "assistant"` trong SSE stream của `/v1/chat/completions`. (`9eb01b4`)
- Sửa lỗi đọc SSE stream trong Proxy API `/v1/chat/completions`. (`e07a6d6`)
- Sửa luồng stream audio/wav trong Proxy API TTS `/v1/audio/speech`. (`ebd2d66`)
- Thêm cuộn trang (`overflow-y: scroll`) và cập nhật observer root cho trang Tài liệu API (`/docs`). (`9e03f5d`)

### Documentation
- Cập nhật `SKILL.md` (`.agents/skills/agent-flatform-api/`) với Google Interactions API, quy tắc `durationSeconds` cho từng model Veo, và helper thêm WAV header cho audio TTS. (`49b8f9b`)
- Thêm ảnh demo giao diện vào README và sửa biểu đồ dashboard admin. (`53ef37b`)
- Bổ sung mục hướng dẫn chi tiết lấy API Key và credit Gemini miễn phí vào README. (`c48bcd5`)
- Cập nhật tên database MongoDB mặc định trong `.env.example` thành `kiraapDB`. (`9d4c2d4`)
