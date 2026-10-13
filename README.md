# AI Video Translator

Ứng dụng chạy local với React + Vite + Tailwind CSS 4 + Lucide React, backend Python FastAPI và SQLite. Nhận video từ máy tính, nhận diện bằng Whisper CPU, dịch sang tiếng Việt qua API tương thích OpenAI, tạo SRT/TXT, lồng giọng Việt và xuất MP4 bằng FFmpeg.

Giao diện dashboard navy, tím và xanh dương, đồng nhất ở 5 trang: **Tổng quan, Dịch video, Lịch sử, Giọng đọc AI, Cài đặt**. Số liệu lấy từ SQLite và trạng thái FastAPI. Không dùng dữ liệu giả để báo thành công. Có đăng ký, đăng nhập và đăng xuất thật; tài khoản và phiên đăng nhập lưu trong SQLite. Mỗi tài khoản có lịch sử video riêng.

## Triển khai frontend lên Render Static Site

Frontend giữ React, Vite, Tailwind và các trang hiện có. `npm run build` xuất vào `frontend/dist`; Render phục vụ thư mục này bằng HTTPS, mở được trên điện thoại qua URL công khai mà không cần bật máy tính cá nhân. Static Site chỉ phục vụ giao diện; không chạy FastAPI, SQLite, Whisper hay FFmpeg. Backend chưa triển khai vẫn xem được các trang Tổng quan, Dịch video, Lịch sử, Giọng đọc AI và Cài đặt; chưa thể đăng nhập, tải lịch sử hoặc dịch video. Không có kết quả dịch giả.

Đã thêm Blueprint `render.yaml` ở thư mục gốc. Có thể dùng **New → Blueprint** sau khi mã nguồn được đưa lên GitHub, hoặc tạo **New → Static Site** thủ công với cấu hình:

| Mục | Giá trị |
| --- | --- |
| Root Directory | `frontend` |
| Build Command | `npm ci && npm run build` |
| Publish Directory | `dist` |
| Environment | `NODE_VERSION=22` |
| Backend API | `VITE_API_BASE=https://api.example.com` (thay bằng backend thật) |
| Redirects/Rewrites | Source `/*`, Destination `/index.html`, Action **Rewrite** |
| Auto Deploy | **Off** để chủ động kiểm tra rồi triển khai |

