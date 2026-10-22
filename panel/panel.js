/*
 * Side Panel – khung chung cho mọi công cụ. Danh sách công cụ lấy từ manifest.json (file tools/* trong content_scripts):
 * thêm công cụ thì tab / thẻ tự xuất hiện, không sửa HTML. Không có mục cài đặt.
 * Phần quyết định hiển thị (thuần) ở view.js; file này chỉ dựng DOM và nối sự kiện.
 */
const $ = (id) => document.getElementById(id);
const fmt = (n) => (n || 0).toLocaleString('vi-VN');
const SVG = 'http://www.w3.org/2000/svg';
const FILL_ICONS = ['i-play', 'i-stop']; // icon tô đặc; còn lại là icon nét

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function button(cls, icon, label) {
  const b = h('button', cls);
  b.type = 'button';
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', FILL_ICONS.includes(icon) ? 'ic fill' : 'ic');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG, 'use');
  use.setAttribute('href', '#' + icon);
  svg.appendChild(use);
  b.append(svg, h('span', '', label));
  return b;
}
const setLabel = (b, text) => { b.lastChild.textContent = text; };

async function activeTab() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t;
}

// Gửi tới mọi khung (iframe) của tab, trả về danh sách phản hồi
async function sendAll(msg) {
  const tab = await activeTab();
  if (!tab) return [];
  let frames = [{ frameId: 0 }];
  try {
    frames = (await chrome.webNavigation.getAllFrames({ tabId: tab.id })) || frames;
  } catch (e) { /* dùng khung chính */ }
  const res = await Promise.all(frames.map((f) => chrome.tabs.sendMessage(tab.id, msg, { frameId: f.frameId })
    .then((r) => (r && typeof r === 'object' ? { ...r, frameId: f.frameId } : r))
    .catch(() => null)));
  return res.filter(Boolean);
}

// Gửi tới đúng một khung (iframe)
async function sendFrame(frameId, msg) {
  const tab = await activeTab();
  if (!tab) return null;
  return chrome.tabs.sendMessage(tab.id, msg, { frameId }).catch(() => null);
}

function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Ô số: [{ label, value, cls }]
function renderBoxes(el, items) {
  el.textContent = '';
  el.hidden = !items.length;
  for (const it of items) {
    const div = h('div', 'stat ' + (it.cls || ''));
    div.append(h('b', '', String(it.value ?? 0)), h('span', '', it.label));
    el.appendChild(div);
  }
}

// ---------------------------------------------------------------- phát hiện code cũ còn chạy
// Side Panel luôn mở bản mới nhất trên ổ đĩa; còn extension (⟳) và trang (F5) thì phải tải lại mới chạy bản mới.
function oldCode(s) {
  if (chrome.runtime.getManifest().version !== ADX_VERSION) {
    return '⚠ Extension chưa được tải lại nên vẫn chạy bản cũ: vào chrome://extensions bấm ⟳ ở extension, rồi F5 trang MPLIS.';
  }
  if (s && s.version !== ADX_VERSION) {
    return '⚠ Trang đang chạy bản cũ của extension: bấm F5 trang MPLIS rồi mở lại hộp thoại "Xử lý đơn đăng ký".';
  }
  return '';
}

// Khung đang chạy; nếu không thì khung vừa tải danh sách đơn GẦN NHẤT (mở đợt mới thì chạy đúng đợt mới,
// không lấy nhầm khung cũ còn giữ đợt đã chạy xong)
const pickApi = (res) => res.find((r) => r.running)
  || res.filter((r) => r.hasCtx).sort((a, b) => (b.seenAt || 0) - (a.seenAt || 0))[0]
  || res.find((r) => 'hasCtx' in r) || null;

// ---------------------------------------------------------------- dựng tab và thẻ
let tabs = [];              // [{ label, tools, ns, tab, panel, dot, sr }]
let sel = 0;                // tab đang chọn
let last = null;            // trạng thái gần nhất của khung được chọn
let firstStatus = true;     // lần đầu có trạng thái: chọn tab của công cụ đang chạy (nếu có)
const cards = new Map();    // id công cụ → phần tử của thẻ
const statCards = new Map(); // ns nhật ký → phần tử của thẻ thống kê
const errors = new Map();   // id công cụ → lỗi lần bấm chạy gần nhất
const wasRunning = new Map();

