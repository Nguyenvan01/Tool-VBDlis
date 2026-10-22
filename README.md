# Tool-VBDlis – Bộ công cụ hỗ trợ VBDLIS (MPLIS)

Extension Chrome giúp cán bộ xử lý **đơn đăng ký trên MPLIS** (`*.mplis.gov.vn`) hàng loạt: duyệt đơn, gỡ duyệt, đánh Không xử lý cả đợt, duyệt ĐVHC 2 cấp. Có ghi log và xuất CSV.

Extension gọi thẳng API của trang, **giống hệt khi bạn bấm menu**. Nó dùng chính phiên đăng nhập của bạn, không bấm nút thay bạn và không đọc giao diện. Mọi công cụ nằm chung một **Side Panel** (khung bên cạnh trang). Mỗi lúc chỉ chạy được một công cụ.

- Phiên bản: **3.0.0**, Chrome Manifest V3
- JavaScript thuần: không cần build, không có thư viện ngoài
- Hướng dẫn sử dụng đầy đủ: [HUONG_DAN.md](HUONG_DAN.md)

---

## Các công cụ

| Tab | Công cụ | Làm gì |
|---|---|---|
| **Duyệt đơn** | Chạy tự động | Duyệt mọi đơn **chưa xử lý** của đợt đang mở theo luật (bảng dưới) |
| | Quét và sửa lỡ duyệt GCN | Tìm đơn **có Giấy chứng nhận mà đã lỡ duyệt**, rồi sửa: Bỏ duyệt khung phải → Không xử lý |
| **Gỡ duyệt** | Gỡ duyệt | Đơn đã duyệt: Bỏ duyệt khung phải → Bỏ duyệt khung trái, đơn trở về *chưa xử lý* |
| **Không xử lý hết** | Không xử lý hết | Đánh *Không xử lý* cho **mọi** đơn của đợt. Khung phải nào đã Cập nhật lịch sử thì Bỏ duyệt trước |
| **ĐVHC 2 cấp** | Duyệt ĐVHC 2 cấp | Hai khung **cùng số phát hành và cùng tên chủ** thì duyệt, không thì Không xử lý. Đơn đã xử lý sai luật thì gỡ rồi đánh lại |

### Luật của tab Duyệt đơn · Chạy tự động (tóm tắt)
Xét từ trên xuống, gặp dòng nào khớp thì dừng ở dòng đó.

| # | Đơn | Kết quả |
|---|---|---|
| 1 | Khung phải **hoặc** khung trái có bất kỳ thông tin **Giấy chứng nhận** nào | **Không duyệt** → *Không xử lý* |
| 2 | Thiếu mã gói tin / mã đơn | Kiểm tra tay, không gửi gì |
| 3 | **Mã đơn khung trái trùng mã đơn khung phải** | **Không duyệt** → *Không xử lý* |
| 4 | Khung trái không có chủ và không có đất; hoặc số tờ / số thửa để trắng, có chữ, hoặc 0 / 0 | **Không duyệt** → *Không xử lý* |
| 5 | Khung trái không có trường số tờ / số thửa; mã bản ghi khung phải không khớp; đơn đã bị Bỏ duyệt | Kiểm tra tay, không gửi gì |
| 6 | Còn lại | **Duyệt** → Trái: *Thêm vào dữ liệu vận hành* → Phải: *Cập nhật lịch sử* **chỉ các bản ghi trùng số tờ / số thửa**. Bản ghi khác để nguyên |

Chi tiết từng trường hợp: [HUONG_DAN.md](HUONG_DAN.md), mục 4.

---

## Cài đặt

1. Tải code về:
   - **Code → Download ZIP** trên GitHub rồi giải nén, **hoặc**
   - `git clone https://github.com/Nguyenvan01/Tool-VBDlis.git`
2. Mở Chrome, vào `chrome://extensions`, bật **Developer mode** (góc trên bên phải).
3. Bấm **Load unpacked**, chọn thư mục vừa tải (thư mục có file `manifest.json`).
4. Ghim extension **"Bộ công cụ hỗ trợ VBDLIS (MPLIS)"** lên thanh công cụ. Bấm vào biểu tượng để mở Side Panel.

