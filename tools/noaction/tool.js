/*
 * KHÔNG XỬ LÝ HẾT: đánh "Không xử lý" ở khung trái cho MỌI đơn của đợt đang mở; khung phải đang "Cập nhật lịch sử"
 * thì Bỏ duyệt khung phải trước. Khác Gỡ duyệt (trả đơn về chưa xử lý): đơn kết thúc ở "đã Không xử lý".
 *
 * HAI BƯỚC như Gỡ duyệt (mỗi lệnh ghi làm đổi thứ tự danh sách trên máy chủ):
 *   1. Đọc HẾT cả đợt (trangThai '-1'), chưa gửi lệnh nào.
 *   2. Gửi lệnh, nhiều đơn cùng lúc; trong MỘT đơn gửi lần lượt, lệnh đầu sai thì không gửi lệnh sau.
 * readBeforeWrite: lõi chặn mọi lệnh ghi ở bước 1 và mọi lần đọc ở bước 2.
 */
(() => {
  const R = ADXRules.noaction;
  const RESULT = { change: 'ĐÃ KHÔNG XỬ LÝ', unknown: 'KIỂM TRA TAY' };
  const counts = () => ({ change: 0, skip: 0, unknown: 0 });
  const tagOf = (p) => ({ result: RESULT[p.kind === 'change' ? 'change' : 'unknown'], note: p.label });

  function summary(st) {
    const c = st.counts;
    return `${st.stopping ? 'Đã dừng' : 'Xong'} – đã Không xử lý ${c.change} đơn trong ${ADX.duration(Date.now() - st.t0)}`
      + (c.unknown ? `, ${c.unknown} đơn cần kiểm tra tay` : '') + '.'
      + (st.dup ? ` ⚠ Danh sách bị thay đổi trong lúc đọc (${st.dup} đơn đọc trùng) – có thể còn sót, bấm Không xử lý hết lại.` : '');
  }

  async function run(api) {
    const st = api.state;
    const A = api.config;
    Object.assign(st, { step: 'read', scope: 'all', wDone: 0, wTotal: 0, dup: 0 });
    api.log(`===== KHÔNG XỬ LÝ HẾT · đợt ${api.dot}`);
    api.broadcast(true);

    // Bước 1: đọc hết cả đợt, chỉ lập việc cần làm
    const todo = [];
    const ids = new Set();
    for await (const { v, pos, total } of api.readItems('-1', A.runPageSize, api.limits.read)) {
      st.total = total;
      st.pos = Math.max(st.pos, pos);
      api.broadcast();
      // Không gửi lệnh nào trong lúc đọc nên không được trùng; trùng = có người khác đang sửa đợt này.
      // Đơn thiếu mã gói tin không tính là trùng (luật đưa về kiểm tra tay).
      if (v.goiTinDongBoNId && ids.has(v.goiTinDongBoNId)) {
        st.dup++;
        continue;
      }
      ids.add(v.goiTinDongBoNId);
      const d = { ...ADXModel.info(v), ...ADXModel.landOf(v) };
      const p = R.noactionFor(v, d);
      const stt = `${pos}/${total}`;
      api.log(`${stt} ${d.maDon || '?'} · ${ADXModel.stateLabel(v)} → ${p.label}`);
      if (p.kind === 'change') todo.push({ d, p, stt });
      else st.counts[p.kind]++;
      if (p.kind === 'unknown') api.writeLog(d, stt, tagOf(p));
    }
    if (st.stopping) return summary(st);

    // Bước 2: gửi lệnh
    api.log(`Đọc xong ${st.pos} đơn – cần Không xử lý ${todo.length} đơn`);
    Object.assign(st, { step: 'write', wTotal: todo.length });
    api.broadcast(true);
    await api.pool(todo, api.limits.write, async ({ d, p, stt }) => {
      await api.execute({ d, plan: p, stt, ...tagOf(p), decision: p.label });
      st.counts.change++;
      st.wDone++;
      api.broadcast();
    });
    return summary(st);
  }

  ADXTools.register({
    id: 'noaction',
    name: 'Không xử lý hết',
    readBeforeWrite: true,
    log: {
      title: 'Thống kê Không xử lý hết',
      file: 'khong-xu-ly-het',
      results: {
        change: { text: RESULT.change, label: 'Đã Không xử lý', cls: 'no' },
        unknown: { text: RESULT.unknown, label: 'Kiểm tra tay', cls: 'warn' },
      },
    },
    counts,
    run,
    summary,
    panel: {
      start: 'Không xử lý hết',
      style: 'warn',
      confirm: 'KHÔNG XỬ LÝ TẤT CẢ các đơn của đợt đang mở?\n\n'
        + '• Khung phải đã Cập nhật lịch sử: Bỏ duyệt khung phải → Không xử lý khung trái\n'
        + '• Đơn chưa xử lý và đơn đã duyệt (kể cả do người duyệt tay): Không xử lý khung trái\n'
        + '• Đơn đã Không xử lý: bỏ qua\n'
        + '• Trạng thái lạ (VD đã đồng bộ), thiếu mã, khung phải không khớp: không gửi gì, để kiểm tra tay\n'
        + '• Sau khi chạy, đơn ở "đã Không xử lý"',
      progress(s) {
        const c = s.counts;
        const write = s.step === 'write';
        const [n, of] = write ? [s.wDone, s.wTotal] : [s.pos, s.total];
        const pct = of ? Math.min(100, Math.round((n * 100) / of)) : s.running ? 0 : 100;
        let text;
        if (s.running && s.stopping) text = 'Đang dừng – chờ gửi xong các đơn đang dở…';
        else if (s.running && write) text = `Bước 2/2 · Đang Không xử lý ${s.wDone} / ${s.wTotal} đơn`;
        else if (s.running) text = `Bước 1/2 · Đang đọc hồ sơ ${s.pos} / ${s.total || '?'}`;
        else text = s.total ? `Đã đọc ${s.pos} / ${s.total} hồ sơ · Không xử lý ${c.change} / ${s.wTotal || 0} đơn` : 'Không có đơn nào';
        return { text, pct };
      },
      counters: (s) => [
        { label: 'Đã Không xử lý', value: s.counts.change || 0, cls: 'no' },
        { label: 'Cần kiểm tra tay', value: s.counts.unknown || 0, cls: 'warn' },
        { label: 'Bỏ qua (đã Không xử lý)', value: s.counts.skip || 0, cls: '' },
      ],
      note: (s) => (s.counts.unknown
        ? '"Cần kiểm tra tay": thiếu mã gói tin, khung phải không khớp, hoặc trạng thái lạ (VD đã đồng bộ) – extension không gửi gì, hãy xử lý tay.'
        : ''),
    },
  });
})();