function toolCard(t) {
  const c = { card: h('section', 'card') };
  const head = h('div', 'card-head');
  head.append(h('h2', '', t.name), c.badge = h('span', 'badge'), c.dot = h('span', 'muted'));
  c.badge.hidden = true;
  c.card.append(head);
  const row = h('div', 'row');
  c.start = button('btn ' + (t.panel.style || 'go'), t.panel.icon || 'i-play', t.panel.start);
  c.stop = button('btn danger', 'i-stop', 'Dừng');
  c.stop.disabled = true;
  c.start.onclick = () => start(t);
  c.stop.onclick = stopNow;
  row.append(c.start, c.stop);
  c.state = h('div', 'api-state');
  c.report = h('div', 'run-report');
  c.report.hidden = true;
  const line = h('div', 'run-line');
  line.append(c.line = h('span'), c.pct = h('b'));
  const progress = h('div', 'progress');
  progress.append(c.bar = h('i'));
  c.counters = h('div', 'stats run');
  c.note = h('div', 'muted small');
  c.report.append(line, progress, c.counters, c.note);
  c.extra = h('div'); // báo cáo riêng của công cụ (VD bảng lỡ duyệt)
  // Log của lần chạy gần nhất (lưu ở "<id>:job" khi chạy xong) – tải về CSV
  c.job = h('div', 'job-row');
  c.job.hidden = true;
  c.jobInfo = h('span', 'muted');
  c.jobBtn = button('btn ghost', 'i-download', 'Tải log lần chạy');
  c.jobBtn.onclick = () => downloadJob(t);
  c.job.append(c.jobInfo, c.jobBtn);
  c.card.append(row, c.state, c.report, c.job, c.extra);
  return c;
}

function statsCard(ns) {
  const log = ADXTools.get(ns).log;
  const c = { card: h('section', 'card') };
  const head = h('div', 'card-head');
  head.append(h('h2', '', log.title), c.total = h('span', 'muted', '0 đơn'));
  c.bar = h('div', 'bar');
  c.boxes = h('div', 'stats');
  const row = h('div', 'row');
  const csv = button('btn ghost', 'i-download', 'Xuất CSV');
  const clear = button('btn ghost subtle', 'i-trash', 'Xóa log');
  csv.onclick = () => exportCsv(ns);
  clear.onclick = () => clearLog(ns);
  row.append(csv, clear);
  c.card.append(head, c.bar, c.boxes, row);
  return c;
}

function buildUi() {
  tabs = ADXView.groupTabs(ADXTools.list(), ADXTools.logNs);
  const nav = $('tabs');
  nav.style.gridTemplateColumns = `repeat(${tabs.length}, minmax(0, 1fr))`;
  tabs.forEach((g, i) => {
    g.tab = h('button', 'tab');
    g.tab.type = 'button';
    g.tab.id = `tab-${i}`;
    g.tab.setAttribute('role', 'tab');
    g.tab.setAttribute('aria-controls', `panel-${i}`);
    g.dot = h('span', 'tab-dot');
    g.dot.setAttribute('aria-hidden', 'true');
    g.sr = h('span', 'sr-only');
    g.tab.append(h('span', 'tab-label', g.label), g.sr, g.dot);
    g.tab.onclick = () => selectTab(i);
    g.tab.onkeydown = (e) => {
      const j = ADXView.nextTab(i, e.key, tabs.length);
      if (j == null) return;
      e.preventDefault();
      selectTab(j);
      tabs[j].tab.focus();
    };
    g.panel = h('div', 'tab-panel');
    g.panel.id = `panel-${i}`;
    g.panel.setAttribute('role', 'tabpanel');
    g.panel.setAttribute('aria-labelledby', g.tab.id);
    for (const t of g.tools) {
      const c = toolCard(t);
      cards.set(t.id, c);
      g.panel.append(c.card);
    }
    for (const ns of g.ns) {
      const c = statsCard(ns);
      statCards.set(ns, c);
      g.panel.append(c.card);
    }
    nav.append(g.tab);
    $('panels').append(g.panel);
  });
  selectTab(0); // mặc định: tab đầu tiên trong manifest (Duyệt đơn)
}

function selectTab(i) {
  sel = i;
  tabs.forEach((g, j) => {
    const on = j === i;
    g.tab.setAttribute('aria-selected', String(on));
    g.tab.tabIndex = on ? 0 : -1;
    g.panel.hidden = !on;
  });
}

