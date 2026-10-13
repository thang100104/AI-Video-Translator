# Kết quả kiểm tra — 13/10/2026

## Môi trường hiện tại

macOS Intel x86_64, Node 24.21.0. Venv mới `backend/.venv` dùng **Python 3.11.17**; đã cài đủ `backend/requirements.txt`, bao gồm faster-whisper 1.2.1, CTranslate2 4.8.2, ONNX Runtime 1.23.2, PyAV 18.1.0 và edge-tts 7.2.8. Venv Python 3.14 cũ được giữ tại `.venv-python314`.

FFmpeg **9.0.2-tessus** tại `backend/.tools/ffmpeg`, có libass/subtitles và libx264. Nguồn: [Evermeet Intel builds](https://evermeet.cx/ffmpeg/). Python độc lập lấy bằng [uv/python-build-standalone](https://docs.astral.sh/uv/guides/install-python/). Homebrew phải build nhiều dependencies trên Intel nên lần cài đó đã dừng; các công cụ chạy trong workspace. ffprobe tải bị giới hạn HTTP 429; ứng dụng đã kiểm chứng dùng PyAV để đọc media khi không có ffprobe.

Model Whisper **base** đã tải vào `backend/.models` và được dùng trong kiểm thử thật.

## Đã kiểm chứng

- Python compileall app, scripts, tests: thành công.
- Backend pytest: **8 passed**, trên Python 3.11. Các trường hợp upload/loại tệp, lỗi thiếu dịch vụ, kiểm tra thời gian phụ đề, SRT/TXT, chặn thao tác lúc đang xử lý, ngôn ngữ gửi vào Whisper, progress, đánh dấu MP4 cũ, lưu cấu hình, giữ/xóa key và không trả secret trong response/validation.
- Frontend Vite build với React/Tailwind 4: thành công.
- npm install/audit: **0 vulnerabilities** ở thời điểm kiểm tra.
- Chrome/Playwright: **2 passed**. Điều hướng cả 5 trang, trạng thái API thật, nút bắt đầu chưa có video, tìm lịch sử, thư viện giọng, cấu hình; kiểm tra mobile 390px, menu và chọn sai loại tệp, không tràn ngang. Nút kiểm tra hệ thống không tự lưu biểu mẫu.
- FastAPI trên localhost:8000, Vite trên localhost:5173 và proxy `/api/health`: HTTP 200. Health thực tế: FFmpeg/Whisper/TTS sẵn sàng, dịch thuật chưa cấu hình.
- Đã kiểm tra trực quan ảnh dashboard desktop từ Chrome thật.
- Nghe thử giọng nữ và nam qua TTS thật: các lần gọi trả MP3 HTTP 200 (20.160 và 19.440 bytes trong lần kiểm tra đầu).
- Font Be Vietnam Pro lưu local cùng giấy phép OFL; không gọi Google Fonts khi mở dashboard.

## Kiểm thử video thật

Lệnh: `backend/.venv/bin/python backend/scripts/verify_pipeline.py` (hoặc từ backend: `.venv/bin/python scripts/verify_pipeline.py`).

Script tạo một video từ câu thử tiếng Việt qua TTS, xử lý bằng Whisper CPU int8 thật, đồng bộ giọng đọc và FFmpeg đốt phụ đề vào hình. Không mock nhận diện/TTS/FFmpeg, không dùng dữ liệu người dùng và không thêm job vào lịch sử workspace.

Kết quả:

- Trạng thái `done`, ngôn ngữ `vi`.
- Thời lượng video: **10,583333 giây**.
- **2 đoạn** phụ đề được nhận diện thật.
- MP4 xuất: **83.398 bytes**, có video và audio.
- SRT/TXT đã tạo, chứa văn bản UTF-8 không rỗng.
- Đã trích và xem frame tại giây 3: phụ đề tiếng Việt hiển thị đúng dấu, đốt vào video.
- Không gọi API dịch (video tiếng Việt bỏ qua bước dịch theo thiết kế).

Artifacts riêng tại `/private/var/folders/nc/1fgl2l995lx3l7mlfb_k7zmh0000gn/T/ai-video-translator-verification-3us9fx4p/cd493e9002ba4f81a2dd7733095389db/`.

## Phần chưa kiểm chứng

Chưa gọi một API dịch thật vì người dùng chưa cung cấp dịch vụ/key. Adapter Chat Completions, JSON validation và lỗi cấu hình đã kiểm thử bằng mock; chưa xác nhận chất lượng dịch video nước ngoài hoặc hạn mức API. Cấu hình ở trang Cài đặt để dùng phần này. Trạng thái “sẵn sàng” chỉ phản ánh có dependencies/cấu hình, không bảo đảm quota hay khả dụng dịch vụ từ xa.

Chưa đánh giá chất lượng nhiều video dài, nhiều người nói, ngôn ngữ khác, tốc độ trên video 60 phút hoặc tính khả dụng lâu dài của dịch vụ Edge. Đây là ứng dụng một người dùng trên localhost, chưa dành cho public hosting.

## Bổ sung tài khoản — 13/10/2026

- Đã thêm đăng ký, đăng nhập, `/me`, đăng xuất thật và SQLite users/sessions.
- Mật khẩu PBKDF2-SHA256 600.000 vòng với salt ngẫu nhiên, session token ngẫu nhiên lưu hash trong DB; cookie HttpOnly/SameSite=Strict.
- Bảo vệ API job, files, sửa phụ đề, retry/export, TTS và settings. Các tài khoản không đọc được video của nhau. Cấu hình AI chỉ cho admin ghi.
- Tài khoản đầu tiên nhận quyền admin và tiếp nhận job cũ chưa có chủ sở hữu; migration giữ dữ liệu cũ.
- Backend: **12 passed**, gồm kiểm tra mật khẩu/token không lưu dạng rõ, thu hồi/expiry phiên, email trùng, rate limit, Origin, phân quyền đọc/ghi/tải file, kế thừa lịch sử cũ.
- Chrome: **4 passed**, gồm đăng ký từ biểu mẫu, xác nhận mật khẩu, tự đăng nhập, giữ phiên sau reload, đăng xuất, sai mật khẩu, đăng nhập lại, quyền settings và mobile.
- Kiểm thử Chrome tự chạy API 8001 và Vite 5174 với database tạm. Không tạo tài khoản thử trong database thật. Backend thật được khởi động lại trên 8000 sau khi xác nhận không có job đang xử lý.
- Chưa tích hợp email xác minh, khôi phục mật khẩu hay OAuth. Tài khoản hiện thuộc máy chạy ứng dụng, không phải tài khoản của nền tảng bên ngoài.

## Gỡ nguồn video bằng link

Theo yêu cầu mới, đã gỡ ô dán link, iframe YouTube, nút dịch từ link, route nhập YouTube, downloader, script/test/cấu hình liên quan và thư viện yt-dlp/yt-dlp-ejs. Ứng dụng chỉ nhận MP4/MOV/WebM từ máy tính. Cập nhật README và giữ lịch sử/tài khoản hiện có.

Backend: **12 passed**; Vite build thành công. Các cột metadata nguồn đã từng thêm trong SQLite cũ được giữ để không phá dữ liệu, không còn được trả về hoặc sử dụng bởi API.
Chrome sau khi gỡ link: **4 passed** (đăng ký/đăng nhập, dashboard, chọn file và mobile). Proxy frontend → backend trả HTTP 200.

## Giới hạn 1 GB mỗi video

Đã nâng `MAX_UPLOAD_MB` lên 1024 trong cấu hình đang dùng, giá trị mặc định và .env.example. Frontend hiển thị 1 GB và dùng cùng giới hạn từ backend; backend vẫn đọc/ghi theo khối 1 MB. Health API thật xác nhận `max_upload_mb=1024` sau restart. Build thành công, backend **12 passed**.

Chưa chạy upload/xử lý một file video thật 1 GB trong lần kiểm tra này. Chưa có thanh toán hoặc gói Pro; đây là nâng giới hạn bằng cấu hình ứng dụng local.

## Gói Pro và PayOS

- Giá cấu hình mặc định 49.999 VNĐ / 30 ngày; Free 500 MB/video, Pro 1024 MB/video, chịu trần MAX_UPLOAD_MB.
- Quyền tài khoản và thời hạn lưu SQLite. Admin có quyền 1 GB vận hành, không giả ghi nhận một giao dịch đã trả tiền.
- Backend pytest: **15 passed**, có kiểm thử PayOS mock: tạo/reuse đơn, chữ ký checkout/webhook, sai số tiền không cấp quyền, xác minh PAID, không cộng thời hạn hai lần, quyền sở hữu đơn, Pro hết hạn về Free và kích hoạt lại.
- Chrome/Playwright: **5 passed**, có kiểm thử trang gói dịch vụ và trạng thái chưa cấu hình PayOS, responsive 390px. Dùng database tạm và khóa PayOS rỗng, không tạo giao dịch tiền thật.
- Frontend production build và Python compileall thành công. Proxy website chính `/api/health` HTTP 200 sau khi khởi động lại backend.
- Chưa xác nhận giao dịch tiền thật, webhook qua Internet hoặc chuyển khoản ngân hàng: cần tài khoản merchant và ba khóa PayOS. Không triển khai công khai tự động.

## Kiểm tra lại ngày 13/10/2026

- Giá Pro thực tế trong cấu hình: **49.999 VNĐ / 30 ngày**, trần hệ thống 1024 MB. API dịch và PayOS chưa có khóa; không gọi API dịch trả phí hay tạo giao dịch tiền thật.
- Backend: **17 passed**. Đã thêm kiểm thử TTS thử lại khi lỗi tạm thời và không để lại file âm thanh dở dang khi thất bại. `pip check`: không có dependencies bị hỏng; compileall thành công.
- Frontend: production build thành công. Website chính và proxy `/api/health` trả HTTP 200 sau khi khởi động lại backend.
- Kiểm thử pipeline thật lần đầu gặp `NoAudioReceived` từ dịch vụ TTS. Đã bổ sung tối đa 3 lần thử với thời gian chờ có giới hạn, xóa file dở dang và thông báo lỗi rõ ràng. Chạy lại thành công: video 10,583 giây, 2 đoạn phụ đề, MP4 82.031 bytes, có cả video/audio; SRT và TXT có nội dung. Bài thử dùng lời tiếng Việt nên không gọi API dịch; không xác nhận chất lượng dịch video nước ngoài.
- Giọng nam thật trả MP3 32.688 bytes; giọng nữ được dùng trong pipeline thật thành công. Dịch vụ TTS vẫn phụ thuộc Internet và có thể gặp lỗi tạm thời.
- Kiểm thử dùng dữ liệu tạm, không thêm tài khoản/video vào lịch sử thật. Chưa thử tải một file thật dung lượng đủ 1 GB hoặc kiểm thử tải nhiều người dùng đồng thời.
- Chrome/Playwright chạy lại riêng: **5 passed**, kiểm tra đăng ký/đăng nhập/đăng xuất, phiên đăng nhập, quyền cấu hình, các trang dashboard, Pro và responsive. Lần chạy song song với kiểm thử video/backend có 1 ca đăng ký vượt timeout 60 giây; cùng ca chạy lại riêng đạt 20,7 giây. Không thay timeout hoặc bỏ kiểm thử để có kết quả đạt.
