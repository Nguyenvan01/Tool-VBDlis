/*
 * LUẬT "KHÔNG XỬ LÝ HẾT" – thuần, không I/O. Mọi đơn của đợt kết thúc ở "đã Không xử lý" (noaction).
 * Lệnh dựng bằng core/model.js (không viết body mới).
 */
ADXRules.noaction = (() => {
  const M = ADXModel;
  // Hai danh sách mã giống nhau (không kể thứ tự) – như sameIds của luật duyệt bản cũ
  const sameIds = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

  // Xét theo thứ tự, khớp đâu dừng đó:
  //   1 thiếu mã gói tin → unknown            2 mã bản ghi khung phải không khớp → unknown
  //   3 trạng thái khác → unknown             4 khung phải có "Cập nhật lịch sử" (3) → Bỏ duyệt khung phải → Không xử lý
  //   5 chưa xử lý (kể cả khung trái -1) → Không xử lý      6 đã duyệt → Không xử lý      7 đã Không xử lý → bỏ qua
  function noactionFor(v, d) {
    const unknown = (why) => ({ kind: 'unknown', label: `Không xử lý hết: ${why} – kiểm tra tay`, reqs: [] });
    const vh = Array.isArray(v.ThongTinDangKyVanHanh) ? v.ThongTinDangKyVanHanh : [];
    const s = M.serverState(v);
    if (!d.goi) return unknown('không có mã gói tin');
    if (!sameIds(vh.map((h) => (h.TinhHinhDangKy || {}).tinhHinhDangKyId), d.vhIds)) return unknown('khung phải không khớp mã tình hình đăng ký');
    if (s === 'other') return unknown(M.stateLabel(v));
    let reqs;
    // Khung phải: MỘT lệnh Bỏ duyệt cho mọi bản ghi, rồi mới Không xử lý khung trái
    if (M.vhActions(v).includes(3)) reqs = [M.vanHanh(d.goi, d.vhIds, -1, 0, 'Bỏ duyệt (khung phải)'), M.thiCong(d.goi, 0, 'Không xử lý')];
    else if (s === 'pending' || s === 'approved') reqs = [M.thiCong(d.goi, 0, 'Không xử lý')];
    else return { kind: 'skip', label: `bỏ qua (${M.stateLabel(v)})`, reqs: [] };
    return { kind: 'change', label: 'KHÔNG XỬ LÝ: ' + reqs.map((r) => r.label).join(' → '), reqs };
  }

  return { noactionFor };
})();
