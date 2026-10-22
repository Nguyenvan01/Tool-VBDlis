# Bộ công cụ hỗ trợ VBDLIS (MPLIS) 3.0.0 – Hướng dẫn sử dụng

Extension gọi thẳng API của trang MPLIS, giống hệt khi bấm menu. Nó không bấm nút và không đọc giao diện. Mọi công cụ nằm chung một Side Panel; mỗi lúc chỉ chạy được **một** công cụ.

Side Panel có bốn tab: **Duyệt đơn** (gồm *Chạy tự động* và *Quét và sửa lỡ duyệt GCN*), **Gỡ duyệt**, **Không xử lý hết**, **ĐVHC 2 cấp**.

## 1. Trước khi dùng bản 3 – làm MỘT lần

> ⚠ **Gỡ (Remove) extension là mất toàn bộ log của nó.** Phải xuất CSV ở cả hai bản cũ TRƯỚC khi gỡ.

1. Nếu hai thư mục cũ `Auto duyệt 2.1.3` và `Auto đơn 2.1.4 (bỏ duyệt)` đang nằm trong Thùng rác: mở Thùng rác, chọn hai thư mục, bấm **Put Back** để chúng về đúng chỗ cũ. Phải về đúng chỗ cũ thì Chrome mới nhận lại extension và log của nó.
2. Ở **bản Duyệt cũ**: mở Side Panel → **Xuất CSV** ở thẻ Thống kê (`duyet-don_….csv`) và ở thẻ Kiểm tra lỡ duyệt GCN (`lo-duyet-gcn_….csv`).
3. Ở **bản Gỡ duyệt cũ**: mở Side Panel → **Xuất CSV** ở thẻ Thống kê bỏ duyệt (`bo-duyet_….csv`).
4. Vào `chrome://extensions`, **tắt** hai extension cũ (gạt công tắc sang tắt). Chỉ gỡ (Remove) sau khi đã chắc chắn có đủ file CSV.

**Không bật cùng lúc bản cũ và bản 3.** Hai bản sẽ cùng chạy trên một trang, tranh nhau phím Alt+Shift+S. Bản 3 không chặn được việc chạy chồng của extension khác.

Bản 3 bắt đầu với thống kê trống. Log cũ không được chuyển sang; nó nằm trong các file CSV vừa xuất.

## 2. Cài đặt (Load unpacked)

1. Mở Chrome, vào `chrome://extensions`, bật **Developer mode** ở góc trên bên phải.
2. Bấm **Load unpacked**, chọn thư mục `Bộ công cụ hỗ trợ VBDLIS` (thư mục có `manifest.json`).
3. Ghim extension **"Bộ công cụ hỗ trợ VBDLIS (MPLIS)"** lên thanh công cụ. Bấm vào biểu tượng để mở Side Panel.
4. Mở trang MPLIS. Nếu trang đang mở sẵn thì bấm **F5**.

> Mỗi lần cập nhật extension: vào `chrome://extensions`, bấm **⟳** ở extension, rồi **F5** trang. Nếu quên, Side Panel hiện cảnh báo ⚠ và khoá nút chạy cho tới khi tải lại xong.

## 3. Chuẩn bị trước mỗi lần chạy

**F5 trang, rồi mở hộp thoại "Xử lý đơn đăng ký" của đợt cần làm.** Lúc trang tải danh sách đơn, extension lấy *đợt bàn giao* và *mã xác thực* của phiên đăng nhập. Mã xác thực chỉ giữ trong bộ nhớ, không bao giờ được lưu. Chưa làm bước này thì Side Panel báo "Chưa thấy danh sách đơn".

Trên Side Panel, chọn tab ở thanh trên cùng (bấm chuột, hoặc phím ← → khi đang đứng ở thanh tab). Mở Side Panel thì tab Duyệt đơn được chọn sẵn; nếu đang có công cụ chạy thì tab của công cụ đó được chọn.

Khi một công cụ đang chạy: tab của nó có **chấm xanh**; vẫn chuyển sang tab khác để xem được, nhưng nút chạy ở đó bị khoá kèm dòng **"Đang chạy: …"**. Nút **Dừng** ở thẻ nào cũng dừng được công cụ đang chạy.

Góc mỗi thẻ có nhãn trạng thái: **Đang chạy**, **Hoàn thành**, **Cần kiểm tra** (xong nhưng có đơn phải xử lý tay), **Lỗi**, **Chưa sẵn sàng**. Khi một lệnh hỏng, thẻ hiện riêng **mã đơn**, bước **đã làm / HỎNG / chưa làm** và **lý do**, để sửa tay đúng chỗ.

