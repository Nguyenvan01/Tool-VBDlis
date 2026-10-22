# Kế hoạch gộp – Bộ công cụ hỗ trợ VBDLIS (MPLIS)

Gộp hai extension cũ (Duyệt 2.1.3, Gỡ duyệt 2.2.4) thành một, rồi thêm công cụ mới. Thiết kế xem [KIEN_TRUC.md](KIEN_TRUC.md), công nghệ xem [CONG_NGHE.md](CONG_NGHE.md).

## 0. Phạm vi

| Đề bài | Thực tế | Lý do |
|---|---|---|
| `[THƯ_MỤC_MỚI]` | Thư mục gốc `Bộ công cụ hỗ trợ VBDLIS/` | Theo yêu cầu bổ sung: chỉ còn một dự án |
| Hai thư mục nguồn chỉ đọc | Đã **chuyển vào Thùng rác** macOS. Mã chép sang `legacy/duyet-2.1.3/` và `legacy/go-duyet-2.2.4/` (khớp `diff -rq`, không chép CSV) | Theo yêu cầu "xoá 2 dự án cũ". Vẫn cần mã cũ để chuyển code và so sánh. `legacy/` chỉ đọc, xoá ở bước 2.5 |
| Bản Gỡ v2.2.4 | Thư mục tên "2.1.4", `manifest.json` ghi `2.2.4` | Theo manifest |

Giữ nguyên đề bài: không gửi request nào tới mplis.gov.vn; không đổi endpoint, body, mã action, `expect`; tính năng mới chỉ ghi thành đề xuất (mục 7).

## 1. Các bước

| Bước | Việc | Trạng thái |
|---|---|---|
| 1 | `docs/KE_HOACH.md`, `KIEN_TRUC.md`, `CONG_NGHE.md` | ✅ đã duyệt kèm quyết định (mục 6) |
| 2.1 | Lõi: `manifest.json`, `config.js`, `background.js`, `core/*`, `panel/*`, `test/` | ✅ đã dựng, test qua. **Chờ người dùng Load unpacked** (mục 2.2) |
| 2.2 | Công cụ **Gỡ duyệt** (`tools/undo/`) | ✅ đã dựng, test qua. **Chờ chạy thật trên đợt nhỏ** (mục 2.3) |
| 2.2b | Công cụ mới **Không xử lý hết** (`tools/noaction/`), theo yêu cầu bổ sung | ✅ đã dựng, test qua, lõi không đổi (mục 8). **Chờ chạy thật trên đợt nhỏ** |
| 2.3 | Công cụ **Chạy tự động** (`tools/run/`) | ✅ đã dựng, test qua. **DỪNG**, chờ chạy thật trên đợt nhỏ |
| 2.4 | Công cụ **Quét và sửa** (`tools/audit/`, ghi chung nhật ký `run`) + **thanh tab** Side Panel (Duyệt đơn / Gỡ duyệt / Không xử lý hết) | ✅ đã dựng, test qua. **DỪNG**, chờ kiểm bằng mắt (mục 2.4) và chạy thật |
| 2.5 | Hoàn tất `HUONG_DAN.md`; chốt kết quả cũ thành `test/golden/*.json` để test không còn cần `legacy/` | ✅ đã chốt (6 file, 92 tình huống). Người dùng cho xoá: `legacy/` đã chuyển vào Thùng rác (`legacy-bo-cong-cu-VBDLIS`); test vẫn qua hết |

Mỗi bước kết thúc bằng báo cáo: ✅ việc đã xong, file đã đổi, **kết quả lệnh test thực tế**.

## 2. Cách kiểm từng bước

### 2.1. Tự động: `node --test test/*.test.mjs`

