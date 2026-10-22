# Công nghệ – Bộ công cụ MPLIS

So sánh hai cách dựng bản gộp, khuyến nghị một cách, và phương án ghi log ra Postgres (chỉ hỏi, chưa làm). Thiết kế xem [KIEN_TRUC.md](KIEN_TRUC.md).

## 1. Hai phương án

**(a) Giữ JS thuần, không build.** Như hai bản cũ: file `.js` cổ điển, nạp theo thứ tự trong `manifest.json`, biến toàn cục có tiền tố `ADX…`. Test bằng `node:test` có sẵn trong Node.

**(b) TypeScript + WXT (hoặc Vite + CRXJS), React cho Side Panel, Vitest cho luật thuần.** Viết `.ts` / `.tsx`, build ra thư mục `dist` / `.output`, rồi Load unpacked thư mục build.

| Tiêu chí | (a) JS thuần | (b) TS + WXT/CRXJS + React + Vitest |
|---|---|---|
| Cài và cập nhật | Load unpacked thẳng thư mục mã nguồn. Sửa xong ⟳ + F5 | Phải `npm install` + build, Load unpacked thư mục **build**. Mỗi lần sửa phải build lại |
| Người dùng tự chỉnh `config.js` (HUONG_DAN cũ hướng dẫn đổi `csvSeparator`, tốc độ) | Vẫn làm được | Mất: cấu hình bị đóng gói, sửa phải build lại |
| Kiểm phiên bản (bất biến 9) | So 3 nơi như cũ: manifest đang nạp, code trên đĩa, content script | Thêm nơi thứ 4 là bản build. Quên build thì "code trên đĩa" khác "code đang chạy" |
| Chuyển code cũ | **Chuyển nguyên văn**, diff nhỏ, dễ soát | **Viết lại** sang TS / React, diff lớn, dễ lệch hành vi (R1) |
| Test so với bản cũ (golden) | Hai bên cùng dạng script, nạp bằng `node:vm` | Làm được nhưng phải nạp code cũ (script) cạnh module TS qua Vitest |
| Kiểm kiểu | Không bắt buộc. Có thể thêm `// @ts-check` + JSDoc, VS Code tự kiểm, không cần cài gì | Có: kiểu cho JSON đơn, hợp đồng công cụ, tin nhắn |
| Thêm công cụ | Thêm thư mục + **một dòng** trong `manifest.json` | Có thể **không cần dòng nào**: tự tìm `tools/*/tool.ts` bằng `import.meta.glob` |
| Module, phạm vi biến | Biến toàn cục, thứ tự file quan trọng | ES module, import rõ ràng |
| Giao diện | DOM thuần (như cũ, ~340 dòng) | React: dễ tách thành phần khi giao diện lớn lên |
| Mã bên thứ ba chạy cạnh phiên đăng nhập MPLIS | **Không có** | Có (React và mã runtime của bộ build nằm trong bundle). Cây dependency khi build thường lên tới hàng trăm gói |
| Công cụ cần trên máy người sửa | Trình soạn thảo + Node (chỉ để chạy test) | Node + npm + mạng để cài gói |
| Phát triển | ⟳ bằng tay | Có chế độ dev tự nạp lại |

## 2. Khuyến nghị: **(a) JS thuần, không build**

Lý do, theo thứ tự quan trọng:

1. **An toàn.** Extension giữ token của phiên đăng nhập và có quyền ghi dữ liệu đăng ký đất đai. Không có mã bên thứ ba thì không có rủi ro chuỗi cung ứng.
2. **Giữ nguyên hành vi.** Gộp là chuyển code, không viết lại. (a) cho diff nhỏ nhất, golden test so trực tiếp với code cũ (lúc chuyển nạp từ `legacy/`, nay đọc kết quả đã chốt trong `test/golden/`).
3. **Bất biến 9 giữ đơn giản**, và cách chỉnh `config.js` mà HUONG_DAN cũ dạy vẫn dùng được.
4. **Kích thước nhỏ.** Hai bản cộng lại ~2 500 dòng, sau gộp còn ít hơn. Lợi ích của kiểu và React chưa bù được chi phí build.

Cái mất (chấp nhận): không có kiểm kiểu bắt buộc, phải thêm một dòng manifest cho mỗi công cụ, biến toàn cục. Nếu sau này có nhiều công cụ hoặc nhiều người cùng sửa thì chuyển sang (b) vẫn dễ: `rules.js` thuần và `api` hẹp sẽ là ranh giới để chuyển từng phần.

## 3. Dependency

### 3.1. Phương án (a): không có dependency

| Thành phần | Nguồn | Lý do |
|---|---|---|
| Runtime extension | Chrome API (MV3) | Không thư viện ngoài |
| `node:test`, `node:assert` | có sẵn trong Node | Chạy test, không cần Vitest |
| `node:vm` | có sẵn trong Node | Nạp script cũ / mới trong ngữ cảnh riêng, giả `chrome`, `fetch`. File của extension không phải sửa |
| (tuỳ chọn) `// @ts-check` + JSDoc | VS Code có sẵn | Gợi ý kiểu trong trình soạn thảo, không cài gói |