## 4. Chạy tự động (tab Duyệt đơn)

Duyệt **tất cả các đơn chưa xử lý** của đợt đang mở; đơn đã xử lý được bỏ qua. Bấm **Bắt đầu** rồi xác nhận.

**Quy tắc duyệt** (xét theo thứ tự):

| Dữ liệu của đơn | Kết quả |
|---|---|
| Có **bất kỳ thông tin Giấy chứng nhận** nào, ở khung phải hoặc khung trái, **kể cả chưa có Số phát hành / Số vào sổ** | **KHÔNG DUYỆT** – tuyệt đối |
| Thiếu mã gói tin hoặc mã đơn | **Kiểm tra tay**, không gửi gì |
| **Mã đơn khung trái trùng mã đơn** một bản ghi khung phải (không phân biệt hoa / thường) | **KHÔNG DUYỆT** |
| Khung trái không có thông tin chủ và cũng không có thông tin đất | **KHÔNG DUYỆT** |
| Khung trái có thửa với **số tờ / số thửa để trắng**, **có chữ cái** (VD `12a`), hoặc **tờ 0, thửa 0** | **KHÔNG DUYỆT** |
| Khung trái không thấy trường số tờ / số thửa nào | **Kiểm tra tay** |
| Mã bản ghi khung phải không khớp | **Kiểm tra tay**, không gửi gì |
| Đơn đã bị **"Bỏ duyệt"** trước đó (ai đó đã chủ động gỡ duyệt) | **Kiểm tra tay**: extension không tự duyệt lại đè lên quyết định của người |
| Còn lại: khung phải trống, hoặc **không có GCN** (kể cả khung phải có nhiều bản ghi) | **ĐƯỢC DUYỆT** |

Extension coi là có thông tin GCN khi gặp **bất kỳ** dấu hiệu nào sau đây, ở bất kỳ đâu trong dữ liệu của đơn:
- trường có tên chứa "GiayChungNhan" là danh sách có phần tử hoặc đối tượng khác rỗng (`ListGiayChungNhan`, `GiayChungNhan`, `giayChungNhanIds`…);
- `giayChungNhanId` > 0, hoặc `laGiayChungNhan = true` (file quét chính là GCN);
- Số phát hành, Số vào sổ, Ngày vào sổ, Mã GCN hoặc Số seri có giá trị.

Không tính: giấy chứng nhận **kết hôn**, loại / phiên bản / tình trạng GCN, ngày rỗng của máy chủ (`/Date(-62135596800000)/`). Toàn bộ quy tắc nằm trong `tools/run/rules.js`.

| Đơn | Lệnh gửi |
|---|---|
| ĐƯỢC DUYỆT, chưa xử lý | *Thêm vào dữ liệu vận hành*, rồi *Cập nhật lịch sử* (khi khung phải có dữ liệu; nhiều bản ghi thì **một lệnh cho tất cả**). **Khung phải có số tờ / số thửa:** chỉ *Cập nhật lịch sử* các bản ghi **trùng số tờ / số thửa** với khung trái (mọi thửa của bản ghi đều có ở khung trái; `027` = `27`; không tính "tờ / thửa cũ"). Bản ghi không trùng **để nguyên**; không bản ghi nào trùng thì chỉ *Thêm vào*. Ghi chú của log ghi rõ tờ / thửa hai bên. Khung phải không có số tờ / số thửa ở bản ghi nào cũng **để nguyên** (chỉ *Thêm vào*). Muốn quay về cách cũ (Cập nhật lịch sử mọi bản ghi): đặt `historyByLand: false` trong `RULES` (`tools/run/rules.js`) rồi ⟳ extension |
| KHÔNG DUYỆT, chưa xử lý | *Không xử lý* |
| Đã xử lý rồi | Bỏ qua. Đơn có GCN mà đã lỡ duyệt chỉ được đánh dấu ⚠ (sửa bằng *Quét và sửa*, mục 5) |

**Tốc độ:**
- Đợt **còn ít đơn chưa xử lý**: chỉ đọc các đơn *chưa xử lý* (lọc ở máy chủ). Extension kiểm bộ lọc trước khi tin; không đúng thì tự đọc cả đợt.
- Đợt **mới** (phần lớn chưa xử lý): đọc lần lượt cả đợt, đơn nào đọc xong là gửi lệnh ngay.
- Chạy xong, extension **đếm lại** số đơn chưa xử lý. Còn sót (ngoài các đơn để kiểm tra tay) thì tự chạy thêm lượt.

