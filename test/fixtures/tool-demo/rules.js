/* Công cụ THỬ (chỉ dùng trong test): chứng minh thêm công cụ không phải sửa core/. Luật thuần. */
ADXRules.demo = (() => {
  // Đơn chưa xử lý → Không xử lý. noExpect: cố tình bỏ expect để thử lõi chặn
  function planOf(v, d, noExpect) {
    if (ADXModel.serverState(v) !== 'pending' || !d.goi) return { kind: 'skip', label: 'bỏ qua', reqs: [] };
    const r = ADXModel.thiCong(d.goi, 0, 'Không xử lý');
    return { kind: 'act', label: 'Không xử lý', reqs: [noExpect ? { ...r, expect: undefined } : r] };
  }
  return { planOf };
})();