| Kiểm | File test |
|---|---|
| Luật thuần mới = luật cũ trên cùng fixture (kể cả endpoint, body, `expect` của lệnh) | `golden.test.mjs` |
| Cả lần chạy của công cụ trên máy chủ giả = bản cũ (tập lệnh ghi, dữ liệu máy chủ sau khi chạy, trạng thái, nhật ký, thống kê, câu kết quả); các bất biến 1–5, 7, 8, 11 | `undo.test.mjs` (sau này `run.test.mjs`, `audit.test.mjs`) |
| Công cụ Chạy tự động: `decide` / `planFor` / `gcnSignals` = bản cũ (kể cả khi tắt cờ luật); cả lần chạy = bản cũ ở mọi nhánh chiến lược; tiến độ Side Panel = `renderRun` cũ | `run.test.mjs` |
| Công cụ Quét và sửa: cả lần quét = `auditFix` cũ (lệnh, dữ liệu, kết quả đã lưu, nhật ký); sửa hỏng thì dừng; chạy lại không còn gì để sửa; CSV bảng lỡ duyệt giống từng byte bản cũ | `audit.test.mjs` |
| Side Panel (chạy `panel.js` thật trên DOM giả): ba tab đúng thứ tự / tên / ARIA; mỗi tab đúng thẻ; bấm tab và phím ← → Home End; đang chạy thì khoá nút chạy ở thẻ khác kèm "Đang chạy: …", Dừng bấm được, chấm báo hiệu, vẫn chuyển tab; mở lúc đang chạy thì chọn sẵn tab đó; lỗi chỉ ở thẻ của công cụ đó; tiến độ và thống kê không lẫn; thông báo cũ và khoá phiên bản; bảng lỡ duyệt + CSV | `panel.test.mjs` |
| Công cụ Không xử lý hết: bảng luật 1–7, đối chiếu `planFor({fixApproved})` cũ, chạy lại sau lỗi, chạy hai lần không gửi gì, đơn trùng, bất biến | `noaction.test.mjs` |
| Cấu hình, manifest, cú pháp, tên file không bắt đầu bằng `_`, `background.js`, ranh giới lõi / công cụ, sổ đăng ký, CSV = bản cũ, tiến độ Side Panel = bản cũ, công cụ thử chạy được mà không sửa lõi | `core.test.mjs` |

Đã thử cấy lỗi vào bản chép trong scratchpad để chắc test bắt được: đổi `trangThai` của lệnh, bỏ `expect`, gửi lệnh khi chưa đọc xong, bỏ kiểm bộ lọc, cho phép huỷ lệnh ghi, thử lại cả lỗi không tạm thời, bỏ khoá đang chạy, bỏ H1, bỏ chống CSV injection. Lỗi nào cũng làm ít nhất một test hỏng.

Kiểm tĩnh **không thay** được Load unpacked thật. Tôi không mở được Chrome của người dùng, nên bước đó ở mục 2.2.

### 2.2. Bằng tay (người dùng làm)

1. Xuất CSV ở hai extension cũ (mục 4), rồi **tắt** chúng.
2. Load unpacked thư mục gốc `Bộ công cụ hỗ trợ VBDLIS/`. Thẻ extension không có nút "Lỗi". *Inspect views: service worker*: Console sạch.
3. Mở MPLIS, F5, mở hộp thoại "Xử lý đơn đăng ký". Side Panel hiện mã đợt, không có cảnh báo phiên bản.
4. Thử khoá phiên bản: sửa `ADX_VERSION` trong `config.js`, mở lại Side Panel, nút chạy phải bị khoá. Sửa lại như cũ.

### 2.3. Chạy thật từng công cụ (người dùng làm, trên đợt nhỏ)

| Công cụ | Kiểm |
|---|---|
| Gỡ duyệt | Đợt ít đơn đã duyệt. Bấm Dừng ở bước 1 (huỷ ngay), rồi chạy lại hết. Đơn đã gỡ về "chưa xử lý". Console có dòng "→ thử chỉ đọc đơn đã xử lý" và "Tốc độ: …". CSV `bo-duyet_*.csv` đủ 12 cột |
| Không xử lý hết | Đợt nhỏ có đơn đã duyệt, đơn chưa xử lý, đơn có Cập nhật lịch sử. Sau khi chạy mọi đơn ở "đã Không xử lý". Chạy lần hai không gửi lệnh nào |
| Chạy tự động | Đợt có cả đơn có GCN, không có GCN, đã "Bỏ duyệt", số thửa có chữ. Kết quả và CSV `duyet-don_*.csv` giống bản cũ (bảng quy tắc ở HUONG_DAN.md mục 4). Console có dòng "bộ lọc đúng / KHÔNG đúng" và "Tốc độ: …" |
| Quét và sửa | Đợt có đơn lỡ duyệt. Bảng, màu dòng, `lo-duyet-gcn_*.csv` giống bản cũ. Chạy lần hai phải không còn gì để sửa |
| Chung | Alt+Shift+S và Esc dừng được. Đang chạy công cụ này thì nút chạy của mọi công cụ khác bị khoá |

