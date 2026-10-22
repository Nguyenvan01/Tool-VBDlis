/*
 * CHẠY TỰ ĐỘNG: duyệt mọi đơn chưa xử lý của đợt đang mở theo luật ở tools/run/rules.js (chuyển từ bản Duyệt 2.1.3).
 *
 * TỐC ĐỘ – lệnh lấy danh sách rất chậm (5–10 giây cho 5 đơn), lệnh duyệt ~0,85 giây:
 *   - Đợt còn ít đơn chưa xử lý: chỉ đọc các đơn CHƯA XỬ LÝ (lọc trạng thái ở máy chủ), mỗi vòng đọc cùng lúc
 *     nhiều trang rồi mới gửi lệnh. Bộ lọc được kiểm tra trước khi tin; không đúng như dự kiến thì tự chuyển
 *     sang đọc toàn bộ đợt.
 *   - Đợt còn nhiều đơn chưa xử lý: đọc lần lượt cả đợt. Đọc danh sách và gửi lệnh chạy song song không chờ nhau:
 *     luôn có readAhead lần đọc đang chạy, đơn nào đọc xong là gửi lệnh ngay.
 *   - Gửi lệnh cho nhiều đơn cùng lúc (writeConcurrency); trong MỘT đơn vẫn gửi lần lượt Thêm vào → Cập nhật lịch sử.
 * ĐỘ CHÍNH XÁC: chạy xong đếm lại số đơn chưa xử lý; còn sót (ngoài các đơn để kiểm tra tay) thì tự chạy thêm lượt.
 */
