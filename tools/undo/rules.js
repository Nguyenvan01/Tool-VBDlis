/*
 * LUẬT GỠ DUYỆT – thuần, không I/O. Lệnh dựng bằng core/model.js.
 */
ADXRules.undo = (() => {
  const M = ADXModel;

  // GỠ HẾT TRẠNG THÁI: mọi đơn đã xử lý về lại "chưa xử lý".
  //   đã duyệt → Bỏ duyệt khung phải (mọi bản ghi) → Bỏ duyệt khung trái
  //   đã Không xử lý → Bỏ duyệt khung phải (chỉ bản ghi đang Cập nhật lịch sử, nếu có) → Bỏ duyệt khung trái
  //   chưa xử lý mà khung phải còn Cập nhật lịch sử (Bỏ duyệt dở) → Bỏ duyệt khung phải
  // Lệnh giống hệt lệnh trang gửi khi bấm tay Bỏ duyệt (ghi lại ngày 09/10/2026). Trạng thái lạ (VD đã đồng bộ) → kiểm tra tay.
  function undoFor(v, d) {
    const s = M.serverState(v);
    const hist = M.vhActions(v).includes(3);
    if ((s === 'pending' || s === 'other') && !hist) return { kind: 'skip', label: `bỏ qua (${M.stateLabel(v)})`, reqs: [] };
    if (s === 'other' || !d.goi) {
      return { kind: 'unknown', label: `Gỡ duyệt: ${d.goi ? M.stateLabel(v) : 'không có mã gói tin'} – kiểm tra tay`, reqs: [] };
    }
    const ids = s === 'approved' ? d.vhIds : M.historyIds(v);
    const reqs = ids.length ? [M.vanHanh(d.goi, ids, -1, 0, 'Bỏ duyệt (khung phải)')] : [];
    if (s !== 'pending') reqs.push(M.thiCong(d.goi, -1, 'Bỏ duyệt (khung trái)', 0));
    return { kind: 'undo', label: 'GỠ DUYỆT: ' + reqs.map((r) => r.label).join(' → '), reqs };
  }

  return { undoFor };
})();