// ---------------------------------------------------------------- trạng thái chạy (core/runner.js)
function renderApi(s) {
  last = s;
  const running = !!(s && s.running);
  if (s && firstStatus) {
    firstStatus = false;
    const i = running ? tabs.findIndex((g) => g.tools.some((t) => t.id === s.tool)) : -1;
    if (i >= 0) selectTab(i);
  }
  const runner = running ? ADXTools.get(s.tool) : null;
  // Tab của công cụ đang chạy có chấm báo hiệu; vẫn cho chuyển tab để xem
  for (const g of tabs) {
    const on = running && g.tools.some((t) => t.id === s.tool);
    g.tab.classList.toggle('running', on);
    g.sr.textContent = on ? ' (đang chạy)' : '';
  }
  // Code cũ còn chạy (chưa ⟳ extension / chưa F5 trang) thì không cho chạy – kết quả sẽ theo luật cũ
  const old = oldCode(s);
  for (const t of ADXTools.list()) {
    const c = cards.get(t.id);
    const v = ADXView.cardView(t, s, old, errors.get(t.id) || '', runner ? runner.name : (s && s.tool) || '');
    c.start.disabled = v.startDisabled;
    c.stop.disabled = v.stopDisabled;
    setLabel(c.stop, v.stopText);
    c.dot.textContent = v.dot;
    c.badge.hidden = !v.badge;
    if (v.badge) {
      c.badge.className = 'badge ' + v.badge.cls;
      c.badge.textContent = v.badge.text;
    }
    c.state.className = v.stateCls;
    if (v.error) renderError(c.state, v.error);
    else c.state.textContent = v.state;
    c.report.hidden = !v.report;
    if (v.report) {
      c.line.textContent = v.report.text;
      c.pct.textContent = v.report.pct + '%';
      c.bar.style.width = v.report.pct + '%';
      c.bar.className = v.report.live ? 'live' : '';
      renderBoxes(c.counters, v.report.counters);
      c.note.textContent = v.report.note;
    }
    // Báo cáo riêng: vừa chạy xong thì vẽ lại từ kết quả đã lưu (lúc chạy chỉ vẽ khi kết quả lưu thay đổi)
    const isRunning = running && s.tool === t.id;
    if (t.panel.report && wasRunning.get(t.id) && !isRunning) loadReport(t);
    wasRunning.set(t.id, isRunning);
    c.job.hidden = isRunning || !jobs.get(t.id); // đang chạy thì chưa có log của lần này
  }
}

// Lỗi lệnh ghi đã tách (view.js splitError): mã đơn · đã làm / HỎNG / chưa làm · lý do · việc cần làm
function renderError(el, e) {
  el.textContent = '';
  const body = h('div', 'state-body');
  const title = h('div', 'state-title', 'Lỗi · Đơn ');
  title.append(h('code', '', e.maDon));
  const steps = h('dl', 'state-steps');
  for (const [k, val] of e.steps) steps.append(h('dt', '', k), h('dd', '', val));
  steps.append(h('dt', '', 'Lý do'), h('dd', '', e.reason));
  body.append(title, steps, h('div', 'state-hint', e.hint));
  el.append(body);
}

function setStopButtons(text) {
  for (const c of cards.values()) {
    c.stop.disabled = true;
    setLabel(c.stop, text);
  }
}

async function refreshApi() {
  renderApi(pickApi(await sendAll({ cmd: 'apiStatus' })));
}

async function start(t) {
  const s = pickApi(await sendAll({ cmd: 'apiStatus' }));
  // pickApi ưu tiên khung đang chạy: có khung nào đang chạy thì không cho chạy thêm
  if (!s || !s.hasCtx || s.running) return renderApi(s);
  if (!confirm(t.panel.confirm)) return;
  const r = await sendFrame(s.frameId, { cmd: 'apiStart', tool: t.id });
  errors.set(t.id, (r && r.error) || '');
  renderApi(r);
}

// Bấm Dừng (ở thẻ nào cũng được): đổi nút ngay để biết đã nhận lệnh, rồi báo cho mọi khung
async function stopNow() {
  setStopButtons('Đang dừng…');
  renderApi(pickApi(await sendAll({ cmd: 'apiStop' })));
}

// ---------------------------------------------------------------- thống kê, log, báo cáo riêng
// Chỉ đọc mục tổng (vài con số) – không đọc cả log
function renderStats(ns, s) {
  const c = statCards.get(ns);
  const results = ADXTools.get(ns).log.results;
  const keys = Object.keys(results);
  const total = (s && s.total) || 0;
  c.total.textContent = `${fmt(total)} đơn`;
  renderBoxes(c.boxes, keys.map((k) => ({ label: results[k].label, value: fmt(s && s[k]), cls: results[k].cls })));
  c.bar.textContent = '';
  for (const k of keys) {
    const i = h('i', results[k].cls);
    i.style.width = (total ? ((s[k] || 0) * 100) / total : 0) + '%';
    c.bar.appendChild(i);
  }
}

