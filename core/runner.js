/*
 * BỘ MÁY CHẠY dùng chung cho mọi công cụ: gọi thẳng API của trang (cùng cookie, cùng mã xác thực), đọc trước, gửi song song,
 * thử lại, dừng, ghi log, nhận lệnh từ Side Panel. Công cụ (tools/<id>/tool.js) chỉ quyết định đọc gì / gửi gì, qua đối tượng
 * `api` hẹp – không thấy token, listBody, fetch hay chrome.storage.
 *
 * ĐỘ CHÍNH XÁC:
 *   - Mỗi lệnh ghi phải mang expect và được máy chủ trả về đúng trạng thái mong đợi; sai một lệnh là DỪNG HẲN, log ghi
 *     KIỂM TRA TAY kèm đã làm / HỎNG / chưa làm. Không rollback.
 *   - Lỗi mạng / máy chủ quá tải / quá thời gian chờ: tự thử lại. Các lệnh đều đặt đơn về MỘT trạng thái cố định
 *     nên gửi lại không gây sai.
 *   - Mỗi khung chỉ chạy một công cụ tại một thời điểm.
 */
(() => {
  if (window.__adxApiRunLoaded) return;
  window.__adxApiRunLoaded = true;

  const A = ADX_CONFIG.api;
  const M = ADXModel;

  const freshState = () => ({
    tool: '', running: false, stopping: false, t0: 0, msg: '',
    step: '', scope: '', phase: '', pos: 0, total: 0, counts: {},
  });
  let st = freshState();
  let tool = null;      // công cụ đang chạy / vừa chạy
  let runBody = null;   // listBody chụp lúc bắt đầu – mở đợt khác giữa chừng cũng không đổi đợt đang chạy

  const alive = () => {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  };
  const nowStr = () => new Date().toLocaleString('vi-VN');
  // Chi tiết từng đơn chỉ in ra Console (F12) – không ghi vào bộ nhớ để không làm chậm
  const log = (msg) => console.log('[Duyệt đơn]', msg);
  const secs = (ms) => (ms / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  const duration = ADX.duration;

  // Đo tốc độ trong một lần chạy (in ra Console khi xong)
  const freshPerf = () => ({ lists: 0, listMs: 0, listItems: 0, writes: 0, writeMs: 0 });
  let perf = freshPerf();
  function perfLine() {
    const avg = (ms, n) => (n ? secs(ms / n) : '–');
    return `Tốc độ: đọc danh sách ${perf.lists} lần, trung bình ${avg(perf.listMs, perf.lists)} giây/lần`
      + ` (${avg(perf.listMs, perf.listItems)} giây cho mỗi đơn đọc được)`
      + ` · gửi ${perf.writes} lệnh, trung bình ${avg(perf.writeMs, perf.writes)} giây/lệnh`;
  }

  function stateObj() {
    const c = self.ADXApiContext ? self.ADXApiContext.get() : {};
    return {
      frame: location.href,
      version: typeof ADX_VERSION === 'undefined' ? '' : ADX_VERSION,
      hasCtx: !!(c.listBody && c.token),
      dot: c.listBody ? c.listBody.dotBanGiaoNId : '',
      seenAt: c.seenAt || 0,
      ...JSON.parse(JSON.stringify(st)),
    };
  }
  let lastBroadcast = 0;
  function broadcast(force) {
    if (!alive() || (!force && Date.now() - lastBroadcast < 300)) return;
    lastBroadcast = Date.now();
    try { chrome.runtime.sendMessage({ type: 'adx:apiState', state: stateObj() }).catch(() => {}); } catch (e) { /* bỏ qua */ }
  }

  // ---------------------------------------------------------------- DỪNG
  // Bấm Dừng: huỷ NGAY các lần lấy danh sách đang chờ và các lần chờ thử lại (chỉ là đọc – huỷ không sao).
  // Lệnh ghi đang gửi dở thì để gửi xong (vài giây) – huỷ giữa chừng có thể làm đơn dở dang.
  let stopCtl = new AbortController();
  const stoppedErr = () => Object.assign(new Error('Đã dừng'), { stopped: true });
  function requestStop() {
    if (!st.running || st.stopping) return;
    st.stopping = true;
    stopCtl.abort();
    log('Bấm Dừng – huỷ các lần lấy danh sách đang chờ, chờ gửi xong các đơn đang dở');
    broadcast(true);
  }
  // Chờ ms mili giây; canStop: bấm Dừng thì thôi chờ
  const pause = (ms, canStop) => new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (canStop) stopCtl.signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });

  // ---------------------------------------------------------------- gọi API giống hệt trang (cùng cookie, cùng token)
  const transient = (msg) => Object.assign(new Error(msg), { transient: true });

  // canStop = true cho lần lấy danh sách (bấm Dừng thì huỷ ngay); false cho lệnh ghi (để gửi xong)
  async function postOnce(name, body, timeoutMs, canStop) {
    if (canStop && st.stopping) throw stoppedErr();
    const ctx = self.ADXApiContext.get();
    const base = ctx.listUrl ? ctx.listUrl.replace(/[^/]+$/, '') : new URL(A.base, location.origin).href;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const onStop = () => ctrl.abort();
    const stopSignal = stopCtl.signal;
    if (canStop) stopSignal.addEventListener('abort', onStop, { once: true });
    let res;
    let txt;
    try {
      res = await fetch(base + name, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'Content-Type': 'application/json; charset=utf-8',
          'X-Requested-With': 'XMLHttpRequest',
          __RequestVerificationToken: ctx.token,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      txt = await res.text();
    } catch (e) {
      if (canStop && st.stopping) throw stoppedErr();
      throw transient(`${name}: ${e && e.name === 'AbortError' ? `quá ${timeoutMs / 1000} giây không trả lời` : 'lỗi mạng'}`);
    } finally {
      clearTimeout(timer);
      if (canStop) stopSignal.removeEventListener('abort', onStop);
    }
    if (res.status >= 500 || res.status === 429) throw transient(`${name}: máy chủ đang lỗi / quá tải (HTTP ${res.status})`);
    let json = null;
    try { json = JSON.parse(txt); } catch (e) { /* xử lý bên dưới */ }
    if (!json) throw new Error(`${name}: máy chủ không trả JSON (HTTP ${res.status}) – có thể đã hết phiên đăng nhập, hãy F5 trang`);
    if (!res.ok || json.success !== true) {
      throw new Error(`${name}: máy chủ báo lỗi (HTTP ${res.status}) ${json.message || json.Message || json.error || ''}`.trim());
    }
    return json;
  }

  // Lỗi tạm thời thì thử lại (các lệnh đều đặt về một trạng thái cố định nên gửi lại không sai).
  // Lấy danh sách: bấm Dừng thì thôi thử lại. Lệnh ghi: vẫn thử lại cho xong đơn đang dở.
  async function post(name, body, timeoutMs, canStop) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await postOnce(name, body, timeoutMs, canStop);
      } catch (e) {
        if (e.stopped || !e.transient || attempt > A.retries) throw e;
        if (canStop && st.stopping) throw stoppedErr();
        log(`${e.message} – thử lại lần ${attempt}/${A.retries}`);
        await pause(A.retryDelayMs * attempt, canStop);
        if (canStop && st.stopping) throw stoppedErr();
      }
    }
  }

  // Bộ lọc trạng thái của danh sách: '-1' = tất cả, '0' = chưa xử lý, '1' = đã xử lý, '2' = đã đồng bộ ('1', '2' là đoán)
  const FILTER_LABEL = { '-1': 'cả đợt', 0: 'đơn chưa xử lý', 1: 'đơn đã xử lý', 2: 'đơn đã đồng bộ' };
  const withState = (body, trangThai) => ({ ...body, requestQueries: { ...(body.requestQueries || {}), trangThai } });

  async function getList(trangThai, start, length) {
    // Công cụ "đọc hết rồi mới gửi": đã sang bước gửi lệnh thì không được đọc nữa (danh sách đã bị xô lệch)
    if (tool.readBeforeWrite && st.step === 'write') throw new Error('Lỗi chương trình: đọc danh sách sau khi đã bắt đầu gửi lệnh');
    const t = Date.now();
    const page = await post(A.list, { ...withState(runBody, trangThai), start, length }, A.listTimeoutMs, true);
    const ms = Date.now() - t;
    const n = M.itemsOf(page).length;
    perf.lists++;
    perf.listMs += ms;
    perf.listItems += n;
    log(`Đọc danh sách ${FILTER_LABEL[trangThai] || trangThai} từ #${start + 1}: ${n} đơn, ${secs(ms)} giây`);
    return page;
  }

  // Đọc lần lượt cả danh sách (vị trí cố định). Luôn giữ `ahead` lần đọc đang chạy: lần nào xong là đặt ngay
  // lần kế tiếp, không chờ dùng xong trang trước (giữ sẵn tối đa 2 × ahead trang chưa dùng).
  // Trả về từng trang đúng thứ tự, không sót: máy chủ trả ít hơn số xin thì đọc tiếp từ chỗ thiếu.
  async function* readPages(trangThai, size, ahead, firstPage) {
    const lim = Math.max(1, ahead);
    const queue = [];   // các trang đã đặt đọc, đúng thứ tự: đang đọc, hoặc đọc xong mà chưa dùng
    let busy = 0;       // số lần đọc đang chạy
    let total = 0;
    let next = 0;
    let closed = false;
    const fill = () => {
      while (!closed && !st.stopping && busy < lim && queue.length < 2 * lim && next < total) {
        const q = { start: next, live: true };
        q.p = getList(trangThai, next, size);
        busy++;
        // lỗi sẽ được xử lý khi tới lượt trang này
        q.p.catch(() => {}).then(() => {
          if (q.live) { q.live = false; busy--; }
          fill();
        });
        queue.push(q);
        next += size;
      }
    };
    // Bỏ các trang đã đặt đọc trước (lệch vị trí / không dùng nữa)
    const drop = () => queue.splice(0).forEach((q) => { if (q.live) { q.live = false; busy--; } });
    try {
      const first = firstPage || await getList(trangThai, 0, size);
      total = M.totalOf(first);
      const firstItems = M.itemsOf(first);
      if (firstItems.length && firstItems.length < size && firstItems.length < total) size = firstItems.length;
      let start = firstItems.length;
      next = start;
      if (start) fill(); // đọc trước ngay, trong lúc trang đầu đang được dùng
      yield { start: 0, items: firstItems, total };
      while (start && start < total && !st.stopping) {
        fill();
        const q = queue.shift();
        if (!q) break; // chỉ xảy ra khi bấm Dừng
        fill(); // trang vừa lấy ra nhường chỗ cho lần đọc kế tiếp
        const items = M.itemsOf(await q.p);
        yield { start: q.start, items, total };
        if (!items.length) break;
        start = q.start + items.length;
        if (items.length < size && start < total) {
          // Trang trả thiếu: các trang đã đặt đọc trước bị lệch vị trí → bỏ, đọc tiếp từ chỗ thiếu
          drop();
          next = start;
        }
      }
    } finally {
      closed = true;
      drop();
    }
  }

  // Từng đơn của danh sách, đúng thứ tự, kèm vị trí (1, 2, …)
  async function* readItems(trangThai, size, ahead, firstPage) {
    for await (const pg of readPages(trangThai, size, ahead, firstPage)) {
      for (let k = 0; k < pg.items.length; k++) yield { v: pg.items[k], pos: pg.start + k + 1, total: pg.total };
    }
  }

  // Làm fn cho từng phần tử của `items` (mảng, hoặc danh sách đọc dần), tối đa `limit` phần tử cùng lúc.
  // Một phần tử lỗi (hoặc bấm Dừng) → không nhận thêm việc, chờ các việc đang dở xong rồi mới báo.
  async function pool(items, limit, fn) {
    const it = Array.isArray(items) ? items.values() : items;
    let err = null;
    let wake;
    const failed = new Promise((r) => { wake = r; }).then(() => ({ done: true }));
    const fail = (e) => { err = err || e; wake(); };
    const worker = async () => {
      while (!err && !st.stopping) {
        let r;
        // Có lỗi thì thôi chờ đơn kế tiếp (có thể đang chờ đọc danh sách khá lâu)
        try { r = await Promise.race([it.next(), failed]); } catch (e) { fail(e); break; }
        if (r.done || err || st.stopping) break;
        try { await fn(r.value); } catch (e) { fail(e); }
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.max(1, limit) }, worker));
    } finally {
      // Đóng danh sách đọc dần: bỏ các trang đã đặt đọc trước
      if (it.return) Promise.resolve().then(() => it.return()).catch(() => {});
    }
    if (err) throw err;
  }

  // ---------------------------------------------------------------- log (Thống kê / xuất CSV) – ghi theo lô
  const logQueue = new Map();
  let logTimer = null;
  let logChain = Promise.resolve();
  let logNs = '';

  // fields: result, note, action, actionTime… do công cụ / execute đưa vào
  // Log của lần chạy đang làm (job): giữ trong RAM, lưu một lần khi xong vào "<id công cụ>:job" để tải về
  let jobLog = new Map();

  // jobOnly: chỉ ghi vào log lần chạy (VD đơn đã đúng – không ghi đè kết quả cũ trong thống kê)
  function writeLog(d, stt, fields, jobOnly = false) {
    // Công cụ có logByGoi (dvhc): đơn thiếu mã đơn vẫn có trong log, khoá bằng mã gói tin. Công cụ khác giữ như bản cũ.
    const key = d.maDon || (tool.logByGoi && d.goi ? `(gói tin ${d.goi})` : '');
    if (!key) return;
    const e = {
      stt,
      owners: d.owners.join('; '),
      ownersRight: d.ownersRight.join('; '),
      soTo: d.soTo || '',
      soThua: d.soThua || '',
      soPhatHanh: ADX.uniq(d.gcn.map((g) => g.soPhatHanh)).join(' | '),
      soVaoSo: ADX.uniq(d.gcn.map((g) => g.soVaoSo)).join(' | '),
      ...fields,
    };
    jobLog.set(key, { maDon: key, time: nowStr(), ...(jobLog.get(key) || {}), ...e });
    if (jobOnly) return;
    logQueue.set(key, { ...(logQueue.get(key) || {}), ...e });
    if (!logTimer) logTimer = setTimeout(flushLog, 1500);
  }

  function flushLog() {
    clearTimeout(logTimer);
    logTimer = null;
    if (!logQueue.size || !alive()) return logChain;
    const batch = [...logQueue.entries()];
    const ns = logNs;
    logQueue.clear();
    logChain = logChain
      .then(() => ADXLog.write(ns, batch))
      .catch((e) => console.warn('[Duyệt đơn] log', e));
    return logChain;
  }

  // ---------------------------------------------------------------- gửi lệnh cho MỘT đơn
  // Gửi lần lượt plan.reqs, lệnh nào cũng phải được máy chủ xác nhận đúng trạng thái (canStop = false: Dừng thì vẫn gửi xong).
  // Hỏng giữa chừng → log KIỂM TRA TAY (quyết định ban đầu chuyển sang ghi chú, kèm đã làm / HỎNG / chưa làm), rồi ném lỗi
  // để dừng cả lần chạy. Không rollback.
  //   result / note: ghi vào log khi gửi xong hết; decision: quyết định ban đầu, chỉ dùng khi hỏng
  async function execute({ d, plan, stt, result, note = '', decision = result + (note ? ` (${note})` : '') }) {
    if (tool.readBeforeWrite && st.step !== 'write') throw new Error('Lỗi chương trình: gửi lệnh khi chưa đọc xong danh sách');
    const noExpect = plan.reqs.find((r) => !r.expect);
    if (noExpect) throw new Error(`Lỗi chương trình: lệnh "${noExpect.label}" không có expect – không gửi đơn ${d.maDon || d.goi}`);
    const done = [];
    for (const r of plan.reqs) {
      let bad = '';
      const t = Date.now();
      try {
        bad = M.checkResponse(await post(r.name, r.body, A.writeTimeoutMs, false), r.expect);
      } catch (e) {
        bad = (e && e.message) || String(e);
      }
      perf.writes++;
      perf.writeMs += Date.now() - t;
      if (bad) {
        const rest = plan.reqs.slice(done.length + 1).map((x) => x.label);
        const where = (done.length ? `đã làm: ${done.join(' → ')}; ` : '') + `HỎNG: ${r.label}` + (rest.length ? `; chưa làm: ${rest.join(' → ')}` : '');
        writeLog(d, stt, {
          result: ADXTools.logOf(tool).results.unknown.text,
          note: `Quyết định ban đầu: ${decision} · ${where}`,
          action: `LỖI – ${where} (${bad})`,
          actionTime: nowStr(),
        });
        throw new Error(`Đơn ${d.maDon || `(gói tin ${d.goi})`}: ${where} – ${bad}. Đã dừng, kiểm tra tay đơn này.`);
      }
      done.push(r.label);
      if (A.delayMs) await ADX.sleep(A.delayMs);
    }
    writeLog(d, stt, { result, note, action: plan.label, actionTime: nowStr() });
  }

  // ---------------------------------------------------------------- điều khiển
  async function session(t) {
    tool = t;
    st = { ...freshState(), tool: t.id, running: true, t0: Date.now(), counts: t.counts() };
    logNs = ADXTools.logNs(t);
    runBody = self.ADXApiContext.get().listBody;
    perf = freshPerf();
    jobLog = new Map();
    stopCtl = new AbortController();
    const api = {
      state: st,
      config: A,
      toolConfig: t.config || {},
      // Số lần đọc / số đơn gửi song song: công cụ "đọc hết rồi mới gửi" dùng được tới 6 cho mỗi bước (hai bước không chồng nhau)
      limits: t.readBeforeWrite ? { read: A.phasedReadAhead, write: A.phasedWriteConcurrency } : { read: A.readAhead, write: A.writeConcurrency },
      dot: runBody.dotBanGiaoNId,
      getList, readPages, readItems, pool, execute, writeLog,
      save: (key, value) => ADXLog.save(t.id, key, value),
      broadcast, log, now: nowStr,
    };
    broadcast(true);
    try {
      st.msg = await t.run(api);
    } catch (e) {
      st.msg = e && e.stopped ? t.summary(st) : 'Lỗi: ' + ((e && e.message) || e);
    } finally {
      await flushLog();
      // Log của lần chạy này (ghi đè lần trước của cùng công cụ) – Side Panel cho tải về sau khi xong
      if (alive()) {
        await ADXLog.save(t.id, 'job', {
          tool: t.id, name: t.name, dot: runBody.dotBanGiaoNId, start: new Date(st.t0).toLocaleString('vi-VN'),
          end: nowStr(), endedAt: Date.now(), msg: st.msg, entries: [...jobLog.values()],
        }).catch((e) => console.warn('[Duyệt đơn] log lần chạy', e));
      }
      log(`${st.msg} (${duration(Date.now() - st.t0)})`);
      log(perfLine());
      st.running = false;
      st.stopping = false;
      st.phase = '';
      broadcast(true);
    }
  }

  function start(id) {
    if (st.running) return 'Đang chạy rồi';
    const t = ADXTools.get(id);
    if (!t) return `Không có công cụ "${id}"`;
    // Chrome chỉ mở tối đa 6 kết nối HTTP/1.1 tới một máy
    if (A.readAhead + A.writeConcurrency > 6) return 'Cấu hình sai: readAhead + writeConcurrency phải ≤ 6 (config.js)';
    if (A.phasedReadAhead > 6 || A.phasedWriteConcurrency > 6) return 'Cấu hình sai: phasedReadAhead, phasedWriteConcurrency mỗi số phải ≤ 6 (config.js)';
    const ctx = self.ADXApiContext && self.ADXApiContext.get();
    if (!ctx || !ctx.listBody) return 'Chưa thấy danh sách đơn – hãy F5 trang rồi mở hộp thoại "Xử lý đơn đăng ký" trước';
    if (!ctx.token) return 'Chưa lấy được mã xác thực (__RequestVerificationToken) – hãy F5 trang rồi mở hộp thoại';
    session(t);
    return '';
  }

  chrome.runtime.onMessage.addListener((msg, _sender, send) => {
    const cmd = msg && msg.cmd;
    if (cmd === 'apiStatus') return void send(stateObj());
    if (cmd === 'apiStart') {
      const err = start(msg.tool);
      return void send({ ...stateObj(), error: err });
    }
    if (cmd === 'apiStop') {
      requestStop();
      return void send(stateObj());
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && st.running) requestStop();
  }, true);
})();
