/*
 * DUYỆT ĐVHC 2 CẤP – MỘT nút cho cả đợt đang mở. Khung trái và khung phải cùng Giấy chứng nhận (cùng tập số phát hành)
 * và cùng chủ sử dụng (tên giống hệt, kể cả hoa / thường) → Thêm vào dữ liệu vận hành → Cập nhật lịch sử; không khớp → Không xử lý.
 *   - Đơn chưa xử lý: đánh theo luật.
 *   - Đơn đã xử lý: kiểm tra lại; sai luật → Bỏ duyệt khung phải → Bỏ duyệt khung trái → đánh lại đúng.
 * Luật: tools/dvhc/rules.js (planFor).
 *
 * HAI BƯỚC như Gỡ duyệt (mỗi lệnh ghi làm đổi thứ tự danh sách trên máy chủ):
 *   1. Đọc HẾT cả đợt (trangThai '-1'), chưa gửi lệnh nào.
 *   2. Gửi lệnh, nhiều đơn cùng lúc; trong MỘT đơn gửi lần lượt, lệnh đầu sai thì không gửi lệnh sau.
 * readBeforeWrite: lõi chặn mọi lệnh ghi ở bước 1 và mọi lần đọc ở bước 2.
 */
(() => {
  const R = ADXRules.dvhc;
  const RESULT = { approve: 'ĐƯỢC DUYỆT', reject: 'KHÔNG DUYỆT', unknown: 'KIỂM TRA TAY' };
  const counts = () => ({ approve: 0, reject: 0, fix: 0, ok: 0, unknown: 0 });
  const tagOf = (p) => ({ result: RESULT[p.kind] || RESULT.unknown, note: p.reason || p.label });

  function summary(st) {
    const c = st.counts;
    return `${st.stopping ? 'Đã dừng' : 'Xong'} – đã duyệt ${c.approve} đơn, Không xử lý ${c.reject} đơn`
      + (c.fix ? ` (trong đó đánh lại ${c.fix} đơn đánh nhầm)` : '') + `, ${c.ok} đơn đã đúng, trong ${ADX.duration(Date.now() - st.t0)}`
      + (c.unknown ? `, ${c.unknown} đơn cần kiểm tra tay` : '') + '.'
      + (st.dup ? ` ⚠ Danh sách bị thay đổi trong lúc đọc (${st.dup} đơn đọc trùng) – có thể còn sót, bấm Duyệt ĐVHC lại.` : '');
  }

  async function run(api) {
    const st = api.state;
    const A = api.config;
    Object.assign(st, { step: 'read', scope: 'all', wDone: 0, wTotal: 0, dup: 0 });
    api.log(`===== DUYỆT ĐVHC 2 CẤP · đợt ${api.dot}`);
    api.broadcast(true);

    // Bước 1: đọc hết cả đợt, chỉ lập việc cần làm
    const todo = [];
    const ids = new Set();
    for await (const { v, pos, total } of api.readItems('-1', A.runPageSize, api.limits.read)) {
      st.total = total;
      st.pos = Math.max(st.pos, pos);
      api.broadcast();
      // Không gửi lệnh nào trong lúc đọc nên không được trùng; trùng = có người khác đang sửa đợt này
      if (v.goiTinDongBoNId && ids.has(v.goiTinDongBoNId)) {
        st.dup++;
        continue;
      }
      ids.add(v.goiTinDongBoNId);
      const d = { ...ADXModel.info(v), ...ADXModel.landOf(v) };
      const p = R.planFor(v, d);
      const stt = `${pos}/${total}`;
      api.log(`${stt} ${d.maDon || `(gói tin ${d.goi})`} · ${ADXModel.stateLabel(v)} → ${p.label}${p.reason ? `   (${p.reason})` : ''}`);
      if (p.reqs.length) todo.push({ d, p, stt });
      else st.counts[p.kind]++;
      if (p.kind === 'unknown') api.writeLog(d, stt, tagOf(p));
      if (p.kind === 'ok') api.writeLog(d, stt, { result: 'ĐÃ ĐÚNG', note: `không gửi lệnh: ${p.label} – ${p.reason}` }, true);
    }
    if (st.stopping) return summary(st);

    // Bước 2: gửi lệnh
    api.log(`Đọc xong ${st.pos} đơn – cần gửi lệnh ${todo.length} đơn`);
    Object.assign(st, { step: 'write', wTotal: todo.length });
    api.broadcast(true);
    await api.pool(todo, api.limits.write, async ({ d, p, stt }) => {
      await api.execute({ d, plan: p, stt, ...tagOf(p) });
      st.counts[p.kind]++;
      if (p.fix) st.counts.fix++;
      st.wDone++;
      api.broadcast();
    });
    return summary(st);
  }

  ADXTools.register({
    id: 'dvhc',
    name: 'Duyệt ĐVHC 2 cấp',
    tab: 'ĐVHC 2 cấp',
    readBeforeWrite: true,
    logByGoi: true,
    log: {
      title: 'Thống kê duyệt ĐVHC 2 cấp',
      file: 'duyet-dvhc',
      results: {
        approve: { text: RESULT.approve, label: 'Được duyệt', cls: 'ok' },
        reject: { text: RESULT.reject, label: 'Không xử lý', cls: 'no' },
        unknown: { text: RESULT.unknown, label: 'Kiểm tra tay', cls: 'warn' },
      },
    },
    counts,
    run,
    summary,
    panel: {
      start: 'Duyệt ĐVHC',
      style: 'go',
      confirm: 'DUYỆT ĐVHC 2 CẤP cả đợt đang mở?\n\n'
        + 'Luật: khung trái và khung phải cùng số phát hành (hoặc cả hai không có số phát hành) VÀ cùng tên chủ (giống hệt, kể cả hoa / thường) '
        + '→ Thêm vào dữ liệu vận hành → Cập nhật lịch sử; không trùng → Không xử lý.\n\n'
        + '• Đơn chưa xử lý (kể cả đã bị Bỏ duyệt): đánh theo luật\n'
        + '• Đơn đã xử lý đúng luật: không gửi gì\n'
        + '• Đơn đã xử lý SAI luật (kể cả đơn làm tay): Bỏ duyệt khung phải → Bỏ duyệt khung trái → đánh lại đúng\n'
        + '• Khung phải không khớp mã: Không xử lý\n'
        + '• Thiếu mã gói tin, trạng thái lạ: không gửi gì, để kiểm tra tay',
      progress(s) {
        const c = s.counts;
        const write = s.step === 'write';
        const [n, of] = write ? [s.wDone, s.wTotal] : [s.pos, s.total];
        const pct = of ? Math.min(100, Math.round((n * 100) / of)) : s.running ? 0 : 100;
        let text;
        if (s.running && s.stopping) text = 'Đang dừng – chờ gửi xong các đơn đang dở…';
        else if (s.running && write) text = `Bước 2/2 · Đang gửi lệnh ${s.wDone} / ${s.wTotal} đơn`;
        else if (s.running) text = `Bước 1/2 · Đang đọc hồ sơ ${s.pos} / ${s.total || '?'}`;
        else text = s.total ? `Đã đọc ${s.pos} / ${s.total} hồ sơ · gửi lệnh ${c.approve + c.reject} / ${s.wTotal || 0} đơn` : 'Không có đơn nào';
        return { text, pct };
      },
      counters: (s) => [
        { label: 'Đã duyệt', value: s.counts.approve || 0, cls: 'ok' },
        { label: 'Không xử lý', value: s.counts.reject || 0, cls: 'no' },
        { label: 'Trong đó đánh lại', value: s.counts.fix || 0, cls: '' },
        { label: 'Đã đúng', value: s.counts.ok || 0, cls: '' },
        { label: 'Cần kiểm tra tay', value: s.counts.unknown || 0, cls: 'warn' },
      ],
      note: (s) => (s.counts.unknown
        ? '"Cần kiểm tra tay": thiếu mã gói tin, trạng thái lạ hoặc hỏng giữa chừng – xem log, xử lý tay.'
        : ''),
    },
  });
})();
