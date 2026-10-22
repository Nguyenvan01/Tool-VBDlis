/*
 * LUẬT GỠ DUYỆT – thuần, không I/O. Lệnh dựng bằng core/model.js.
 */
ADXRules.undo = (() => {
  const M = ADXModel;

  // GỠ DUYỆT đơn đã duyệt: Bỏ duyệt khung phải → Bỏ duyệt khung trái (đơn về lại "chưa xử lý").
  // Hai lệnh giống hệt lệnh trang gửi khi bấm tay Bỏ duyệt (ghi lại ngày 09/10/2026).
  // Trạng thái lạ (VD khung phải đã Cập nhật lịch sử mà khung trái chưa Thêm vào, đã đồng bộ…) → kiểm tra tay.
  function undoFor(v, d) {
    const s = M.serverState(v);
    const hist = M.vhActions(v).includes(3);
    if (s !== 'approved' && !hist) return { kind: 'skip', label: `bỏ qua (${M.stateLabel(v)})`, reqs: [] };
    if (s !== 'approved' || !d.goi) {
      return { kind: 'unknown', label: `Gỡ duyệt: ${d.goi ? M.stateLabel(v) : 'không có mã gói tin'} – kiểm tra tay`, reqs: [] };
    }
    const reqs = d.vhIds.length ? [M.vanHanh(d.goi, d.vhIds, -1, 0, 'Bỏ duyệt (khung phải)')] : [];
    reqs.push(M.thiCong(d.goi, -1, 'Bỏ duyệt (khung trái)', 0));
    return { kind: 'undo', label: 'GỠ DUYỆT: ' + reqs.map((r) => r.label).join(' → '), reqs };
  }

  return { undoFor };
})();
