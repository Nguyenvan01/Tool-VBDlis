/*
 * QUÉT VÀ SỬA LỠ DUYỆT GCN (chuyển từ auditFix của bản Duyệt 2.1.3). Luật: tools/run/rules.js (decide, planFor + fixApproved).
 * Quét cả đợt. LỠ DUYỆT = không được duyệt vì có GCN nhưng khung phải đã "Cập nhật lịch sử" hoặc khung trái đã
 * "Thêm vào dữ liệu vận hành". Gặp đơn nào sửa luôn đơn đó: Bỏ duyệt khung phải → Không xử lý (handle của run, onlyFix).
 * Đơn ở trạng thái lạ (VD đã đồng bộ) chỉ liệt kê để kiểm tra tay. Sửa lỗi một đơn là DỪNG HẲN.
 * Nhật ký ghi chung với "Chạy tự động" (log: 'run'), như bản cũ. Kết quả lần quét gần nhất lưu ở "audit:last".
 */
(() => {
  const M = ADXModel;
  const R = ADXRules.run;
  const CONFIG = {
    auditPageSize: 20, // số đơn mỗi lần lấy danh sách (máy chủ trả ít hơn cũng không sao)
    uiPageSize: 10,    // số đơn mỗi trang của bảng trên trang web – để báo "trang thứ mấy" có đơn lỡ duyệt
  };
  const freshAudit = () => ({ scanned: 0, gcn: 0, wrong: 0, fixed: 0, manual: 0, error: 0, pending: 0 });

  function summary(st) {
    const a = st.audit;
    return `${st.stopping ? 'Đã dừng' : 'Xong'}: quét ${a.scanned}/${st.total} đơn trong ${ADX.duration(Date.now() - st.t0)} · lỡ duyệt ${a.wrong} · đã sửa ${a.fixed}`
      + (a.manual ? ` · kiểm tra tay ${a.manual}` : '');
  }

  async function run(api) {
    const st = api.state;
    const A = api.config;
    const T = api.toolConfig;
    const handle = ADXTools.get('run').handle;
    st.audit = freshAudit();
    const res = {
      time: api.now(), dot: api.dot, total: 0, scanned: 0, gcn: 0, pending: 0, pendingManual: 0,
      complete: false, findings: [], states: {},
    };
    const save = () => api.save('last', res);
    const sum = () => {
      const by = (r) => res.findings.filter((f) => f.result === r).length;
      st.audit = {
        scanned: res.scanned, gcn: res.gcn, wrong: res.findings.length, pending: res.pending,
        fixed: by('fixed'), manual: by('manual'), error: by('error'),
      };
    };
    st.scope = 'all';
    api.log(`===== ${res.time} · QUÉT VÀ SỬA LỠ DUYỆT GCN · đợt ${res.dot}`);
    await save();
    try {
      for await (const pg of api.readPages('-1', T.auditPageSize, A.readAhead)) {
        res.total = st.total = pg.total;
        let changed = false;
        for (let j = 0; j < pg.items.length; j++) {
          const v = pg.items[j];
          const pos = pg.start + j + 1;
          const d = R.decide(v);
          const s = M.serverState(v);
          res.scanned++;
          st.pos = Math.max(st.pos, pos);
          const raw = M.rawState(v);
          res.states[raw] = (res.states[raw] || 0) + 1;
          const hasGcn = d.status === 'reject' && /Giấy chứng nhận/.test(d.reasons.join(' '));
          if (hasGcn) res.gcn++;
          if (s === 'pending') {
            res.pending++;
            if (d.status === 'unknown') res.pendingManual++;
          }
          const hist = M.historyIds(v).length > 0;
          // Chỉ sửa đơn lỡ duyệt vì có GCN – đơn bị loại vì lý do khác (VD số tờ / số thửa) đã duyệt thì không tự gỡ
          if (!hasGcn || !(hist || s === 'approved')) continue;

          const f = {
            pos, page: Math.ceil(pos / T.uiPageSize), maDon: d.maDon, goi: d.goi, owners: d.owners.join('; '), reason: d.reasons.join('; '),
            gcnIds: ADX.uniq((v.ThongTinDangKyVanHanh || []).flatMap((h) => (h.ListGiayChungNhan || []).map((g) => String(g.giayChungNhanId)))).join(', '),
            why: hist ? 'đã Cập nhật lịch sử' : 'đã Thêm vào dữ liệu vận hành',
            history: hist,
            state: s === 'approved' ? 'approved' : 'other', stateLabel: M.stateLabel(v),
            result: '', fixed: '',
          };
          res.findings.push(f);
          changed = true;
          api.log(`⚠ #${pos} (trang ${f.page}) ${d.maDon} – ${f.why.toUpperCase()} nhưng ${f.reason}`);
          if (f.state === 'other') {
            f.result = 'manual';
            f.fixed = `${f.stateLabel} – kiểm tra tay`;
            continue;
          }
          try {
            const kind = await handle(api, v, `${pos}/${pg.total}`, true);
            f.result = kind === 'fix' ? 'fixed' : 'skipped';
            f.fixed = kind === 'fix' ? 'đã sửa ' + api.now() : 'không cần sửa';
          } catch (e) {
            f.result = 'error';
            f.fixed = 'LỖI: ' + ((e && e.message) || e);
            throw e;
          } finally {
            sum();
            api.broadcast();
          }
        }
        sum();
        api.broadcast();
        if (changed) await save();
        if (st.stopping) break;
      }
      res.complete = !st.stopping && res.scanned >= res.total;
    } finally {
      api.log('Các trạng thái gặp được: ' + Object.entries(res.states).map(([k, n]) => `[${k}] ${n} đơn`).join(' · '));
      await save();
    }
    return summary(st);
  }

  // ---------------------------------------------------------------- báo cáo trên Side Panel (renderAudit của bản cũ)
  const resultOf = (f) => f.result || (f.fixed ? 'fixed' : f.state === 'other' ? 'manual' : '');
  const RESULT_TEXT = {
    fixed: (f) => '✓ ' + (f.fixed || 'Đã sửa'),
    manual: (f) => 'Kiểm tra tay – ' + (f.stateLabel || 'trạng thái lạ'),
    error: (f) => f.fixed || 'Lỗi',
    skipped: () => 'Không cần sửa',
    '': () => 'Chưa sửa',
  };

  // ui (do Side Panel đưa vào): { running, h(tag, cls, text), button(cls, icon, label), boxes(el, items), csv, download }
  function render(el, res, ui) {
    el.textContent = '';
    if (!res) return;
    // Kết quả quét từ bản trước chưa có số trang
    res.findings.forEach((f) => { if (!f.page) f.page = Math.ceil(f.pos / CONFIG.uiPageSize); });
    const count = (r) => res.findings.filter((f) => resultOf(f) === r).length;
    const fixed = count('fixed');
    const manual = count('manual');
    const bad = res.findings.length - fixed - count('skipped');
    // Đang quét thì dòng tiến độ ở trên đã đủ; xong thì tổng kết lần quét đã lưu
    if (!ui.running) {
      el.append(ui.h('div', 'api-state ' + (bad ? 'err' : 'ok'),
        `${res.complete ? 'Đã quét hết' : 'Quét dở (đã dừng)'} ${res.scanned}/${res.total} đơn · có GCN ${res.gcn}`
        + (res.findings.length ? '' : ' · không có đơn nào lỡ duyệt ✓')
        + (manual ? ` · ${manual} đơn cần kiểm tra tay` : '')
        + (res.pending ? ` · còn ${res.pending} đơn chưa xử lý${res.pendingManual ? ` (${res.pendingManual} cần kiểm tra tay)` : ''}` : '')));
    }
    const boxes = ui.h('div', 'stats four');
    ui.boxes(boxes, [
      { label: 'Đã quét', value: res.scanned, cls: '' },
      { label: 'Lỡ duyệt', value: res.findings.length, cls: 'no' },
      { label: 'Đã sửa', value: fixed, cls: 'ok' },
      { label: 'Kiểm tra tay', value: manual, cls: 'warn' },
    ]);
    const pages = [...new Set(res.findings.map((f) => f.page))].sort((a, b) => a - b);
    el.append(boxes,
      ui.h('div', 'muted small', `Lần quét: ${res.time}` + (pages.length ? ` · lỡ duyệt ở trang: ${pages.join(', ')} (${CONFIG.uiPageSize} đơn/trang)` : '')));

    if (res.findings.length) {
      const wrap = ui.h('div', 'audit-table-wrap');
      const table = ui.h('table', 'audit-table');
      const head = ui.h('tr');
      for (const th of ['Trang', '#', 'Mã đơn', 'Lỡ', 'Kết quả']) head.append(ui.h('th', '', th));
      const thead = ui.h('thead');
      thead.append(head);
      const body = ui.h('tbody');
      for (const f of res.findings) {
        const tr = ui.h('tr', resultOf(f));
        tr.title = [f.owners, f.gcnIds ? 'GCN ' + f.gcnIds : '', f.reason].filter(Boolean).join(' · ');
        for (const [text, cls] of [[f.page, 'num'], [f.pos, 'num'], [f.maDon, 'code'], [f.history ? 'Cập nhật lịch sử' : 'Thêm vào DLVH', ''], [RESULT_TEXT[resultOf(f)](f), '']]) {
          tr.append(ui.h('td', cls, String(text ?? '')));
        }
        body.append(tr);
      }
      table.append(thead, body);
      wrap.append(table);
      const csvBtn = ui.button('btn ghost', 'i-download', 'Xuất CSV bảng lỡ duyệt');
      csvBtn.onclick = () => ui.download(`lo-duyet-gcn_${ui.csv.stamp()}.csv`, new Blob([ui.csv.build(CSV_HEAD, csvRows(res))], { type: 'text/csv;charset=utf-8' }));
      const row = ui.h('div', 'row');
      row.append(csvBtn, ui.h('span'));
      el.append(wrap, row);
    }
  }
  const CSV_HEAD = ['Trang', 'Vị trí', 'Mã đơn', 'Lỡ', 'Chủ (khung trái)', 'Mã GCN (khung phải)', 'Lý do không được duyệt', 'Trạng thái trên hệ thống', 'Kết quả'];
  const csvRows = (res) => res.findings.map((f) => [f.page, f.pos, f.maDon, f.why, f.owners, f.gcnIds, f.reason, f.stateLabel || '', RESULT_TEXT[resultOf(f)](f)]);

  ADXTools.register({
    id: 'audit',
    name: 'Quét và sửa lỡ duyệt GCN',
    tab: 'Duyệt đơn',
    readBeforeWrite: false, // như bản cũ: đọc trước trong lúc sửa tuần tự
    config: CONFIG,
    log: 'run', // nhật ký chung với Chạy tự động, như bản cũ
    counts: () => ADXTools.get('run').counts(),
    run,
    summary,
    panel: {
      start: 'Quét và sửa',
      style: 'go',
      icon: 'i-refresh',
      confirm: 'Quét toàn bộ đợt đang mở và SỬA LUÔN các đơn có Giấy chứng nhận đã lỡ duyệt?\n\n'
        + 'Mỗi đơn lỡ duyệt: Bỏ duyệt khung phải → Không xử lý (giống thao tác sửa tay).\n'
        + 'Đơn ở trạng thái lạ (VD đã đồng bộ): không sửa, chỉ ghi vào bảng để kiểm tra tay.\n'
        + 'Sửa lỗi một đơn là dừng ngay.',
      progress(s) {
        const a = s.audit || freshAudit();
        const pct = s.total ? Math.min(100, Math.round((a.scanned * 100) / s.total)) : s.running ? 0 : 100;
        const text = s.running
          ? `${s.stopping ? 'Đang dừng…' : 'Đang quét và sửa'} · ${a.scanned}/${s.total || '?'} đơn · lỡ duyệt ${a.wrong} · đã sửa ${a.fixed}`
          : `Đã quét ${a.scanned}/${s.total} đơn · lỡ duyệt ${a.wrong} · đã sửa ${a.fixed}`;
        return { text, pct };
      },
      counters: () => [], // ô số nằm trong báo cáo đã lưu (như bản cũ)
      manual: (s) => (s.audit || {}).manual || 0, // số đơn cần kiểm tra tay (nhãn "Cần kiểm tra" ở đầu thẻ)
      report: { key: 'last', render, CSV_HEAD, csvRows },
    },
  });
})();