### 2.4. Kiểm Side Panel bằng mắt trên Chrome (người dùng làm)

Bố cục, màu và bề rộng không kiểm tự động được. Làm theo thứ tự:

1. `chrome://extensions` → bấm **⟳** ở "Bộ công cụ hỗ trợ VBDLIS (MPLIS)". Mở trang MPLIS, **F5**.
2. Bấm icon extension để mở Side Panel. Chuột phải vào Side Panel → **Inspect** → thẻ **Console**: không có dòng đỏ. Để cửa sổ DevTools mở cho các bước sau.
3. Thanh tab ngay dưới tiêu đề có đúng ba tab theo thứ tự **Duyệt đơn · Gỡ duyệt · Không xử lý hết**, chia đều chiều ngang. Tab Duyệt đơn có gạch chân xanh và chữ đậm xanh. Không còn nút bo tròn.
4. Kéo mép trái Side Panel cho hẹp nhất (khoảng 320px): ba nhãn vẫn nằm trên **một hàng**, không xuống dòng, không có thanh cuộn ngang. Nếu một nhãn bị cắt "…" thì ghi lại bề rộng lúc đó (DevTools → `document.body.clientWidth`).
5. Tab Duyệt đơn: thẻ **Chạy tự động** (nút Bắt đầu xanh), thẻ **Quét và sửa lỡ duyệt GCN** (nút Quét và sửa), thẻ **Thống kê duyệt**. Bấm Gỡ duyệt: chỉ còn thẻ Gỡ duyệt (nút vàng) và Thống kê bỏ duyệt. Bấm Không xử lý hết: thẻ Không xử lý hết (nút vàng) và thống kê của nó.
6. Bấm vào một tab rồi dùng phím **← →**: tab chuyển theo, có viền focus; **Home** / **End** về tab đầu / cuối.
7. Chưa mở hộp thoại "Xử lý đơn đăng ký": mọi thẻ hiện "Chưa thấy danh sách đơn…", nút chạy bị khoá. Mở hộp thoại: nút chạy mở, góc thẻ hiện "Đợt xxxxxxxx…".
8. Trên **đợt nhỏ**, bấm Gỡ duyệt → xác nhận. Trong lúc chạy:
   - tab Gỡ duyệt có **chấm xanh**;
   - chuyển sang Duyệt đơn và Không xử lý hết vẫn được; nút chạy ở đó bị khoá, kèm dòng **"Đang chạy: Gỡ duyệt"**;
   - bấm **Dừng** ở thẻ Chạy tự động (tab khác) → Gỡ duyệt dừng ("Đang dừng…" rồi "Đã dừng…").
9. Đóng Side Panel khi một công cụ đang chạy rồi mở lại: Side Panel tự chọn tab của công cụ đang chạy.
10. Thử lệch phiên bản: sửa `ADX_VERSION` trong `config.js` thành `'0'`, đóng / mở lại Side Panel → mọi nút chạy bị khoá, có cảnh báo ⚠. Sửa lại `'3.0.0'`.

## 3. Test và fixture

- `node:test` + `node:assert` + `node:vm`, có sẵn trong Node ≥ 20 (đã chạy trên v22.16.0). **Không dependency.**
- Fixture JSON tự dựng theo KIEN_TRUC.md mục 10. Tên người là tên giả, không lấy dữ liệu thật.
- `test/fixtures/don.json`: mỗi đơn phủ một nhánh. Test `golden` kiểm rằng fixture phủ đủ nhánh của `serverState` và `undoFor`.
- `test/fixtures/responses.json`: phản hồi đúng / sai cho `checkResponse`.
- `test/lib/fake-mplis.mjs`: máy chủ giả. Lọc theo `trangThai`, cắt trang (có chế độ trả thiếu), mỗi lệnh ghi đẩy đơn xuống cuối danh sách, có thể giả lỗi 500 / sai trạng thái / không phải JSON / chậm. Đếm mọi request.
- `test/fixtures/tool-demo/`: công cụ thử, chỉ dùng trong test.

## 4. Chuyển dữ liệu: **phương án A** (đã chốt)

- Kho `chrome.storage` thuộc về từng extension. Bản 3 là extension mới nên kho rỗng. Nhật ký cũ **không chuyển**.
- Trước khi gỡ (Remove) hai extension cũ: Put Back hai thư mục cũ từ Thùng rác về đúng chỗ (nếu chưa), mở Side Panel từng bản, **Xuất CSV** (`duyet-don`, `lo-duyet-gcn`, `bo-duyet`). **Gỡ extension là mất log.** Ghi rõ trong `HUONG_DAN.md`.
- Không chức năng nào đọc nhật ký để quyết định, nên không chuyển nhật ký cũng không đổi kết quả chạy.