Render Static Site có hosting miễn phí và HTTPS do Render cung cấp; xem [Static Sites](https://render.com/docs/static-sites). Quy tắc SPA fallback đã có trong Blueprint; nếu tạo thủ công phải thêm trong Dashboard theo [Redirects and Rewrites](https://render.com/docs/redirects-rewrites). Rewrite giữ nguyên URL khi tải lại các đường dẫn; không tạo thêm trang mới. Các trang dashboard hiện được chọn bằng state React, nên tải lại vẫn theo hành vi ban đầu của ứng dụng.

`VITE_API_BASE` là **origin HTTPS của backend**, không thêm `/api`, query hay thông tin đăng nhập. Các yêu cầu API, upload, nghe thử và URL video đều dùng origin này. Biến được nhúng vào JavaScript lúc build: đổi giá trị phải build/deploy lại. Không đưa khóa AI, PayOS hay bí mật khác vào biến `VITE_*`. Local vẫn để trống biến và dùng proxy Vite tới cổng 8000; proxy này không tồn tại trên Static Site.

Khi chưa có backend, có thể để `VITE_API_BASE` trống để triển khai giao diện; ứng dụng mở giao diện với thông báo **Chế độ xem trước – Backend chưa được kết nối**. Không gọi API hoặc tạo dữ liệu giả; thống kê hiển thị dấu “—”, lịch sử trống. Có thể chọn video để xem cục bộ và thử các lựa chọn giao diện, nhưng dịch, nghe thử TTS, xuất, lưu cấu hình và thanh toán đều bị khóa kèm lý do. Thiết lập hiển thị là giá trị mặc định của giao diện, chưa được tải từ backend. Blueprint hỏi giá trị biến khi tạo mới; nếu chưa có URL thật, tạo Static Site thủ công và bỏ biến này. URL sai, HTTP hoặc localhost bị chặn trong frontend production. Không điền một backend ví dụ rồi coi là đã kết nối thành công.

Khi backend HTTPS đã sẵn sàng, cấu hình phía backend riêng:

- `CORS_ORIGINS` phải chứa chính xác origin frontend (ví dụ `https://translator.example.com`), không dấu `/` cuối; backend kiểm tra Origin cho thao tác ghi và cho phép credentials.
- Bật `SESSION_SECURE_COOKIE=true`. Cookie hiện dùng `SameSite=Strict`: để giữ cơ chế đăng nhập hiện tại, nên dùng frontend và backend cùng site, ví dụ `https://translator.example.com` và `https://api.example.com`. Hai địa chỉ `*.onrender.com` riêng không bảo đảm cùng site; chỉ cấu hình CORS chưa đủ. Nếu triển khai khác site, cần xử lý cookie/CSRF ở backend riêng và kiểm tra chính sách cookie trên trình duyệt điện thoại.
- Cấu hình `BILLING_FRONTEND_URL` theo URL frontend thật nếu dùng PayOS.
- SQLite, tài khoản và lịch sử vẫn nằm ở backend hiện tại; upload frontend lên Render không tự sao chép hay thay đổi dữ liệu này.

Kiểm tra trước khi đưa mã nguồn lên GitHub:

```bash
cd frontend
npm ci
npm run build
npm run preview
```

Mở bản preview để kiểm tra giao diện. Sau khi triển khai thật, mở URL HTTPS trên điện thoại và tải lại đường dẫn để kiểm tra rewrite trên Render. Khi có backend thật, kiểm tra đăng nhập, upload, nghe thử và lịch sử. Không chạy test backend trên SQLite đang dùng chỉ để kiểm tra static build.

## Chạy trên workspace hiện tại

Đã tạo venv Python **3.11.17** trong `backend/.venv`, cài đủ requirements, FFmpeg Intel trong `backend/.tools` và tải model Whisper `base` vào `backend/.models`. Những thư mục này không được commit. Venv Python 3.14 cũ giữ ở `backend/.venv-python314`. App tự tìm FFmpeg trong `.tools` trước khi dùng PATH. Khi ffprobe không có, PyAV đọc codec/thời lượng.

Mở thư mục dự án bằng VS Code. Terminal thứ nhất:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Terminal thứ hai:

```bash
cd frontend
npm run dev
```

Mở **http://127.0.0.1:5173**. Tài liệu API: **http://127.0.0.1:8000/docs**. Có thể dùng **Terminal → Run Task → Start AI Video Translator**. Dừng bằng Ctrl+C hoặc **Terminal → Terminate Task**. Chọn `backend/.venv/bin/python` bằng **Python: Select Interpreter**.

Mở ứng dụng → **Đăng ký** bằng họ tên, email và mật khẩu ít nhất 10 ký tự, xác nhận mật khẩu. Đăng ký thành công sẽ đăng nhập ngay. Những lần sau dùng **Đăng nhập**; nút **Đăng xuất** ở góc phải header.

Tài khoản đầu tiên là quản trị viên và tiếp nhận lịch sử video cũ chưa có chủ sở hữu. Các tài khoản sau có lịch sử riêng. Chỉ quản trị viên thay đổi cấu hình AI chung.

Vào **Cài đặt**, nhập base URL, model và API key của dịch vụ dịch rồi nhấn **Lưu cấu hình**. Key được lưu trong `backend/.env` (quyền 600, gitignored), không trả về frontend. Để trống key khi lưu sẽ giữ key cũ; dùng checkbox để xóa. Khi có job đang xử lý, backend chặn đổi cấu hình.

## Cài từ đầu trên macOS Intel

Cần Python **3.11 hoặc 3.12**, Node.js **20.19+ hoặc 22+** và FFmpeg có bộ lọc `subtitles` (libass), encoder libx264. Nếu Homebrew hỗ trợ máy bạn:

```bash
brew install python@3.11 node ffmpeg
ffmpeg -filters | grep subtitles
/usr/local/bin/python3.11 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
```

Nếu đã có venv dùng Python khác, đổi tên nó trước khi tạo mới, không ghi đè venv đang hoạt động. Nếu Homebrew phải biên dịch nhiều dependencies trên Intel, có thể dùng Python độc lập của [uv](https://docs.astral.sh/uv/guides/install-python/) và bản FFmpeg Intel của [Evermeet](https://evermeet.cx/ffmpeg/). Trên workspace này đã dùng cách đó; FFmpeg có libass và libx264, không cần cài toàn hệ thống.

Từ thư mục frontend:

```bash
cd frontend
npm install
npm run dev
```

Các biến môi trường mẫu ở `backend/.env.example` và `frontend/.env.example`. Có thể cấu hình trực tiếp bằng `.env` nếu không dùng biểu mẫu Cài đặt:

```bash
cp backend/.env.example backend/.env
```

Chỉ sao chép nếu chưa có `.env`, tránh ghi đè key/cấu hình đã lưu. Ví dụ cấu hình:

```dotenv
TRANSLATION_BASE_URL=https://api.openai.com/v1
TRANSLATION_API_KEY=your-key-here
TRANSLATION_MODEL=gpt-4o-mini
WHISPER_MODEL=base
DEFAULT_VOICE=female
DEFAULT_SOURCE_LANGUAGE=auto
```

Dịch vụ phải hỗ trợ Chat Completions và JSON mode. API local không cần key: đặt base URL/model rồi bật `TRANSLATION_ALLOW_NO_KEY=true` hoặc checkbox tương ứng. API dùng HTTP chỉ được lưu qua giao diện nếu ở localhost; API ngoài dùng HTTPS. Khởi động lại backend sau khi sửa `.env` thủ công. Khi lưu từ giao diện, cấu hình có hiệu lực ngay cho job tiếp theo.

## Quy trình sử dụng

1. Chọn MP4, MOV hoặc WebM trong **Dịch video**. Có thể xem video gốc trước khi tải.
2. Chọn ngôn ngữ gốc (tự nhận diện hoặc ngôn ngữ cụ thể) và giọng Hoài My/nữ hoặc Nam Minh/nam. Đầu ra hiện chỉ hỗ trợ **tiếng Việt**. Lựa chọn ngôn ngữ gốc được gửi thật đến Whisper; cố định cho video đã tải. Tạo video mới nếu cần đổi ngôn ngữ gốc.
3. Nhấn **Bắt đầu dịch video**. Phần trăm tải tệp lấy từ tiến độ truyền dữ liệu; tiến độ xử lý lấy từ các bước và số đoạn thực tế trên backend. Không phải ước lượng thời gian còn lại.
4. Xem video gốc và đã dịch cùng lúc, hoặc chuyển riêng từng khung. Bản dịch xuất hiện chỉ khi FFmpeg thành công. MOV/codec không tương thích có thể không phát được trước khi chuyển sang MP4.
5. Sửa chữ và thời gian (giây) trong bảng phụ đề. Không chồng lấn, phải nằm trong thời lượng video. Nhấn số đoạn để tua video. Có cảnh báo rời trang khi chưa lưu.
6. **Lưu thay đổi** cập nhật SRT/TXT; **Xuất video MP4** lưu sửa đổi và tạo lại video/giọng đọc. Bản MP4 trước vẫn được giữ đến khi lần xuất mới thành công. Giao diện đánh dấu rõ khi đang xem bản cũ.
7. Tải SRT/TXT sau khi lưu; tải MP4 đã xuất. **Lịch sử** hỗ trợ tìm tên, lọc trạng thái và mở lại để chỉnh sửa. Tổng quan lấy số liệu thật từ lịch sử.
8. **Giọng đọc AI** cho phép nhập tối đa 500 ký tự và nghe thử với nội dung của bạn qua dịch vụ TTS thật.

## Những phần phụ thuộc dịch vụ

- **Whisper:** `faster-whisper`, CPU int8. Lần đầu tải model; các lần sau dùng cache `backend/.models`. Model `base` đã tải trên workspace này. Model lớn hơn chậm và tốn RAM hơn trên Intel. Có thể cấu hình đường dẫn model qua `.env`; biểu mẫu Cài đặt cung cấp các model tiêu chuẩn.
- **Dịch thuật:** cần key/API của bạn. Giao diện kiểm tra cấu hình trước khi tải để tránh xử lý thất bại vì thiếu dịch vụ. Không kiểm tra được quota/quyền chỉ bằng sự tồn tại của key; lỗi API thật sẽ hiện trên job. Video chọn ngôn ngữ gốc `vi` bỏ qua dịch nên không cần key. API dịch chỉ nhận văn bản nhận diện.
- **TTS:** `edge-tts` gọi dịch vụ Edge trực tuyến, không cần key riêng, phụ thuộc Internet và khả dụng dịch vụ. Giọng đọc nam/nữ đã gọi thử thành công. Văn bản tiếng Việt gửi đến dịch vụ TTS; không có SLA bảo đảm. Đổi tên voice qua `TTS_MALE_VOICE`/`TTS_FEMALE_VOICE` trong `.env`.
- **FFmpeg:** xuất H.264/AAC, đốt phụ đề vào hình. Âm thanh gốc được thay bằng giọng AI, không giữ nhạc nền. Khoảng trống lời nói là im lặng; câu dài được tăng tốc vừa đoạn. Chưa có lip-sync, clone giọng, tách người nói hay giữ nhạc nền.
- **Giới hạn:** mặc định **1 GB mỗi video (1024 MB)** và 60 phút, chỉnh được trong Cài đặt. Tệp trung gian được dọn sau xử lý; video gốc, bản xuất và lịch sử giữ lại. Chưa có nút xóa dữ liệu.
- **Local:** đã có tài khoản, phiên đăng nhập và phân quyền video theo chủ sở hữu. Chưa có quota theo tài khoản hay hàng đợi bền vững. Bind `127.0.0.1`; không triển khai API này trực tiếp ra Internet. Một tiến trình, một job tại một thời điểm; không chạy nhiều uvicorn workers. Job gián đoạn khi restart được đánh dấu lỗi để retry. Tránh `--reload` khi có job chạy.
- Chỉ nhận file video từ máy tính, không tải từ nền tảng bên thứ ba.

## Cấu trúc

```
frontend/
  src/App.jsx                 5 trang và kết nối backend
  src/api.js                  HTTP, upload progress, ngôn ngữ
  src/components/             Panel, progress, voice picker
  src/fonts/                  Font local và giấy phép OFL
  src/styles.css              Dashboard responsive, Tailwind theme
  tests/dashboard.spec.js     Kiểm tra Chrome desktop/mobile
  playwright.config.js
backend/
  app/main.py                 REST API, upload, exports
  app/auth.py                 Đăng ký, phiên đăng nhập, băm mật khẩu
  app/preferences.py          Cấu hình và bảo vệ API key
  app/pipeline.py             Whisper → dịch → TTS → FFmpeg
  app/db.py                   SQLite, migration tương thích lịch sử cũ
  app/config.py               Environment, đường dẫn công cụ
  tests/test_api.py
  scripts/verify_pipeline.py  Kiểm thử media thật, dữ liệu tạm riêng
  data/                      Video và SQLite (gitignored)
.vscode/tasks.json            Khởi động hai server
```

## Kiểm tra

```bash
cd backend
source .venv/bin/activate
pytest -q
python -m compileall app scripts
```

```bash
cd frontend
npm run build
# Cần Google Chrome; test tự chạy API/Vite với database tạm riêng:
npm run test:e2e
```

Kiểm thử TTS/Whisper/FFmpeg thật, cần Internet và tải model nếu chưa cache:

```bash
cd backend
.venv/bin/python scripts/verify_pipeline.py
```

Script tạo video tiếng Việt từ câu thử, nhận diện thật, lồng tiếng và xuất MP4/SRT/TXT trong thư mục tạm, không thêm video vào lịch sử người dùng. Không gọi API dịch trả phí. Đây là kiểm thử pipeline âm thanh/video, không xác nhận chất lượng dịch tiếng nước ngoài khi chưa có API key. Xem [VERIFICATION.md](VERIFICATION.md) cho kết quả thực tế.

## Khắc phục lỗi

- Thiếu FFmpeg: cài bản có libass/libx264, hoặc đặt binary trong `backend/.tools/ffmpeg`; có thể dùng `FFMPEG_BIN`/`FFPROBE_BIN` trong `.env` để chỉ đường dẫn. `ffprobe` là tùy chọn nhờ PyAV.
- Thiếu Whisper trên Python 3.14: tạo lại venv bằng Python 3.11, cài requirements; kiểm tra kiến trúc bằng `uname -m` (Intel: x86_64).
- API 401/403: kiểm tra key/quyền. 429: kiểm tra quota. JSON sai: dùng model hỗ trợ JSON mode. Mỗi batch phải trả `{"translations":[...]}` cùng số lượng câu.
- TTS thất bại: kiểm tra Internet và nghe thử. Nếu dịch vụ đổi giao thức, cập nhật edge-tts hoặc adapter `speak`.
- Không kết nối frontend: backend phải chạy trên cổng 8000. Nếu Vite đổi cổng, thêm origin vào `CORS_ORIGINS`. `VITE_API_BASE` dùng khi frontend/API khác origin; build lại khi đổi.
- Không nhận diện lời nói: dùng audio rõ. VAD có thể bỏ qua nhạc/tiếng quá nhỏ.

Tham khảo: [faster-whisper](https://github.com/SYSTRAN/faster-whisper), [edge-tts](https://github.com/rany2/edge-tts), [Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [Tailwind + Vite](https://tailwindcss.com/docs/installation/using-vite).

## Tài khoản và phiên đăng nhập

- Đăng ký bằng họ tên, email và mật khẩu 10–128 ký tự. Email được chuẩn hóa chữ thường, không cho đăng ký trùng. Xác nhận mật khẩu được kiểm tra ở giao diện.
- Mật khẩu dùng PBKDF2-HMAC-SHA256 với salt ngẫu nhiên và 600.000 vòng; không lưu mật khẩu dạng rõ. [Tham khảo OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- Phiên dùng token ngẫu nhiên; SQLite chỉ lưu SHA-256 của token. Cookie HttpOnly, SameSite=Strict, mặc định 7 ngày. Đăng xuất thu hồi phiên trên backend, không chỉ xóa giao diện. Không lưu token trong localStorage.
- API lịch sử, chi tiết, video gốc/bản xuất, phụ đề, retry/export và nghe thử đều yêu cầu đăng nhập. Đoán ID video tài khoản khác trả 404. API cấu hình chung yêu cầu quản trị viên khi ghi.
- Có giới hạn thử đăng nhập/đăng ký theo IP/email và kiểm tra Origin cho thao tác ghi. Dùng cùng hostname cho frontend và API (ví dụ 127.0.0.1); khác hostname có thể bị SameSite chặn cookie.
- Đăng ký hiện tạo tài khoản trên máy đang chạy backend, chưa gửi email xác minh hoặc hỗ trợ quên mật khẩu. Không giả vờ gửi email/OTP. Khi triển khai HTTPS, bật `SESSION_SECURE_COOKIE=true`. Phiên bản này vẫn dành cho localhost.
- Kiểm thử Chrome chạy API cổng 8001 và Vite 5174 với dữ liệu tạm riêng, không tạo tài khoản thử trong dữ liệu thật của bạn.

## Dung lượng video

Trần hệ thống là **1 GB mỗi video**, tương ứng `MAX_UPLOAD_MB=1024` (1.073.741.824 bytes). Backend đọc/ghi tệp theo từng khối 1 MB và kiểm tra hạn mức tài khoản. Frontend hiển thị cùng hạn mức Free/Pro. Quản trị viên có thể điều chỉnh trần trong Cài đặt.

Tài khoản mới dùng **Free: 500 MB/video**. **Pro: 49.999 VNĐ/30 ngày, 1 GB/video**. Chủ workspace (admin) được cấp quyền 1 GB để vận hành, không được ghi nhận là đã thanh toán. Giới hạn hệ thống `MAX_UPLOAD_MB` là trần chung cho cả hai gói. Tài khoản thường đã tồn tại chuyển sang Free nếu chưa mua Pro; video cũ vẫn được giữ.

## Thanh toán Pro bằng PayOS

Trang **Gói dịch vụ** có giá, quyền hiện tại, thời hạn, nút nâng cấp/gia hạn và lịch sử thanh toán riêng của tài khoản. Khi chưa cấu hình PayOS, nút thanh toán bị vô hiệu hóa và backend trả 503. Không có giao dịch giả hoặc tự mở Pro từ URL chuyển hướng.

1. Tạo và xác minh tài khoản/kênh thanh toán trên [PayOS](https://my.payos.vn). Lấy Client ID, API Key và Checksum Key theo [tài liệu chính thức](https://payos.vn/docs/api/).
2. Điền **chỉ ở backend/.env**, không đưa khóa vào frontend hoặc Git:

```dotenv
PAYOS_CLIENT_ID=your-client-id
PAYOS_API_KEY=your-api-key
PAYOS_CHECKSUM_KEY=your-checksum-key
BILLING_FRONTEND_URL=http://localhost:5173
PRO_PRICE_VND=49999
PRO_DAYS=30
MAX_UPLOAD_MB=1024
```

3. Khởi động lại backend. `BILLING_FRONTEND_URL` phải đúng hostname đang mở website, để quay về vẫn dùng phiên đăng nhập. Khi triển khai công khai, dùng địa chỉ HTTPS của frontend, cấu hình CORS và cookie phù hợp; reverse proxy cần cho phép upload ít nhất 1 GB. Mã nguồn local hiện không tự triển khai hosting.
4. Cấu hình webhook kênh PayOS đến **`https://<backend-domain>/api/billing/webhook/payos`**. PayOS không truy cập được localhost; cần backend HTTPS công khai khi nhận webhook thật. Website cũng hỗ trợ nút **Kiểm tra thanh toán**, backend gọi PayOS để đối soát nên có thể dùng mà chưa nhận webhook.
5. Người dùng chọn Nâng cấp Pro, được đưa đến trang QR PayOS. Sau khi chuyển khoản, quay lại website hoặc nhấn Kiểm tra thanh toán. Backend xác minh mã đơn, số tiền và trạng thái PAID qua API PayOS trước khi cộng quyền. Gia hạn cộng 30 ngày từ thời hạn còn lại hoặc hiện tại, không tự trừ tiền định kỳ.

Đơn lưu số tiền/thời hạn tại lúc tạo. Một tài khoản chỉ có một đơn đang tạo/chờ; nhấn lại sử dụng cùng đơn. Giao dịch trùng hoặc webhook gửi lại không cộng thời hạn hai lần. Đơn và video của tài khoản khác không truy cập được. Khi lỗi mạng lúc tạo, giữ đơn để đối soát, tránh tạo đơn thứ hai có thể bị thu tiền hai lần. Nếu PayOS xác nhận đơn chưa được tạo và API đối soát không tìm thấy, quản trị viên cần kiểm tra trên PayOS và xử lý đơn `creating` trước khi tạo lại; không tự giả định thanh toán thất bại.

**Đã kiểm tra:** backend với gateway mock trong tests, chữ ký, đủ tiền, quyền Free/Pro, chống cấp quyền trùng, cách ly tài khoản và build giao diện. **Chưa kiểm tra giao dịch tiền thật:** cần ba khóa PayOS, tài khoản/kênh đã xác minh và chuyển khoản thực tế. Không có khóa nào được ghi sẵn trong mã nguồn.

Kiểm tra chế độ xem trước không cần backend (sau `npm run build`, tại `frontend`): `npx playwright test --config playwright.preview.config.js`. Kiểm tra các trang, thao tác bị khóa, không gọi API và chiều rộng 375/390/430 px của iPhone cùng desktop.