> **Mỗi lần cập nhật code** (tải bản mới / `git pull`): vào `chrome://extensions` bấm **⟳** ở extension, rồi **F5** trang MPLIS. Nếu quên, Side Panel hiện cảnh báo ⚠ và khoá nút chạy.

> Đang dùng bản cũ (*Auto duyệt 2.1.x*, *Auto đơn 2.2.x*)? **Xuất CSV ở bản cũ rồi tắt nó** trước khi dùng bản này: [HUONG_DAN.md](HUONG_DAN.md), mục 1.

## Cách dùng

1. Đăng nhập MPLIS, **F5 trang**, rồi mở hộp thoại **"Xử lý đơn đăng ký"** của đợt cần làm. Lúc trang tải danh sách đơn, extension lấy đợt bàn giao và mã xác thực.
2. Mở Side Panel, chọn tab, bấm nút chạy, đọc kỹ câu xác nhận rồi bấm **OK**.
3. Theo dõi tiến độ trên thẻ. Chạy xong:
   - **Tải log lần chạy:** CSV chỉ gồm các đơn của lần vừa chạy.
   - **Xuất CSV** ở thẻ Thống kê: toàn bộ log của công cụ đó.
4. **Dừng** bất cứ lúc nào: nút **Dừng**, phím **Esc** trên trang, hoặc **Alt+Shift+S**.

> **Lần đầu dùng một luật mới, hãy chạy thử một đợt nhỏ** rồi xem cột *Ghi chú* trong CSV trước khi chạy đợt lớn.

## An toàn

- Sau mỗi lệnh gửi, tool kiểm tra **máy chủ trả về đúng trạng thái mong đợi**. Sai một lệnh là **dừng cả lượt**. Đơn đó ghi **KIỂM TRA TAY** kèm *đã làm / HỎNG / chưa làm*. Tool không tự hoàn tác.
- Lỗi mạng, máy chủ quá tải hoặc quá thời gian chờ: tự thử lại tối đa 2 lần. Mọi lệnh đặt đơn về một trạng thái cố định, nên gửi lại không gây sai.
- Bấm Dừng: việc đọc danh sách dừng ngay. Đơn đang gửi lệnh dở thì gửi nốt, nên không đơn nào bị làm dở.
- Gỡ duyệt, Không xử lý hết, ĐVHC 2 cấp **đọc hết danh sách rồi mới gửi lệnh**, vì gửi lệnh làm thay đổi thứ tự danh sách trên máy chủ.
- Không bao giờ mở quá **6 kết nối** cùng lúc tới máy chủ.
- **Mã xác thực chỉ giữ trong bộ nhớ**, không bao giờ lưu. Log chỉ lưu trong trình duyệt (`chrome.storage.local`), không gửi đi đâu.
- **Gỡ (Remove) extension là mất toàn bộ log**: xuất CSV trước.

> ⚠ File CSV log có **tên người thật**. Đừng đưa lên GitHub. `.gitignore` đã chặn sẵn `*.csv`.

## Cấu hình

Trong [config.js](config.js). Sửa xong thì ⟳ extension rồi F5 trang.

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `runPageSize` | 10 | Số đơn mỗi lần lấy danh sách |
| `readAhead` + `writeConcurrency` | 3 + 3 | Duyệt đơn, Quét và sửa: đọc và gửi cùng lúc. Tổng phải ≤ 6 |
| `phasedReadAhead` / `phasedWriteConcurrency` | 3 / 6 | Các công cụ đọc hết rồi mới gửi. Mỗi số ≤ 6 |
| `retries` / `retryDelayMs` | 2 / 3000 | Thử lại khi lỗi tạm thời |
| `listTimeoutMs` / `writeTimeoutMs` | 300000 / 60000 | Thời gian chờ tối đa khi đọc danh sách / khi gửi một lệnh |
| `csvSeparator` | `,` | Đổi thành `;` nếu Excel dồn dữ liệu vào một cột |

Cờ luật của tab Duyệt đơn nằm trong `RULES` ở [tools/run/rules.js](tools/run/rules.js). Ví dụ: `historyByLand: false` để quay về cách cũ, *Cập nhật lịch sử* mọi bản ghi khung phải.

## Cấu trúc thư mục

