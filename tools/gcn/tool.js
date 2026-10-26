/*
 * DUYỆT (GCN): giống hệt "Chạy tự động" (tools/run – cùng luật, cùng cách đọc / gửi / đếm lại) nhưng khung trái có
 * Giấy chứng nhận vẫn duyệt (kể cả đơn đã bị Bỏ duyệt); khung phải có GCN → Không xử lý.
 * Nhật ký riêng (gcn:*, file duyet-gcn) để không lẫn với Thống kê duyệt.
 */
(() => {
  const base = ADXTools.get('run');
  const RESULT = { approve: 'ĐƯỢC DUYỆT', reject: 'KHÔNG DUYỆT', unknown: 'KIỂM TRA TAY' };
  ADXTools.register({
    ...base,
    id: 'gcn',
    name: 'Duyệt (GCN)',
    tab: 'Duyệt (GCN)',
    config: { ...base.config, rules: { leftGcn: false } },
    log: {
      title: 'Thống kê duyệt (GCN)',
      file: 'duyet-gcn',
      results: {
        approve: { text: RESULT.approve, label: 'Được duyệt', cls: 'ok' },
        reject: { text: RESULT.reject, label: 'Không duyệt', cls: 'no' },
        unknown: { text: RESULT.unknown, label: 'Kiểm tra tay', cls: 'warn' },
      },
    },
    panel: {
      ...base.panel,
      confirm: 'DUYỆT (GCN) – chạy TẤT CẢ các đơn chưa xử lý của đợt đang mở?\n\n'
        + 'Giống "Duyệt đơn" nhưng KHUNG TRÁI CÓ GIẤY CHỨNG NHẬN VẪN DUYỆT (kể cả đơn đã bị Bỏ duyệt).\n\n'
        + '• Khung phải không có GCN: Thêm vào dữ liệu vận hành → Cập nhật lịch sử (khung phải chỉ các bản ghi trùng số tờ / số thửa; bản ghi khác để nguyên)\n'
        + '• Khung phải có GCN: Không xử lý\n'
        + '• Đã xử lý rồi: bỏ qua\n\n'
        + '⚠ Đừng chạy "Quét và sửa lỡ duyệt GCN" (tab Duyệt đơn) trên đợt này: nó sẽ gỡ các đơn có GCN bên trái vừa duyệt.',
      counters: (s) => [
        { label: 'Đã duyệt', value: s.counts.approve, cls: 'ok' },
        { label: 'Không xử lý', value: s.counts.reject, cls: 'no' },
        { label: 'Cần kiểm tra tay', value: s.counts.unknown, cls: 'warn' },
        { label: 'Đã xử lý từ trước', value: s.counts.skip + (s.before || 0), cls: '' },
      ],
    },
  });
})();
