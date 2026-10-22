/*
 * GỠ DUYỆT: Bỏ duyệt khung phải → Bỏ duyệt khung trái cho mọi đơn đã duyệt của đợt đang mở.
 *
 * HAI BƯỚC – gỡ duyệt làm đổi thứ tự danh sách trên máy chủ (đơn vừa gỡ nhảy chỗ khác), nên vừa đọc vừa gỡ thì
 * có đơn bị đọc 2 lần và có đơn không bao giờ được đọc (bản 2.2.2: đọc 6 130 hồ sơ mà sót ~1 580). Vì vậy:
 *   1. Đọc HẾT danh sách, chưa gửi lệnh nào (api.limits.read = phasedReadAhead lần đọc chạy song song). Chỉ đọc các đơn đã xử lý (lọc ở
 *      máy chủ) nếu đếm khớp; không thì đọc cả đợt.
 *   2. Gỡ các đơn đã duyệt, nhiều đơn cùng lúc (api.limits.write = phasedWriteConcurrency); trong MỘT đơn vẫn gửi lần lượt khung phải → khung trái.
 * readBeforeWrite: lõi chặn mọi lệnh ghi ở bước 1 và mọi lần đọc ở bước 2.
 */
(() => {
  const R = ADXRules.undo;
  const RESULT = { undo: 'ĐÃ GỠ DUYỆT', unknown: 'KIỂM TRA TAY' };
  const counts = () => ({ undo: 0, skip: 0, unknown: 0 });
  const tagOf = (p) => ({ result: RESULT[p.kind === 'undo' ? 'undo' : 'unknown'], note: p.label });

  // Câu báo kết quả (dùng cả khi chạy xong lẫn khi bấm Dừng)
  function summary(st) {
    const c = st.counts;
    return `${st.stopping ? 'Đã dừng' : 'Xong'} – đã gỡ duyệt ${c.undo} đơn trong ${ADX.duration(Date.now() - st.t0)}`
      + (c.unknown ? `, ${c.unknown} đơn cần kiểm tra tay` : '') + '.'
      + (st.dup ? ` ⚠ Danh sách bị thay đổi trong lúc đọc (${st.dup} đơn đọc trùng) – có thể còn sót, bấm Gỡ duyệt lại.` : '');
  }

  async function run(api) {
    const st = api.state;
    const A = api.config;
    // step: 'read' (bước 1: pos / total đơn đã đọc) | 'write' (bước 2: wDone / wTotal đơn đã gửi lệnh)
    // scope: 'done' (chỉ đọc đơn đã xử lý; before = số đơn không cần đọc) | 'all' (đọc cả đợt)
    Object.assign(st, { before: 0, wDone: 0, wTotal: 0, dup: 0 });

    // Bước 1: đọc hết danh sách `trangThai`, chỉ lập việc cần làm (không giữ cả dữ liệu đơn cho nhẹ bộ nhớ).
    // totals (chỉ khi đọc danh sách đã lọc): tổng số phải là một trong các số này, không có đơn chưa xử lý, không trùng,
    // đọc đủ – sai một điều là bộ lọc không như dự kiến → trả về null để đọc cả đợt.
    async function readPlan(trangThai, totals) {
      Object.assign(st, { pos: 0, total: 0, dup: 0, counts: counts() });
      const todo = [];
      const ids = new Set();
      const bad = (total) => totals && !totals.includes(total);
      for await (const { v, pos, total } of api.readItems(trangThai, A.runPageSize, api.limits.read)) {
        if (bad(total) || (totals && v.trangThaiGoiTinDongBo === 0)) return null;
        st.total = total;
        st.pos = Math.max(st.pos, pos);
        api.broadcast();
        // Không gửi lệnh nào trong lúc đọc nên không được trùng; trùng = có người khác đang sửa đợt này
        if (ids.has(v.goiTinDongBoNId)) {
          if (totals) return null;
          st.dup++;
          continue;
        }
        ids.add(v.goiTinDongBoNId);
        const d = { ...ADXModel.info(v), ...ADXModel.landOf(v) };
        const p = R.undoFor(v, d);
        const stt = `${pos}/${total}`;
        api.log(`${stt} ${d.maDon || '?'} · ${ADXModel.stateLabel(v)} → ${p.label}`);
        if (p.kind === 'undo') todo.push({ d, p, stt });
        else st.counts[p.kind]++;
        if (p.kind === 'unknown') api.writeLog(d, stt, tagOf(p));
      }
      if (totals && !st.stopping && (ids.size !== st.total || bad(st.total))) return null;
      return todo;
    }

    // Bước 1 nhanh: chỉ đọc các đơn ĐÃ XỬ LÝ (lọc ở máy chủ) – đơn chưa xử lý không bao giờ cần gỡ.
    // ponytail: giá trị lọc '1' (đã xử lý) và '2' (đã đồng bộ) đoán theo trangThaiGoiTinDongBo – chỉ tin khi đếm khớp:
    // số đơn đọc được = cả đợt − chưa xử lý (− đã đồng bộ, nếu bộ lọc '1' không gồm chúng). Không khớp → null.
    async function readDone() {
      const opt = (pr) => pr.catch((e) => { if (e.stopped) throw e; return null; });
      const [pAll, pPend, pSync] = await Promise.all([
        api.getList('-1', 0, 1),
        opt(api.getList('0', 0, A.runPageSize)),
        opt(api.getList('2', 0, A.runPageSize)),
      ]);
      // Bộ lọc "chưa xử lý" phải trả đúng đơn chưa xử lý (bộ lọc bị bỏ qua mà tin số này thì sẽ sót đơn)
      if (!pPend || !ADXModel.itemsOf(pPend).every((v) => v.trangThaiGoiTinDongBo === 0)) return null;
      const all = ADXModel.totalOf(pAll);
      const pend = ADXModel.totalOf(pPend);
      const syncItems = ADXModel.itemsOf(pSync);
      const sync = syncItems.length && syncItems.every((v) => v.trangThaiGoiTinDongBo === 2) ? ADXModel.totalOf(pSync) : 0;
      api.log(`Đợt có ${all} đơn: ${pend} chưa xử lý${sync ? `, ${sync} đã đồng bộ` : ''} → thử chỉ đọc đơn đã xử lý`);
      let todo = null;
      try {
        todo = await readPlan('1', [all - pend, all - pend - sync]);
      } catch (e) {
        if (e.stopped) throw e;
        api.log(`Đọc đơn đã xử lý lỗi: ${e.message}`);
      }
      if (todo) st.before = all - st.total; // đơn không cần đọc (chưa xử lý, đã đồng bộ)
      return todo;
    }

    api.log(`===== GỠ DUYỆT · đợt ${api.dot}`);
    Object.assign(st, { step: 'read', scope: 'done' });
    api.broadcast(true);
    let todo = await readDone();
    if (!todo && !st.stopping) {
      api.log('Bộ lọc "đã xử lý" không như dự kiến → đọc cả đợt');
      Object.assign(st, { scope: 'all', before: 0 });
      todo = await readPlan('-1');
    }
    if (st.stopping) return summary(st);

    // Bước 2: gỡ duyệt Bỏ duyệt khung phải → Bỏ duyệt khung trái
    api.log(`Đọc xong ${st.pos} đơn – cần gỡ ${todo.length} đơn`);
    Object.assign(st, { step: 'write', wTotal: todo.length });
    api.broadcast(true);
    await api.pool(todo, api.limits.write, async ({ d, p, stt }) => {
      await api.execute({ d, plan: p, stt, ...tagOf(p), decision: p.label });
      st.counts.undo++;
      st.wDone++;
      api.broadcast();
    });
    return summary(st);
  }

  ADXTools.register({
    id: 'undo',
    name: 'Gỡ duyệt',
    readBeforeWrite: true,
    log: {
      title: 'Thống kê bỏ duyệt',
      file: 'bo-duyet',
      results: {
        undo: { text: RESULT.undo, label: 'Đã gỡ duyệt', cls: 'ok' },
        unknown: { text: RESULT.unknown, label: 'Kiểm tra tay', cls: 'warn' },
      },
    },
    counts,
    run,
    summary,
    panel: {
      start: 'Gỡ duyệt',
      style: 'warn',
      confirm: 'GỠ DUYỆT TẤT CẢ các đơn đã duyệt của đợt đang mở?\n\n'
        + '• Đơn đã Thêm vào dữ liệu vận hành: Bỏ duyệt khung phải → Bỏ duyệt khung trái\n'
        + '• Kể cả đơn do người duyệt tay\n'
        + '• Trạng thái lạ (VD đã đồng bộ): không gửi gì, để kiểm tra tay\n'
        + '• Sau khi gỡ, đơn về "chưa xử lý"',
      // Bước 1 đọc hết đợt (chưa gửi lệnh), bước 2 mới gỡ
      progress(s) {
        const c = s.counts;
        const write = s.step === 'write';
        const what = s.scope === 'done' ? 'đơn đã xử lý' : 'hồ sơ';
        const [n, of] = write ? [s.wDone, s.wTotal] : [s.pos, s.total];
        const pct = of ? Math.min(100, Math.round((n * 100) / of)) : s.running ? 0 : 100;
        let text;
        if (s.running && s.stopping) text = 'Đang dừng – chờ gửi xong các đơn đang dở…';
        else if (s.running && write) text = `Bước 2/2 · Đang gỡ duyệt ${s.wDone} / ${s.wTotal} đơn`;
        else if (s.running) text = `Bước 1/2 · Đang đọc ${what} ${s.pos} / ${s.total || '?'}`;
        else text = s.total ? `Đã đọc ${s.pos} / ${s.total} ${what} · gỡ ${c.undo} / ${s.wTotal} đơn` : 'Không có đơn nào cần gỡ';
        return { text, pct };
      },
      counters: (s) => [
        { label: 'Đã gỡ duyệt', value: s.counts.undo || 0, cls: 'ok' },
        { label: 'Cần kiểm tra tay', value: s.counts.unknown || 0, cls: 'warn' },
        { label: 'Bỏ qua (chưa duyệt)', value: (s.counts.skip || 0) + (s.before || 0), cls: '' }, // kể cả đơn chưa xử lý không cần đọc
      ],
      note: (s) => (s.counts.unknown
        ? '"Cần kiểm tra tay": đơn ở trạng thái lạ (VD khung phải đã Cập nhật lịch sử mà khung trái chưa Thêm vào, đã đồng bộ) – extension không gửi gì, hãy xử lý tay.'
        : ''),
    },
  });
})();