(() => {
  const R = ADXRules.run;
  const M = ADXModel;
  const RESULT = { approve: 'ĐƯỢC DUYỆT', reject: 'KHÔNG DUYỆT', unknown: 'KIỂM TRA TAY' };
  const counts = () => ({ approve: 0, reject: 0, fix: 0, skip: 0, unknown: 0, warn: 0 });
  // Cột Kết quả / Ghi chú của nhật ký duyệt (như bản cũ)
  // Đơn duyệt: lý do đầu ("không có GCN") bỏ như bản cũ; còn lại (VD chỉ Cập nhật lịch sử một phần khung phải) vẫn ghi
  const tagOf = (d) => ({ result: RESULT[d.status], note: (d.status === 'approve' ? d.reasons.slice(1) : d.reasons).join('; ') });
  const isPending = (v) => v.trangThaiGoiTinDongBo === 0;
  const mismatch = (msg) => Object.assign(new Error(msg), { mismatch: true });

  // ---------------------------------------------------------------- một đơn
  // onlyFix: chỉ làm khi đơn cần SỬA (có GCN mà đang ở trạng thái đã duyệt) – dùng cho "Quét và sửa"
  async function handle(api, v, stt, onlyFix) {
    const st = api.state;
    const d = Object.assign(R.decide(v), M.landOf(v)); // + số tờ / số thửa để ghi log
    let p = R.planFor(v, d, { fixApproved: onlyFix });
    if (onlyFix && p.kind !== 'fix') {
      p = { kind: 'skip', label: `bỏ qua – không còn cần sửa (${M.stateLabel(v)})`, reqs: [] };
    }
    // warn = đơn có GCN đã lỡ duyệt (chỉ cảnh báo, sửa ở "Quét và sửa") – đếm riêng cho dễ thấy
    const tally = p.kind === 'skip' && p.label.startsWith('⚠') ? 'warn' : p.kind;
    st.counts[tally] = (st.counts[tally] || 0) + 1;
    api.log(`${stt} ${d.maDon || '?'} · ${RESULT[d.status]} · ${M.stateLabel(v)} → ${p.label}   (${d.reasons.join('; ')})`);
    if (!p.reqs.length) {
      if (tally !== 'skip') api.writeLog(d, stt, tagOf(d));
      return p.kind;
    }
    // Trong một đơn: gửi lần lượt, lệnh nào cũng phải được máy chủ xác nhận đúng trạng thái (lõi kiểm)
    await api.execute({ d, plan: p, stt, ...tagOf(d) });
    return p.kind;
  }

  // Một đơn trong "Chạy tự động": ghi nhớ đơn đã gửi lệnh / đơn để lại kiểm tra tay để không làm lại
  async function processOne(api, v, stt, seen) {
    const id = v.goiTinDongBoNId;
    if (seen.acted.has(id) || seen.kept.has(id)) return;
    const kind = await handle(api, v, stt, false);
    if (kind === 'approve' || kind === 'reject') seen.acted.add(id);
    else if (kind === 'unknown') seen.kept.add(id);
  }

  // Câu báo kết quả (dùng cả khi chạy xong lẫn khi bấm Dừng)
  function summary(st) {
    const took = ADX.duration(Date.now() - st.t0);
    const c = st.counts;
    const did = c.approve + c.reject;
    if (st.stopping) return `Đã dừng – đã xử lý ${did} đơn trong ${took}.`;
    if (!did && !c.unknown && !c.warn) return 'Không còn đơn nào chưa xử lý.';
    return `Xong – đã xử lý ${did} đơn trong ${took}` + (c.unknown ? `, ${c.unknown} đơn cần kiểm tra tay` : '') + '.';
  }

  async function run(api) {
    const st = api.state;
    const A = api.config;
    const T = api.toolConfig;
    const P = A.runPageSize;
    const seen = { acted: new Set(), kept: new Set() };
    Object.assign(st, { done: 0, before: 0 });

    // Đọc lần lượt cả đợt (vị trí cố định). Đọc danh sách và gửi lệnh chạy song song, không chờ nhau theo trang:
    // đơn nào đọc xong là gửi lệnh ngay, trong lúc các trang sau vẫn đang được đọc.
    async function runAll(firstPage) {
      Object.assign(st, { scope: 'all', before: 0, pos: 0, done: 0, total: 0 });
      await api.pool(api.readItems('-1', A.runPageSize, A.readAhead, firstPage), A.writeConcurrency, async ({ v, pos, total }) => {
        st.total = total;
        await processOne(api, v, `${pos}/${total}`, seen);
        st.done++;
        st.pos = Math.max(st.pos, pos);
        api.broadcast();
      });
    }

    // Chỉ đọc các đơn CHƯA XỬ LÝ. Đơn đã gửi lệnh rời khỏi danh sách lọc, nên lần đọc sau bắt đầu từ
    // số đơn "để lại" (kiểm tra tay) – các đơn này nằm ở đầu phần còn lại của danh sách.
    // Mỗi vòng đọc CÙNG LÚC tối đa readAhead trang rồi mới gửi lệnh: lúc đọc không có lệnh nào đang gửi,
    // nên các trang không bị xô lệch vị trí.
    async function runPending(firstPage, cPend) {
      Object.assign(st, { scope: 'pending', pos: 0, done: 0, total: cPend });
      let first = firstPage;
      let left = cPend; // số đơn chưa xử lý theo lần đọc gần nhất – để biết vòng tới cần đọc mấy trang
      let size = A.runPageSize;
      // Máy chủ trả ít hơn số xin dù còn đơn → xin đúng bằng số đó, để các trang đọc cùng lúc nối liền nhau
      const fitSize = (page, from) => {
        const n = M.itemsOf(page).length;
        if (n && n < size && from + n < M.totalOf(page)) size = n;
      };
      if (first) fitSize(first, 0);
      for (let pass = 1; pass <= T.maxPasses && !st.stopping; pass++) {
        const keptHere = new Set();
        while (!st.stopping) {
          const from = keptHere.size;
          const n = Math.max(1, Math.min(A.readAhead, Math.ceil((left - from) / size)));
          const pages = await Promise.all(Array.from({ length: n }, (_, i) => (i === 0 && first) || api.getList('0', from + i * size, size)));
          first = null;
          left = M.totalOf(pages[0]);
          // Ghép các trang liên tiếp; gặp trang thiếu thì các trang sau bị lệch vị trí → bỏ, vòng sau đọc lại
          const items = [];
          for (const pg of pages) {
            const got = M.itemsOf(pg);
            items.push(...got);
            if (got.length < size) break;
          }
          fitSize(pages[0], from);
          if (!items.length) break;
          const ids = items.map((v) => v.goiTinDongBoNId);
          if (new Set(ids).size < ids.length
            || items.some((v) => !isPending(v) || seen.acted.has(v.goiTinDongBoNId) || keptHere.has(v.goiTinDongBoNId))) {
            throw mismatch('Danh sách "chưa xử lý" của máy chủ không cập nhật / đổi thứ tự');
          }
          const actedBefore = seen.acted.size;
          await api.pool(items, A.writeConcurrency, async (v) => {
            const id = v.goiTinDongBoNId;
            const keptEarlier = seen.kept.has(id);
            await processOne(api, v, '', seen);
            if (seen.kept.has(id)) keptHere.add(id);
            if (!keptEarlier) {
              st.done++;
              st.pos = st.done;
              api.broadcast();
            }
          });
          left -= seen.acted.size - actedBefore;
        }
        if (st.stopping) break;
        // Đếm lại: ngoài các đơn để lại kiểm tra tay, không được còn đơn chưa xử lý nào
        left = M.totalOf(await api.getList('0', 0, 1));
        if (left <= seen.kept.size) break;
        api.log(`Còn ${left - seen.kept.size} đơn chưa xử lý sau lượt ${pass} – chạy thêm lượt`);
        st.total = st.done + (left - seen.kept.size);
      }
    }

    // Sau khi đọc cả đợt: nếu còn đơn chưa xử lý (ngoài các đơn để lại) thì xử lý nốt bằng danh sách lọc.
    // Chỉ đọc 1 đơn để đếm – các đơn để lại kiểm tra tay nằm ở đầu danh sách, đọc cả trang chỉ tốn thời gian.
    async function sweepLeftovers() {
      const left = M.totalOf(await api.getList('0', 0, 1));
      if (left <= seen.kept.size) return;
      api.log(`Còn ${left - seen.kept.size} đơn chưa xử lý sau khi đọc cả đợt – xử lý nốt`);
      const { approve, reject } = st.counts;
      st.phase = 'Đang xử lý nốt các đơn còn sót…';
      try {
        await runPending(null, left);
      } catch (e) {
        if (!e.mismatch) throw e;
        api.log(e.message);
      } finally {
        st.phase = '';
        api.log(`Xử lý nốt: thêm ${st.counts.approve - approve + st.counts.reject - reject} đơn`);
      }
    }

    st.phase = 'Đang đọc danh sách đơn…';
    api.broadcast(true);
    const [pAll, pPend] = await Promise.all([api.getList('-1', 0, P), api.getList('0', 0, P)]);
    const cAll = M.totalOf(pAll);
    const cPend = M.totalOf(pPend);
    st.phase = '';

    // Kiểm tra bộ lọc "chưa xử lý" trước khi tin: mọi đơn trả về phải đúng là chưa xử lý, và các đơn chưa xử lý
    // ở trang đầu của danh sách đầy đủ phải đứng đầu danh sách lọc, đúng thứ tự
    const expect = M.itemsOf(pAll).filter(isPending).map((v) => v.goiTinDongBoNId);
    const got = M.itemsOf(pPend).map((v) => v.goiTinDongBoNId);
    const filterOk = cPend <= cAll
      && M.itemsOf(pPend).every(isPending)
      && expect.every((id, i) => got[i] === id);
    api.log(`Đợt ${api.dot}: ${cAll} đơn, ${cPend} đơn chưa xử lý · bộ lọc ${filterOk ? 'đúng' : 'KHÔNG đúng như dự kiến → đọc toàn bộ'}`);

    if (!filterOk) {
      await runAll(pAll);
    } else if (cPend === 0) {
      st.before = cAll;
    } else if (cPend / Math.max(1, cAll) >= T.fullScanRatio) {
      // Phần lớn chưa xử lý: đọc lần lượt cả đợt (đọc trước trang kế tiếp) nhanh hơn
      await runAll(pAll);
      if (!st.stopping) await sweepLeftovers();
    } else {
      st.before = cAll - cPend;
      try {
        await runPending(pPend, cPend);
      } catch (e) {
        if (!e.mismatch) throw e;
        api.log(`${e.message} → chuyển sang đọc toàn bộ đợt`);
        await runAll(null);
      }
    }
    return summary(st);
  }

  ADXTools.register({
    id: 'run',
    name: 'Chạy tự động',
    tab: 'Duyệt đơn', // chung tab với "Quét và sửa" (audit), như Side Panel bản Duyệt cũ
    readBeforeWrite: false, // như bản cũ: runAll vừa đọc vừa gửi
    config: {
      fullScanRatio: 0.5, // tỉ lệ đơn chưa xử lý từ mức này trở lên thì đọc cả đợt (có đọc trước) thay vì chỉ đọc đơn chưa xử lý
      maxPasses: 3,       // chạy xong còn sót đơn chưa xử lý thì chạy thêm lượt, tối đa bấy nhiêu lượt
    },
    log: {
      title: 'Thống kê duyệt',
      file: 'duyet-don',
      results: {
        approve: { text: RESULT.approve, label: 'Được duyệt', cls: 'ok' },
        reject: { text: RESULT.reject, label: 'Không duyệt', cls: 'no' },
        unknown: { text: RESULT.unknown, label: 'Kiểm tra tay', cls: 'warn' },
      },
    },
    counts,
    run,
    summary,
    handle, // "Quét và sửa" (audit) dùng lại, với onlyFix = true
    panel: {
      start: 'Bắt đầu',
      style: 'go',
      confirm: 'Chạy TẤT CẢ các đơn chưa xử lý của đợt đang mở?\n\n'
        + '• Không có GCN: Thêm vào dữ liệu vận hành → Cập nhật lịch sử (khung phải chỉ các bản ghi trùng số tờ / số thửa; bản ghi khác để nguyên)\n'
        + '• Có GCN: Không xử lý\n'
        + '• Đã xử lý rồi: bỏ qua',
      // Tiến độ "Chạy tự động": thanh tiến độ + 4 ô số (như renderRun của bản cũ)
      progress(s) {
        const pending = s.scope === 'pending';
        const pct = s.total ? Math.min(100, Math.round((s.pos * 100) / s.total)) : s.running ? 0 : 100;
        let text;
        if (s.running && s.stopping) text = 'Đang dừng – chờ gửi xong các đơn đang dở…';
        else if (s.running && s.phase && !s.total) text = s.phase;
        else if (s.running) text = (s.phase ? s.phase + ' ' : 'Đang xử lý ') + (pending ? `đơn ${s.pos} / ${s.total} chưa xử lý` : `hồ sơ ${s.pos} / ${s.total || '?'}`);
        else text = pending ? `Đã xem ${s.done} / ${s.total} đơn chưa xử lý` : s.total ? `Đã chạy ${s.done} / ${s.total} hồ sơ` : 'Không có đơn nào cần xử lý';
        return { text, pct };
      },
      counters: (s) => [
        { label: 'Đã duyệt', value: s.counts.approve, cls: 'ok' },
        { label: 'Không xử lý (có GCN)', value: s.counts.reject, cls: 'no' },
        { label: 'Cần kiểm tra tay', value: s.counts.unknown, cls: 'warn' },
        { label: 'Đã xử lý từ trước', value: s.counts.skip + (s.before || 0), cls: '' },
      ],
      note: (s) => (s.counts.warn
        ? `⚠ ${s.counts.warn} đơn có Giấy chứng nhận đã lỡ duyệt – bấm "Quét và sửa" ở thẻ bên dưới để sửa.`
        : s.counts.unknown ? '"Cần kiểm tra tay": đơn đã bị "Bỏ duyệt" trước đó, thiếu dữ liệu hoặc dữ liệu không khớp – extension không gửi gì, hãy xử lý tay.' : ''),
    },
  });
})();