```
manifest.json        Khai báo extension, danh sách công cụ (thứ tự = thứ tự tab)
config.js            Tên API, tốc độ, thử lại, dấu phân cách CSV
background.js        Mở Side Panel, phím tắt dừng khẩn cấp
core/                Lõi dùng chung
  hook.js            Lấy mã xác thực và đợt đang mở từ request của trang (không sửa, không chặn)
  context.js         Giữ ngữ cảnh trong bộ nhớ
  runner.js          Đọc danh sách, gửi lệnh, thử lại, dừng, ghi log
  model.js           Mô hình dữ liệu đơn, dựng lệnh, kiểm tra phản hồi
  log.js, csv.js     Lưu log, xuất CSV (chống CSV injection)
  registry.js        Sổ đăng ký công cụ
tools/<id>/          Mỗi công cụ: rules.js (luật thuần) + tool.js (cách chạy)
  run/   audit/      Duyệt đơn: Chạy tự động, Quét và sửa lỡ duyệt GCN
  undo/              Gỡ duyệt
  noaction/          Không xử lý hết
  dvhc/              Duyệt ĐVHC 2 cấp
panel/               Side Panel (HTML, CSS, view.js thuần, panel.js)
test/                Kiểm thử tự động (máy chủ MPLIS giả, DOM giả, dữ liệu mẫu tên giả)
docs/                Tài liệu cho người sửa code
```

## Kiểm thử

Cần **Node.js ≥ 20**. Không phải cài gì thêm.

```bash
node --test --test-timeout=60000 test/*.test.mjs
```

- Test chạy trên **máy chủ MPLIS giả** và dữ liệu mẫu có tên giả. **Không gửi request nào tới mplis.gov.vn.**
- Có kiểm tra lại các bất biến an toàn: mọi lệnh đều có `expect`, lỗi thì dừng, giới hạn 6 kết nối, đọc hết rồi mới gửi.
- `test/golden/` là kết quả đã chốt của bản cũ (Duyệt 2.1.3, Gỡ duyệt 2.2.4), dùng để so cho đúng hành vi cũ.

## Thêm một công cụ mới

1. Tạo `tools/<id>/rules.js` (luật thuần, không I/O) và `tools/<id>/tool.js` (gọi `ADXTools.register({...})`).
2. Thêm **một dòng** vào `manifest.json`, trước `core/runner.js`. Tab mới tự xuất hiện trên Side Panel.
3. Viết `test/<id>.test.mjs`, ghi luật vào [docs/KIEN_TRUC.md](docs/KIEN_TRUC.md) và [HUONG_DAN.md](HUONG_DAN.md).

Hợp đồng chi tiết của một công cụ: [docs/KIEN_TRUC.md](docs/KIEN_TRUC.md), mục 5.

## Tài liệu

| File | Cho ai | Nội dung |
|---|---|---|
| [HUONG_DAN.md](HUONG_DAN.md) | Người dùng | Cài đặt, luật từng công cụ, log, xử lý lỗi |
| [docs/KIEN_TRUC.md](docs/KIEN_TRUC.md) | Người sửa code | Kiến trúc, luật dạng bảng, lưu trữ, bất biến an toàn, "cần sửa ở đâu khi…" |
| [docs/KE_HOACH.md](docs/KE_HOACH.md) | Người sửa code | Kế hoạch gộp hai bản cũ, tiêu chí nghiệm thu |
| [docs/CONG_NGHE.md](docs/CONG_NGHE.md) | Người sửa code | Lựa chọn công nghệ |

## Lưu ý

- Công cụ nội bộ, phục vụ xử lý đơn trên MPLIS bằng chính tài khoản của người dùng. Người chạy chịu trách nhiệm với dữ liệu đã xử lý: **chạy thử đợt nhỏ, xem log trước khi chạy đợt lớn**.
- Một số tên trường dữ liệu được suy ra từ trang chứ chưa xác nhận hết trên dữ liệu thật: số tờ / số thửa và mã đơn ở khung phải, số phát hành ở khung trái. Nếu kết quả lạ, xem cột *Ghi chú* trong CSV, rồi sửa theo [docs/KIEN_TRUC.md](docs/KIEN_TRUC.md), mục 11.