## 5. Quét và sửa lỡ duyệt GCN (tab Duyệt đơn)

**Đơn lỡ duyệt** là đơn không được duyệt vì có Giấy chứng nhận, nhưng:
- khung phải đã **Cập nhật lịch sử** (`ActionProcessSyncData = 3` ở khung phải), hoặc
- khung trái đã **Thêm vào dữ liệu vận hành**.

Bấm **Quét và sửa** rồi xác nhận. Extension quét **toàn bộ đợt đang mở**. Gặp đơn lỡ duyệt nào là **sửa luôn** đơn đó: *Bỏ duyệt* khung phải, rồi *Không xử lý* (khung trái thành không duyệt), giống thao tác sửa tay. Đơn bị loại vì lý do khác (VD số tờ / số thửa) mà đã duyệt thì **không** tự gỡ.

Trong thẻ có bảng kết quả của lần quét gần nhất:
- 4 ô số: **Đã quét · Lỡ duyệt · Đã sửa · Kiểm tra tay**;
- các trang có đơn lỡ duyệt (10 đơn/trang như bảng trên trang web);
- bảng từng đơn: *Trang · # · Mã đơn · Lỡ (Cập nhật lịch sử / Thêm vào DLVH) · Kết quả*. Rê chuột lên một dòng để xem tên chủ và mã GCN;
- nút **Xuất CSV bảng lỡ duyệt** (`lo-duyet-gcn_….csv`).

Màu của từng dòng: **xanh** là đã sửa; **vàng** là đơn ở trạng thái lạ (VD đã đồng bộ), extension **không tự sửa**, hãy kiểm tra tay; **đỏ** là sửa bị lỗi, extension **dừng ngay** ở đơn đó.

Chạy lại **Quét và sửa** lần nữa để chắc chắn bảng không còn đơn nào cần sửa. Vì đọc toàn bộ đợt, đây cũng là cách **kiểm tra lại** sau khi chạy tự động: dòng tổng kết báo thêm *"còn N đơn chưa xử lý"* nếu đợt vẫn còn đơn chưa làm. Đơn đã sửa được ghi vào **Thống kê duyệt** (chung với Chạy tự động).

## 6. Gỡ duyệt

Gỡ duyệt **mọi đơn đã duyệt** của đợt đang mở. Sau khi gỡ, đơn về lại *chưa xử lý*.

Bấm **Gỡ duyệt** rồi xác nhận. Extension chạy 2 bước:
1. **Đọc hết danh sách**, chưa gửi lệnh nào. Nó chỉ đọc các đơn *đã xử lý* (lọc ở máy chủ), nhưng chỉ tin bộ lọc khi đếm khớp; không khớp thì tự đọc cả đợt.
2. **Gỡ** các đơn đã duyệt.

Phải đọc hết rồi mới gỡ, vì mỗi lần gỡ thì máy chủ đổi thứ tự danh sách. Nếu vừa đọc vừa gỡ, có đơn bị sót.

| Đơn | Lệnh gửi |
|---|---|
| **Đã duyệt** (khung trái đã *Thêm vào dữ liệu vận hành*), kể cả đơn do người duyệt tay | 1. Khung phải: *Bỏ duyệt* (một lệnh cho mọi bản ghi, nếu có) → 2. Khung trái: *Bỏ duyệt* |
| Chưa duyệt (chưa xử lý, đã *Không xử lý*) | Bỏ qua |
| Trạng thái lạ (VD khung phải đã *Cập nhật lịch sử* mà khung trái chưa *Thêm vào*, đã đồng bộ), thiếu mã gói tin | Không gửi gì, ghi **Kiểm tra tay** |

## 7. Không xử lý hết

Đánh **Không xử lý** ở khung trái cho **mọi đơn** của đợt đang mở. Sau khi chạy, đơn ở *đã Không xử lý* (khác Gỡ duyệt: Gỡ duyệt trả đơn về *chưa xử lý*).

Bấm **Không xử lý hết** rồi xác nhận. Extension cũng chạy 2 bước như Gỡ duyệt: đọc hết cả đợt, rồi mới gửi lệnh.

| Đơn | Lệnh gửi |
|---|---|
| Khung phải đã **Cập nhật lịch sử** (dù khung trái đang ở trạng thái nào trong ba trạng thái bên dưới) | 1. Khung phải: *Bỏ duyệt* (một lệnh cho mọi bản ghi) → 2. Khung trái: *Không xử lý* |
| Chưa xử lý (kể cả đơn đã bị *Bỏ duyệt* trước đó) | Khung trái: *Không xử lý* |
| Đã duyệt (*Thêm vào dữ liệu vận hành*) | Khung trái: *Không xử lý* |
| Đã *Không xử lý* | Bỏ qua |
| Thiếu mã gói tin, khung phải không khớp mã, trạng thái lạ (VD đã đồng bộ) | Không gửi gì, ghi **Kiểm tra tay** |