## 5. Rủi ro

| # | Rủi ro | Giảm thiểu |
|---|---|---|
| R1 | Lệch hành vi khi tách hàm cũ | Test golden + test cả lần chạy so với bản cũ (`test/golden/`) |
| R11 | `legacy/` đã xoá nên không tính lại được kết quả bản cũ: fixture / kịch bản mới không có gì để so, đổi lệnh có chủ đích phải sửa tay `test/golden/*.json` | Ghi trong KIEN_TRUC.md mục 9 và 11. Bản gốc vẫn còn trong Thùng rác tới khi dọn |
| R2 | Mất nhật ký cũ (Remove trước khi xuất, dọn Thùng rác) | Mục 4; `HUONG_DAN.md` |
| R3 | Bật cùng lúc bản cũ và bản 3: hai bộ máy cùng chạy trên một tab, tranh phím Alt+Shift+S | Đổi cờ MAIN world và kiểu thông điệp sang `vbdlis3` (H2a) để hai bản không đọc nhầm ngữ cảnh của nhau. Vẫn phải **tắt bản cũ** (`HUONG_DAN.md`), vì bất biến 11 chỉ giữ được trong một extension |
| R4 | Manifest là sổ đăng ký: file `tools/*` chạy cả ở trang lẫn Side Panel | Luật "lúc nạp chỉ `register`". Test nạp mọi file `tools/*` khi không có `chrome` |
| R5 | Không thử được với máy chủ thật | Chạy thật trên đợt nhỏ (mục 2.3). `checkResponse` chặn khi phản hồi lạ |
| R6 | `run` / `audit` vừa đọc vừa ghi (cùng hiện tượng làm bản Gỡ 2.2.2 sót đơn) | Giữ hành vi cũ (ràng buộc). Đề xuất E2 |
| R7 | Một số phiên bản cho cả bộ | Chấp nhận. Khoá phiên bản báo rõ |
| R8 | Thư mục gốc chứa `docs/`, `test/`, Chrome nạp kèm | Vô hại (manifest không trỏ tới). Test kiểm không có tên bắt đầu bằng `_` |
| R9 | ~~Trong lúc chưa chuyển `run` / `audit`, vẫn phải dùng bản Duyệt cũ~~ | Hết từ bước 2.4: bản 3 có đủ bốn công cụ |
| R10 | Bố cục Side Panel (bề rộng 320px, màu, focus) không test tự động được | Kiểm bằng mắt theo mục 2.4. `test/panel.test.mjs` chỉ kiểm logic trên DOM giả |

## 6. Quyết định đã chốt

