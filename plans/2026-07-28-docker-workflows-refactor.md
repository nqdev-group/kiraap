# Kế hoạch: Sửa & gom nhóm GitHub Actions Docker workflows

> **Ngày:** 2026-07-28
> **Phạm vi:** `.github/workflows/kira-docker-publish.yml`, `.github/workflows/kira-docker-testing.yml`, `.github/actions/`
> **Trạng thái:** ✅ Đã hoàn thành, đã commit thủ công tại `50b07f8`

---

## 1. Bối cảnh

Hai workflow Docker (`kira-docker-publish.yml`, `kira-docker-testing.yml`) ban đầu bị copy nguyên từ một project khác (template "opencode" — xem project `docker-hubs` trong bộ nhớ phiên trước) và chưa được chỉnh lại cho đúng với KiraAP:

- Tham chiếu `opencode/VERSION`, `opencode/Dockerfile`, tên image `opencode` — đều **không tồn tại** trong repo này.
- `kira-docker-testing.yml` có bug: 2 bước login (GHCR + Docker Hub) đều bị comment nhưng `push: true` vẫn được set → job chắc chắn fail vì thiếu xác thực registry.
- Hai file gần như trùng lặp 100% logic, chỉ khác ở việc có push/không push và loại cache.

## 2. Công việc đã thực hiện (theo thứ tự)

### Bước 1 — Sửa `kira-docker-publish.yml`
- `name`: `OpenCode Build and Push Docker Image` → `KiraAP Build and Push Docker Image`.
- Tên image: `.../opencode` → `.../kiraap` (cả GHCR và Docker Hub).
- Đọc version: thay `cat opencode/VERSION` (file không tồn tại) bằng action tái sử dụng sẵn có `./.github/actions/set-version` — đúng cơ chế mà `changelog.yml` trong repo đang dùng (đọc file `VERSION` ở gốc nếu có, mặc định `1.0`, nối `.<run_number>`).
- `file: opencode/Dockerfile` → `file: Dockerfile` (Dockerfile thật nằm ở gốc repo).
- Bỏ tag trùng lặp run number (`VERSION` đã nhúng sẵn `run_number` từ `set-version`, không cần nối thêm `-rc${{ run_number }}` nữa).
- Bỏ `build-args: IMAGE_VERSION=...` vì Dockerfile không khai báo `ARG IMAGE_VERSION` nào.
- **Giữ nguyên comment**: trigger `push: tags: v*` và bước login Docker Hub — đây là quyết định nghiệp vụ, chưa bật theo yêu cầu người dùng ("không, vẫn giữ comment như hiện tại").

### Bước 2 — Rà soát & sửa `kira-docker-testing.yml`
- Phát hiện bug: `push: true` trong khi cả 2 bước login đều bị comment → hỏi người dùng ý định thật sự, chọn phương án **"Chỉ build, không push"**.
- Sửa `push: true` → `push: false`.
- Đổi `cache-from`/`cache-to` từ `type=registry` (vẫn cần đăng nhập để đẩy cache blob, dù ảnh chính không push) sang `type=gha` (cache của GitHub Actions, không cần auth) — tránh fail tương tự.
- Đổi tên bước `Build and push` → `Build (no push)` cho đúng hành vi thực tế.
- Bỏ khai báo `env.VERSION:` rỗng, không dùng tới.

### Bước 3 — Gom phần chung thành composite action
Hai file sau khi sửa gần như trùng lặp hoàn toàn (setup buildx, login GHCR, `Set VERSION`, `Extract metadata`, `docker/build-push-action`) — chỉ khác `push: true/false` và loại cache. Tạo **[`.github/actions/docker-build-push/action.yml`](../.github/actions/docker-build-push/action.yml)** (composite action mới, theo đúng pattern có sẵn của `.github/actions/set-version`):

- Input tham số hoá phần khác biệt: `push`, `cache-type` (`registry`|`gha`), `ghcr-image`, `dockerhub-image`, `dockerfile`, `context`, `platforms`, `github-token`.
- Login GHCR chỉ chạy khi `push == 'true'`.
- Login Docker Hub **vẫn giữ dạng comment y nguyên** (chưa bật) — bảo toàn đúng quyết định "giữ comment" trước đó.
- Logic tag/label trong `Extract metadata` giữ **nguyên 100%** so với bản gốc (dùng `github.event_name == 'push'` cho tag version/`latest`, `workflow_dispatch` cho tag `-manual`) — không đổi hành vi, chỉ đổi nơi đặt code.
- Lưu ý kỹ thuật: composite action **không** tự thấy được `secrets` context của workflow gọi nó — phải truyền `github-token` vào qua `with:`.

Sau khi gom, hai workflow gốc chỉ còn `checkout` + 1 bước gọi action dùng chung với input khác nhau:

| | `kira-docker-publish.yml` | `kira-docker-testing.yml` |
|---|---|---|
| `push` | `"true"` | `"false"` |
| `cache-type` | `registry` | `gha` |
| `github-token` | `${{ secrets.GITHUB_TOKEN }}` | *(không cần, login tự skip)* |

## 3. Files đã thay đổi

| File | Thay đổi |
|---|---|
| `.github/workflows/kira-docker-publish.yml` | Sửa image/version/dockerfile path, sau đó rút gọn còn gọi composite action |
| `.github/workflows/kira-docker-testing.yml` | Sửa bug `push:true` không login, đổi cache sang `gha`, sau đó rút gọn còn gọi composite action |
| `.github/actions/docker-build-push/action.yml` | **Mới** — composite action dùng chung cho cả 2 workflow trên |

## 4. Trạng thái hiện tại

Toàn bộ thay đổi đã được người dùng **commit thủ công** tại commit `50b07f8` ("feat: implement reusable Docker build and push action for workflows"), khớp hoàn toàn với nội dung đã đề xuất — không có sai khác.

## 5. Việc còn mở (chưa làm, để quyết định sau)

- [ ] Bật trigger `push: tags: v*` khi sẵn sàng release qua git tag (hiện đang comment ở cả 2 workflow).
- [ ] Bật login + push Docker Hub khi có nhu cầu phân phối qua Docker Hub (hiện đang comment trong composite action, cần `secrets.DOCKER_USERNAME`/`secrets.DOCKER_TOKEN` đã có sẵn tên trong `env:` nhưng chưa dùng).
- [ ] Xác minh `.env.example` trực tiếp (không đọc được do quyền thư mục trong phiên phân tích codebase trước đó) nếu cần đối chiếu biến môi trường liên quan đến build/deploy.