- Chạy lại lần nữa là cách kiểm tra: lần sau không còn đơn nào phải gửi lệnh (chỉ còn bỏ qua / kiểm tra tay).
- Nếu một đơn hỏng giữa hai lệnh (khung phải đã Bỏ duyệt, khung trái chưa Không xử lý), đơn ở *chưa xử lý*. Chạy lại thì extension chỉ gửi nốt *Không xử lý* cho đơn đó.

## 8. Duyệt ĐVHC 2 cấp

**Một nút** cho cả đợt đang mở: bấm **Duyệt ĐVHC** (tab *ĐVHC 2 cấp*) rồi xác nhận. Extension chạy 2 bước như Gỡ duyệt: đọc hết cả đợt, rồi mới gửi lệnh. Đơn mới thì duyệt; đơn đã xử lý thì kiểm tra lại, đánh nhầm thì gỡ và đánh lại.

**Luật khớp** – đủ cả ba thì *duyệt* (Khung trái: *Thêm vào dữ liệu vận hành* → Khung phải: *Cập nhật lịch sử*, một lệnh cho mọi bản ghi), thiếu một thì *Không xử lý* (khung trái):

1. Mã bản ghi khung phải khớp danh sách mã của đơn.
2. **Cùng tập số phát hành** (hoặc cả hai khung **không có** số phát hành). Chỉ lấy số trong mục **Giấy chứng nhận** (`ListGiayChungNhan`); bỏ khoảng trắng, không phân biệt hoa / thường (`AB 123456` = `ab123456`). Chỉ một khung có số → không khớp.
3. **Cùng tên chủ**, giống hệt **kể cả hoa / thường** (`Nguyễn văn A` ≠ `Nguyễn Văn A`). Chỉ bỏ qua dấu cách thừa và thứ tự các chủ.

| # | Đơn | Kết quả | Lệnh gửi |
|---|---|---|---|
| 1 | Thiếu mã gói tin | Kiểm tra tay | — |
| 2 | Chưa xử lý (kể cả đã bị *Bỏ duyệt*) | Theo luật khớp | Khớp: Thêm vào → Cập nhật lịch sử. Không khớp: Không xử lý (khung phải còn Cập nhật lịch sử thì *Bỏ duyệt* khung phải trước) |
| 3 | Trạng thái lạ (VD đã đồng bộ) | Kiểm tra tay | — |
| 4 | Đã xử lý **đúng** luật (duyệt đủ mọi bản ghi; hoặc Không xử lý mà khung phải chưa Cập nhật lịch sử) | Đã đúng | — |
| 5 | Đã xử lý **sai** luật – kể cả đơn làm tay, kể cả duyệt dở | Đánh lại | *Bỏ duyệt* khung phải (chỉ các bản ghi đang Cập nhật lịch sử) → *Bỏ duyệt* khung trái → đánh theo luật khớp |

- Cột Ghi chú ghi lý do, VD `tên chủ khác (trái: …; phải: …)`; đơn đánh lại ghi `sửa từ "…": …`. Kết quả mới ghi đè kết quả cũ trong thống kê. Đơn đã đúng chỉ có trong log lần chạy.
- Hỏng giữa lúc đánh lại: dừng hẳn (như mọi công cụ); bấm lại thì extension tự đánh nốt.
- Chạy lại lần nữa là cách kiểm tra: lần sau không còn đơn nào phải gửi lệnh.
- **Lần đầu chạy thử một đợt nhỏ**: lệnh *Bỏ duyệt* khung trái cho đơn đang *Không xử lý* chưa được ghi lại trên trang thật.

## 9. Kiểm tra lỗi trong Console

- **Console của Side Panel** (chuột phải vào Side Panel → Inspect): phải sạch. Có dòng đỏ ở đây là lỗi của extension, hãy chụp lại gửi người sửa code.
- **Console của trang MPLIS** (F12 trên trang): dòng có tiền tố `[Duyệt đơn]` là nhật ký chạy của extension (đọc danh sách, từng đơn, "Tốc độ: …").
- Các cảnh báo khác trên trang MPLIS thường là của **chính trang**, không phải của extension. VD `libraries.min.js … [Violation] Permissions policy violation: unload is not allowed in this document`: thư viện của MPLIS đăng ký sự kiện `unload` mà Chrome không còn cho phép. Đây chỉ là cảnh báo (mức Violation), không ảnh hưởng extension. Extension không dùng `unload`.