**Node tối thiểu: 20** (`node:test` ổn định từ bản 20). Đã chạy trên **v22.16.0**, chưa thử trên 20. Chỉ máy chạy test cần Node; extension chạy trong Chrome, không cần Node.

Lệnh test, chạy ở thư mục gốc: `node --test test/*.test.mjs`. Trên Node 22, `node --test test/` (truyền thư mục) **không** chạy được, nên phải dùng mẫu `*.test.mjs` như trên. Không có `package.json`.

Muốn thêm gói (ví dụ `@types/chrome` để có gợi ý kiểu tốt hơn) thì phải hỏi và được duyệt trước (đề bài, mục Ranh giới hành động).

### 3.2. Phương án (b): để tham khảo, KHÔNG cài

| Gói | Lý do |
|---|---|
| `typescript` | Kiểm kiểu |
| `wxt` | Build, sinh `manifest.json` từ các entrypoint, chế độ dev tự nạp lại (thay cho dòng dưới) |
| hoặc `vite` + `@crxjs/vite-plugin` | Build extension MV3 bằng Vite (thay cho `wxt`). Phải kiểm tình trạng bảo trì của plugin lúc chọn |
| `react`, `react-dom` | Giao diện Side Panel |
| `@wxt-dev/module-react` (WXT) hoặc `@vitejs/plugin-react` (Vite) | Biên dịch JSX / React |
| `@types/react`, `@types/react-dom` | Kiểu cho React |
| `@types/chrome` | Kiểu cho Chrome API (WXT đã có kiểu riêng nên có thể không cần) |
| `vitest` | Test luật thuần. WXT có tiện ích test đi kèm |

## 4. Ghi log ra Postgres: phương án và câu hỏi (KHÔNG làm trong 3.0.0)

Đã chốt (H9): bản 3.0.0 không ghi ra Postgres. Lõi giữ **một điểm ghi nhật ký duy nhất** là `ADXLog.write(ns, batch)` trong `core/log.js`. Sau này chỉ cần gắn nơi gửi vào đó, không sửa công cụ nào. Sáu câu hỏi cuối mục này chờ trả lời.

**Vì sao cần API trung gian:** extension chạy trong trình duyệt, chỉ gọi được HTTP(S). Nó không mở được kết nối TCP tới Postgres, và không được để mật khẩu cơ sở dữ liệu trong extension. Vì vậy phải có một API HTTP đứng giữa.

| | Phương án | Được | Mất |
|---|---|---|---|
| P1 | **API nhỏ tự viết** (Node hoặc Python) đặt trong mạng nội bộ: `POST /logs` nhận một lô bản ghi rồi `INSERT … ON CONFLICT DO NOTHING` | Kiểm soát hết, kiểm dữ liệu đầu vào ở máy chủ | Phải viết, vận hành, sao lưu thêm một dịch vụ |
| P2 | **PostgREST** đứng trước Postgres: sinh REST từ bảng, phân quyền bằng role + JWT | Gần như không viết code máy chủ | Phải cấu hình role / JWT cẩn thận. Vẫn phải vận hành một dịch vụ |
| P3 | Postgres có REST dựng sẵn trên đám mây (Supabase…) | Nhanh | **Họ tên chủ sử dụng đất ra khỏi cơ quan.** Phải xem quy định về bảo vệ dữ liệu cá nhân và an toàn thông tin của ngành trước |
| P4 | **Không nối trực tiếp:** xuất CSV như hiện nay rồi nạp vào Postgres bằng `\copy` (thủ công hoặc theo lịch) | Không thêm hạ tầng, không thêm quyền cho extension | Không theo thời gian thực |

Nếu chọn P1 hoặc P2, thiết kế dự kiến (để trao đổi, chưa làm):

- Gửi từ **background service worker**, không gửi từ content script. Thêm `host_permissions` cho đúng địa chỉ API. Chrome sẽ hỏi lại quyền khi cập nhật.
- **Hàng đợi gửi đi** trong storage (`core:outbox:*`). Lần chạy không bao giờ chờ máy chủ log. Gửi lại khi lỗi. Khoá chống trùng là `(tool, maDon, seq, máy)`.
- **Tuyệt đối không gửi token hay `listBody`** (bất biến 1). Chỉ gửi đúng các cột nhật ký (KIEN_TRUC.md mục 7.2).
- Xác thực bằng khoá riêng của extension, **không dùng token MPLIS**.
- Nằm ở `ADXLog.write` trong `core/log.js` (sau khi ghi `chrome.storage` thì đưa vào hàng đợi), nên công cụ không phải sửa gì.

**Câu hỏi cần trả lời trước khi làm:**

1. Postgres đặt ở đâu (máy trong cơ quan, máy chủ của Sở, đám mây)? Máy chạy Chrome có tới được không?
2. Ai viết và vận hành API trung gian? Chọn P1, P2, P3 hay P4?
3. Có được gửi **họ tên chủ** và số phát hành / số vào sổ không, hay chỉ mã đơn + kết quả?
4. Cần thời gian thực, hay cuối ngày là đủ (khi đó P4 là rẻ nhất)?
5. Một hay nhiều máy / người dùng cùng gửi? Cần biết ai chạy không (cột người dùng)?
6. Giữ log bao lâu? Ai được đọc?