async function refreshStats(ns) {
  renderStats(ns, await ADXLog.stats(ns));
}

const reportUi = (t) => ({ running: wasRunning.get(t.id) || false, h, button, boxes: renderBoxes, csv: ADXCsv, download });
function drawReport(t, data) {
  t.panel.report.render(cards.get(t.id).extra, data, reportUi(t));
}
async function loadReport(t) {
  drawReport(t, await ADXLog.load(t.id, t.panel.report.key));
}

// ---------------------------------------------------------------- log từng lần chạy
const jobs = new Map(); // id công cụ → log lần chạy gần nhất
function showJob(t, job) {
  const c = cards.get(t.id);
  jobs.set(t.id, job || null);
  if (job) c.jobInfo.textContent = `Lần chạy ${job.end} · ${job.entries.length} đơn`;
  c.job.hidden = !job || wasRunning.get(t.id) === true;
}
async function loadJob(t) {
  showJob(t, await ADXLog.load(t.id, 'job'));
}
function downloadJob(t) {
  const job = jobs.get(t.id);
  if (!job) return;
  const name = `lan-chay_${t.id}_${ADXCsv.stamp(new Date(job.endedAt))}.csv`;
  download(name, new Blob([ADXCsv.build(ADXCsv.LOG_HEAD, ADXCsv.logRows(job.entries))], { type: 'text/csv;charset=utf-8' }));
}

async function exportCsv(ns) {
  const log = await ADXLog.all(ns);
  if (!log.length) return alert('Chưa có dữ liệu log.');
  download(`${ADXTools.get(ns).log.file}_${ADXCsv.stamp()}.csv`, new Blob([ADXCsv.build(ADXCsv.LOG_HEAD, ADXCsv.logRows(log))], { type: 'text/csv;charset=utf-8' }));
}
async function clearLog(ns) {
  if (!confirm(`Xóa toàn bộ log "${ADXTools.get(ns).log.title}"? Nên xuất CSV trước.`)) return;
  await ADXLog.clear(ns);
  refreshStats(ns);
}

// ---------------------------------------------------------------- khởi động
// Nạp đúng các file tools/* mà manifest.json khai báo cho trang, theo đúng thứ tự
async function loadTools() {
  const files = chrome.runtime.getManifest().content_scripts.flatMap((c) => c.js).filter((f) => f.startsWith('tools/'));
  for (const f of files) {
    await new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = '../' + f;
      s.onload = ok;
      s.onerror = () => fail(new Error('Không nạp được ' + f));
      document.body.appendChild(s);
    });
  }
}

const ready = (async () => {
  try {
    await loadTools();
  } catch (e) {
    $('panels').append(h('div', 'api-state err', e.message));
    return;
  }
  buildUi();
  for (const ns of statCards.keys()) refreshStats(ns);
  for (const t of ADXTools.list()) {
    if (t.panel.report) loadReport(t);
    loadJob(t);
  }

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    for (const ns of statCards.keys()) {
      const k = ADXLog.statsKey(ns);
      if (ch[k]) renderStats(ns, ch[k].newValue);
    }
    for (const t of ADXTools.list()) {
      const r = t.panel.report && ch[ADXLog.dataKey(t.id, t.panel.report.key)];
      if (r) drawReport(t, r.newValue);
      const j = ch[ADXLog.dataKey(t.id, 'job')];
      if (j) showJob(t, j.newValue);
    }
  });
  // Trang gửi tiến độ ngay khi có thay đổi (không phải chờ lần hỏi định kỳ) – chỉ nhận từ tab đang xem
  chrome.runtime.onMessage.addListener(async (msg, sender) => {
    if (!msg || msg.type !== 'adx:apiState' || !sender.tab) return;
    const tab = await activeTab();
    if (tab && sender.tab.id === tab.id) renderApi(msg.state);
  });
  // Đổi tab trình duyệt / tải lại trang → cập nhật ngay
  chrome.tabs.onActivated.addListener(() => refreshApi());
  chrome.tabs.onUpdated.addListener((_id, info) => { if (info.status === 'complete') refreshApi(); });

  await refreshApi();
  setInterval(refreshApi, 1500);
})();