## 10. An toàn, tốc độ, dừng (mọi công cụ)

- Mỗi lệnh phải được máy chủ trả về đúng trạng thái mong đợi. Sai một lệnh là **dừng hẳn**. Đơn đó ghi **Kiểm tra tay**, cột Ghi chú ghi *quyết định ban đầu · đã làm · HỎNG · chưa làm* để sửa tay đúng chỗ. Extension không tự hoàn tác.
- Lỗi mạng, máy chủ quá tải, quá thời gian chờ: tự **thử lại** (tối đa 2 lần). Mọi lệnh đặt đơn về một trạng thái cố định, nên gửi lại không gây sai.
- **Dừng**: nút **Dừng**, phím **Esc** trên trang, hoặc **Alt+Shift+S**. Lần đọc danh sách đang chờ bị huỷ ngay. Đơn đang gửi lệnh dở thì gửi nốt (vài giây) rồi mới dừng, nên không đơn nào bị làm dở.
- Tốc độ (Chrome chỉ mở tối đa 6 kết nối tới máy chủ):
  - **Chạy tự động, Quét và sửa** đọc và gửi lệnh cùng lúc: 3 lần đọc danh sách + 3 đơn gửi lệnh song song.
  - **Gỡ duyệt, Không xử lý hết, Duyệt ĐVHC 2 cấp** đọc hết rồi mới gửi, hai bước không chạy cùng lúc: bước 1 đọc **3** trang song song (thử 6 thì máy chủ quá tải), bước 2 gửi lệnh cho **6** đơn song song. Không đọc lại lần nào.
  - Chạy xong, Console (F12) in dòng **"Tốc độ: …"** (trung bình mỗi lần đọc / mỗi lệnh). Nếu so với trước thời gian trung bình tăng rõ thì máy chủ đang quá tải: đổi `phasedReadAhead` / `phasedWriteConcurrency` trong `config.js` về 3 rồi ⟳ extension.
  - Các con số nằm trong `config.js` → `api`. Vượt giới hạn (3 + 3 quá 6, hoặc một số quá 6) thì extension từ chối chạy.

## 11. Thống kê, log, xuất CSV

- Mỗi tab có thẻ thống kê ở cuối. *Chạy tự động* và *Quét và sửa* ghi chung một log (**Thống kê duyệt**); Gỡ duyệt, Không xử lý hết, Duyệt ĐVHC 2 cấp mỗi công cụ một log riêng. Đơn bỏ qua không ghi log.
- **Xuất CSV**: file UTF-8 mở bằng Excel không lỗi tiếng Việt (`duyet-don_….csv`, `lo-duyet-gcn_….csv`, `bo-duyet_….csv`, `khong-xu-ly-het_….csv`). Nếu Excel dồn hết vào một cột, đổi `csvSeparator: ','` thành `';'` trong `config.js`, rồi ⟳ extension.
- **Log từng lần chạy**: chạy xong, thẻ công cụ hiện dòng *Lần chạy <giờ> · N đơn* và nút **Tải log lần chạy** (`lan-chay_<công cụ>_….csv`) – chỉ gồm các đơn của lần chạy đó. Lần chạy sau của cùng công cụ ghi đè, nên tải về ngay nếu cần giữ.
- Log và CSV có thêm cột **Số tờ, Số thửa** (khung trái; đơn nhiều thửa ghi "3 | 3" và "45 | 46" theo cùng thứ tự).
- **Xóa log**: nên xuất CSV trước khi xóa.
- Chi tiết từng đơn chỉ in ra Console (F12), không được lưu.

## 12. Thư mục

```
manifest.json       Khai báo extension; danh sách công cụ
config.js           Tên API, tốc độ, thử lại, dấu phân cách CSV
background.js       Mở Side Panel, phím tắt dừng khẩn cấp
core/               Lõi dùng chung
tools/run/          Chạy tự động (quy tắc duyệt: tools/run/rules.js)
tools/audit/        Quét và sửa lỡ duyệt GCN
tools/undo/         Gỡ duyệt
tools/noaction/     Không xử lý hết
tools/dvhc/         Duyệt ĐVHC 2 cấp
panel/              Side Panel
test/               Kiểm thử tự động (node --test test/*.test.mjs); test/golden/ là kết quả bản cũ đã chốt để so sánh
docs/               Tài liệu cho người sửa code
```
