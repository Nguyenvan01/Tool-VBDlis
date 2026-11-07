/*
 * CẤU HÌNH CHUNG – sửa ở đây khi API của trang thay đổi. Tham số riêng của từng công cụ nằm trong tools/<id>/tool.js (config).
 * Sau khi sửa: vào chrome://extensions bấm nút ⟳ (Reload) của extension rồi tải lại trang (F5).
 */
// Phiên bản – PHẢI trùng "version" trong manifest.json. Side Panel dùng số này để phát hiện
// extension chưa được tải lại (⟳) hoặc trang vẫn đang chạy code cũ (chưa F5).
const ADX_VERSION = '3.2.0';

const ADX_CONFIG = {
  // Giá trị coi như RỖNG (so sánh đã chuẩn hóa: Unicode NFC, chữ thường, gộp khoảng trắng)
  emptyValues: ['', '-', '-/-', '- / -', '--', '/', 'không có thông tin', 'không có', 'chưa có', 'null', 'undefined', 'n/a'],

  // API của trang (ghi lại ngày 03/10/2026; lệnh Bỏ duyệt ghi lại ngày 09/10/2026)
  api: {
    base: '/dc/TichHopDongBoDuLieuAjax/',
    list: 'KiemTraDuLieuChuyenDoi',              // lấy danh sách đơn (rất chậm: 5–10 giây cho 5 đơn)
    thiCong: 'UpdateStatusGoiTinDongBoThiCong',  // khung trái: Thêm vào dữ liệu vận hành / Không xử lý / Bỏ duyệt
    vanHanh: 'UpdateStatusGoiTinDongBoVanHanh',  // khung phải: Cập nhật lịch sử / Bỏ duyệt
    dongBo: 'DongBoDonDaDuyet',                  // đồng bộ các đơn đã duyệt của một đợt, body { dotBanGiaoNId } (ghi lại 03/11/2026)
    // Nhập mã đợt bàn giao trên Side Panel mà trang CHƯA tải danh sách lần nào (chưa mở hộp thoại "Xử lý đơn đăng ký"):
    // body lấy danh sách dựng từ mẫu này + dotBanGiaoNId + start / length / trangThai. Trang đã tải danh sách (đợt nào cũng được)
    // thì dùng body trang vừa gửi, chỉ thay mã đợt. Máy chủ báo lỗi khi đọc → mở hộp thoại một lần, F12 → Network →
    // KiemTraDuLieuChuyenDoi → Payload, chép các trường còn thiếu vào đây.
    listRequest: { requestQueries: { trangThai: '-1' } },

    // ---- tốc độ
    runPageSize: 10,      // số đơn mỗi lần lấy danh sách
    // Chrome chỉ mở tối đa 6 kết nối tới một trang (HTTP/1.1), vượt quá thì các lần gọi phải xếp hàng chờ, không nhanh hơn.
    // Lõi từ chối chạy nếu cấu hình có lúc vượt 6 kết nối.
    // Chạy tự động, Quét và sửa: đọc và gửi lệnh CHỒNG nhau → readAhead + writeConcurrency PHẢI ≤ 6
    readAhead: 3,         // số lần lấy danh sách chạy song song (đọc trước)
    writeConcurrency: 3,  // số đơn gửi lệnh cùng lúc (trong một đơn vẫn gửi lần lượt)
    // Gỡ duyệt, Không xử lý hết: đọc HẾT rồi mới gửi (hai bước không chạy cùng lúc) → mỗi bước được dùng tới 6, mỗi số PHẢI ≤ 6
    // ponytail: 6 lần đọc song song làm máy chủ không trả lời quá 120 giây (16/10/2026) → giữ 3; chỉ tăng khi máy chủ khoẻ hơn
    phasedReadAhead: 3,         // bước 1: số lần lấy danh sách chạy song song
    phasedWriteConcurrency: 6,  // bước 2: số đơn gửi lệnh cùng lúc
    // Muốn đổi: xem dòng "Tốc độ: …" trong Console (F12) sau mỗi lần chạy – tăng mà thời gian trung bình mỗi lần đọc /
    // mỗi lệnh tăng theo thì máy chủ đã quá tải, nên trả về số cũ (3).
    delayMs: 0,           // nghỉ thêm sau mỗi lệnh gửi (0 = không nghỉ)

    // ---- độ chính xác / chống lỗi mạng
    retries: 2,           // lỗi mạng / máy chủ quá tải / quá thời gian: thử lại tối đa bấy nhiêu lần
    retryDelayMs: 3000,   // chờ trước khi thử lại (lần 2 chờ gấp đôi…)
    // Chạy nhiều đợt: một đợt lỗi thì chờ rồi chạy lại CẢ đợt đó (đọc lại từ đầu), hết số lần vẫn lỗi thì sang đợt sau.
    // Bấm Dừng vẫn dừng hẳn, không chạy các đợt sau.
    batchRetries: 3,           // chạy lại đợt lỗi tối đa bấy nhiêu lần
    batchRetryDelayMs: 60000,  // chờ trước mỗi lần chạy lại đợt lỗi
    // Chờ tối đa cho một lần lấy danh sách. Máy chủ có lúc mất hơn 120 giây (16/10/2026, tab Duyệt đơn): huỷ sớm rồi gửi lại
    // chỉ chồng thêm truy vấn nặng lên máy chủ (truy vấn cũ vẫn chạy) – nên chờ lâu. Bấm Dừng vẫn huỷ ngay.
    listTimeoutMs: 300000,
    writeTimeoutMs: 60000, // chờ tối đa cho một lệnh ghi
    syncTimeoutMs: 300000, // chờ tối đa cho lệnh đồng bộ cả đợt (DongBoDonDaDuyet)
  },

  // Nếu mở CSV bằng Excel mà dữ liệu dồn vào 1 cột, đổi thành ';'
  csvSeparator: ',',
};