| # | Quyết định |
|---|---|
| H1 | Lệnh ghi hỏng giữa chừng: cột Kết quả ghi `KIỂM TRA TAY` ở **mọi** công cụ. Quyết định ban đầu chuyển sang Ghi chú, kèm đã làm / HỎNG / chưa làm. Thống kê đếm vào Kiểm tra tay. Lệnh gửi đi không đổi |
| H2 | Bỏ hẳn việc dọn khoá cũ ở `background.js`. (a) Cờ MAIN world đổi thành `window.__vbdlis3HookLoaded`, kiểu thông điệp thành `'vbdlis3:ctx'`. (b) `HUONG_DAN.md`: tắt hai extension cũ trước khi dùng bản 3 |
| H3 | Khoá mới theo namespace + phương án A. **Tiền tố khoá = id công cụ.** Id thống nhất: chữ thường, một từ (`run`, `audit`, `undo`, `noaction`). `HUONG_DAN.md`: xuất CSV ở hai bản cũ TRƯỚC khi gỡ |
| H4 | Không áp dụng (không chọn phương án B) |
| H5 | Tên "Bộ công cụ hỗ trợ VBDLIS (MPLIS)", `version` 3.0.0 |
| H6 | Không lúc nào quá 6 kết nối. Công cụ đọc–ghi chồng nhau (Chạy tự động, Quét và sửa): `readAhead + writeConcurrency ≤ 6` (3 + 3). **Sửa sau (đã duyệt):** công cụ đọc hết rồi mới gửi (Gỡ duyệt, Không xử lý hết) dùng 6 lần đọc ở bước 1 và 6 đơn gửi ở bước 2 (`phasedReadAhead`, `phasedWriteConcurrency`), vì hai bước không chạy cùng lúc. Trên máy chủ giả nhanh hơn khoảng 1,5–1,7 lần, cùng số lần đọc / số lệnh; trên máy chủ thật phải xem dòng "Tốc độ: …" – chậm đi thì trả về 3. **16/10/2026:** 6 lần đọc song song làm máy chủ không trả lời quá 120 giây ("KiemTraDuLieuChuyenDoi: quá 120 giây không trả lời") → bước đọc về 3, bước gửi giữ 6 |
| H7 | Hàng thẻ chọn công cụ; đang chạy thì khoá chuyển thẻ (đang dùng tới bước 2.3). **Đổi ở bước 2.4 (đã chốt):** thanh tab Duyệt đơn / Gỡ duyệt / Không xử lý hết; đang chạy vẫn **cho chuyển tab**, khoá nút chạy ở tab khác, kèm "Đang chạy: …" và chấm báo hiệu |
| H8 | JS thuần + `node:test`. Test nạp file bằng `node:vm` (không thêm `module.exports`). Node ≥ 20 |
| H9 | Không làm Postgres trong 3.0.0. Giữ **một điểm ghi nhật ký duy nhất**: `ADXLog.write` trong `core/log.js`. Sáu câu hỏi ở CONG_NGHE.md mục 4 chờ trả lời |

Khác nhau giữa hai bản cũ đã xử lý mà không đổi hành vi: `thiCong` có thêm `trangThai = 1`; `ADX.RESULT` thành `log.results`; `readPages` lấy bản có `firstPage`; `stateObj` gom phần chung và thêm `tool`; bỏ `apiStart.opts` (code cũ không dùng); gộp lại thì hết tranh phím Alt+Shift+S.

## 7. Đề xuất (KHÔNG làm nếu chưa được duyệt riêng)

| # | Đề xuất |
|---|---|
| E1 | Chạy thử (`dryRun`): chỉ đọc và lập kế hoạch, không gửi lệnh, xuất CSV "sẽ làm gì". Với công cụ `readBeforeWrite` thì gần như có sẵn |
| E2 | `audit` đọc hết rồi mới sửa, như Gỡ duyệt (giảm R6). Là thay đổi hành vi |
| E3 | Hỏi xác nhận lần hai sau bước đọc, kèm số đơn sẽ gửi lệnh (cho `undo`, `noaction`) |
| E4 | Lưu chi tiết từng đơn (hiện chỉ in ra Console) |
| E5 | Ghi log ra Postgres (CONG_NGHE.md mục 4), gắn ở `ADXLog.write` |

## 8. Bước 2.2b – Công cụ "Không xử lý hết" (`noaction`)

Yêu cầu bổ sung: đánh Không xử lý ở khung trái cho mọi đơn của đợt. Nếu khung phải đang "Cập nhật lịch sử" thì Bỏ duyệt khung phải trước. Kết thúc ở `noaction`. Bảng luật ở KIEN_TRUC.md mục 5.7.

Đã thêm: `tools/noaction/rules.js`, `tools/noaction/tool.js`, một dòng trong `manifest.json`, `test/noaction.test.mjs`, `test/fixtures/noaction.json`, mục trong `KIEN_TRUC.md` và `HUONG_DAN.md`. Thẻ trên Side Panel tự hiện từ dòng đăng ký. So với bản chụp trước khi thêm công cụ, `core/`, `panel/`, `tools/undo/`, `config.js`, `background.js` **không đổi một byte**.

Kết quả kiểm:
- Dòng 6 đã kiểm với `planFor({fixApproved})` của bản Duyệt 2.1.3: khung phải trống thì bản cũ đi thẳng `approved` → Không xử lý. Giữ dòng 6 là `change`.
- **Khác bản cũ:** đơn đã duyệt có bản ghi khung phải nhưng không có action 3 thì bản cũ Bỏ duyệt khung phải trước; công cụ này chỉ gửi Không xử lý, theo bảng luật. Có test ghi rõ khác biệt này.
- Đơn thiếu mã gói tin không bị tính là "trùng" (bản Gỡ duyệt cũ coi hai đơn cùng thiếu mã là trùng). Luật đưa các đơn này về kiểm tra tay.
