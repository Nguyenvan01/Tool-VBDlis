// Công cụ Chạy tự động (run): luật duyệt = bản Duyệt 2.1.3; cả lần chạy trên máy chủ giả = bản cũ; tiến độ Side Panel = bản cũ.
// Kết quả bản cũ: tính từ legacy/ (còn) hoặc đọc test/golden/run.json (đã chốt).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts, readJson, read, plain, NEW_CORE, legacyRules, LEGACY_DUYET } from './lib/vm.mjs';
import { makeDot, makeServer, runOnce, isWrite, NEW_FILES, NEW_RUNNER, legacyFiles, TOKEN } from './lib/fake-mplis.mjs';
import { legacy } from './lib/golden.mjs';

const loadNew = () => loadScripts([...NEW_CORE, 'tools/run/rules.js']);
const loadOld = () => loadScripts(legacyRules(LEGACY_DUYET)); // chỉ gọi khi còn legacy/
// So với bản Duyệt 2.1.3: tắt luật mới historyByLand (bản cũ Cập nhật lịch sử mọi bản ghi) – luật mới kiểm ở run-to-thua.test.mjs
const OLD_RULE = 'ADXRules.run.RULES.historyByLand = false;';
const RR = loadNew().get('ADXRules.run');
RR.RULES.historyByLand = false;
const DUYET = readJson('test/fixtures/duyet.json');
const CASES = [...DUYET, ...readJson('test/fixtures/don.json')];

// ---------------------------------------------------------------- luật thuần
test('fixture phủ đủ: 3 quyết định, mọi nhánh lý do của decide, mọi loại việc của planFor', () => {
  const ds = CASES.map((c) => RR.decide(c.v));
  assert.deepEqual(new Set(ds.map((d) => d.status)), new Set(['approve', 'reject', 'unknown']));
  const branch = (r) => r.replace(/[:(–].*$/, '').trim();
  const reasons = new Set(ds.map((d) => branch(d.reasons[0])));
  for (const r of ['Khung phải đã có Giấy chứng nhận', 'Khung trái có thông tin Giấy chứng nhận', 'Không có mã gói tin', 'Không có mã đơn',
    'Khung trái không có thông tin chủ và đất', 'Khung trái', 'Khung trái không thấy trường số tờ / số thửa', 'Khung phải không khớp mã tình hình đăng ký',
    'Đơn đã bị "Bỏ duyệt" trước đó', 'Khung phải trống', 'Khung phải không có Giấy chứng nhận']) assert.ok(reasons.has(r), r);
  const kinds = (fixApproved) => new Set(CASES.map((c) => RR.planFor(c.v, RR.decide(c.v), { fixApproved }).kind));
  assert.deepEqual(kinds(false), new Set(['approve', 'reject', 'skip', 'unknown']));
  assert.ok(kinds(true).has('fix'));
});

for (const { name, v } of CASES) {
  test(`decide, gcnSignals, planFor (thường / fixApproved) = bản Duyệt – ${name}`, () => {
    const o = legacy('run', `rules: ${name}`, () => {
      const D = loadOld().get('ADXApiRules');
      const d = D.decide(v);
      return { decide: d, gcnSignals: D.gcnSignals(v), plan: D.planFor(v, d, { fixApproved: false }), fix: D.planFor(v, d, { fixApproved: true }) };
    });
    const d = RR.decide(v);
    assert.deepEqual(plain(d), o.decide);
    assert.deepEqual(plain(RR.gcnSignals(v)), o.gcnSignals);
    assert.deepEqual(plain(RR.planFor(v, d, { fixApproved: false })), o.plan);
    assert.deepEqual(plain(RR.planFor(v, d, { fixApproved: true })), o.fix);
  });
}

test('tắt cờ rejectIfLeftEmpty / keepUndone: vẫn = bản cũ tắt cùng cờ', () => {
  for (const flag of ['rejectIfLeftEmpty', 'keepUndone']) {
    const o = legacy('run', `rules tắt cờ ${flag}`, () => {
      const old = loadOld();
      old.get('ADX_CONFIG.rules')[flag] = false;
      return CASES.map(({ v }) => old.get('ADXApiRules').decide(v));
    });
    const n = loadNew();
    n.get('ADXRules.run.RULES')[flag] = false;
    n.get('ADXRules.run.RULES').historyByLand = false;
    let changed = 0;
    CASES.forEach(({ v }, i) => {
      const got = plain(n.get('ADXRules.run').decide(v));
      assert.deepEqual(got, o[i]);
      if (got.status !== RR.decide(v).status) changed++;
    });
    assert.ok(changed > 0, `${flag}: fixture phải có đơn đổi quyết định`);
  }
});

// ---------------------------------------------------------------- cả lần chạy trên máy chủ giả
const NEW = [...NEW_FILES, 'tools/run/rules.js', 'tools/run/tool.js', NEW_RUNNER];
const runNew = (server, patch = '') => runOnce({ files: NEW, server, ctxType: 'vbdlis3:ctx', start: { cmd: 'apiStart', tool: 'run' }, patch: OLD_RULE + patch });
const runOld = (server, patch) => runOnce({ files: legacyFiles(LEGACY_DUYET), server, ctxType: 'adx:ctx', start: { cmd: 'apiStart', mode: 'run' }, patch });
const writes = (calls) => calls.filter(isWrite).map((c) => JSON.stringify([c.name, c.body])).sort();
const noTime = (s) => s.replace(/trong \d+ (phút \d+ )?giây/, 'trong … giây');
const logs = (storage, prefix) => Object.fromEntries(Object.entries(storage)
  .filter(([k]) => k.startsWith(prefix))
  // soTo / soThua: cột mới của bản 3 (bản cũ không có) – kiểm riêng
  .map(([k, { soTo, soThua, ...e }]) => [k.slice(prefix.length), { ...e, time: '', actionTime: '', seq: 0 }]));
const STATE_KEYS = ['counts', 'pos', 'total', 'done', 'before', 'scope', 'phase', 'running', 'stopping'];
const pick = (s) => plain(Object.fromEntries(STATE_KEYS.map((k) => [k, s[k]])));
const BUCKET = { 'ĐƯỢC DUYỆT': 'approve', 'KHÔNG DUYỆT': 'reject', 'KIỂM TRA TAY': 'unknown' };
// Kết quả một lần chạy, đã bỏ phần phụ thuộc đồng hồ – dạng dùng để so và để chốt
const norm = (r, prefix, statsKey) => ({
  error: r.started.error, writes: writes(r.calls), items: plain(r.items), state: pick(r.final), msg: noTime(r.final.msg),
  logs: logs(r.storage, prefix), stats: plain(r.storage[statsKey]) ?? null,
});

const DOT_MANY = () => makeDot(2, 'test/fixtures/duyet.json'); // phần lớn chưa xử lý → đọc cả đợt
const DOT_FEW = () => [...makeDot(), ...DUYET.filter((c) => ['D01', 'D02', 'D03'].includes(c.v.goiTinDongBoNId)).map((c) => plain(c.v))]; // → chỉ đọc đơn chưa xử lý

// key: tên kịch bản trong test/golden/run.json; mkServer(): máy chủ giả mới (cùng đợt, cùng kiểu) cho mỗi lần chạy;
// patch: lệnh JS chạy sau khi nạp (VD đổi runPageSize) – áp cho cả bản cũ lẫn bản mới
async function same(key, mkServer, check, patch = '') {
  const o = await legacy('run', key, async () => norm(await runOld(mkServer(), patch), 'adxLog:', 'adxLogStats'));
  const n = await runNew(mkServer(), patch);
  const nn = norm(n, 'run:log:', 'run:stats');
  assert.equal(nn.error, o.error);
  assert.deepEqual(nn.writes, o.writes, 'tập lệnh ghi');
  assert.deepEqual(nn.items, o.items, 'dữ liệu trên máy chủ sau khi chạy');
  assert.deepEqual(nn.state, o.state, 'trạng thái cuối');
  assert.equal(nn.msg, o.msg);
  const [lo, ln] = [o.logs, nn.logs];
  assert.deepEqual(Object.keys(ln).sort(), Object.keys(lo).sort(), 'nhật ký: cùng các mã đơn');
  const stats = o.stats && { ...o.stats };
  for (const k of Object.keys(lo)) {
    if (lo[k].action.startsWith('LỖI')) {
      // H1: lệnh hỏng → KIỂM TRA TAY; quyết định ban đầu (kèm lý do) chuyển sang ghi chú
      const head = `Quyết định ban đầu: ${lo[k].result}${lo[k].note ? ` (${lo[k].note})` : ''} · `;
      assert.ok(ln[k].note.startsWith(head), ln[k].note);
      const where = ln[k].note.slice(head.length); // đã làm / HỎNG / chưa làm
      assert.ok(where.includes('HỎNG') && lo[k].action.startsWith(`LỖI – ${where} (`), lo[k].action);
      assert.deepEqual({ ...ln[k], note: '', result: '' }, { ...lo[k], note: '', result: '' });
      assert.equal(ln[k].result, 'KIỂM TRA TAY');
      stats[BUCKET[lo[k].result]]--;
      stats.unknown++;
    } else {
      assert.deepEqual(ln[k], lo[k], `nhật ký ${k}`);
    }
  }
  assert.deepEqual(nn.stats, stats, 'thống kê');
  if (check) check(n);
  return n;
}
const srv = (dot, opts = {}) => () => makeServer(dot, typeof opts === 'function' ? opts() : opts);

test('= bản cũ: đợt mới (phần lớn chưa xử lý) → đọc cả đợt, vừa đọc vừa gửi, rồi xử lý nốt', async () => {
  const n = await same('đợt mới', srv(DOT_MANY(), { reorder: false }), (r) => assert.equal(r.final.scope, 'all'));
  assert.ok(n.final.counts.approve > 0 && n.final.counts.reject > 0 && n.final.counts.unknown > 0 && n.final.counts.warn > 0);
  assert.match(n.final.msg, /^Xong – đã xử lý \d+ đơn/);
});

test('= bản cũ: đợt mới, máy chủ đổi thứ tự sau mỗi lệnh ghi', async () => {
  await same('đợt mới, đổi thứ tự', srv(DOT_MANY()));
});

test('= bản cũ: còn ít đơn chưa xử lý → chỉ đọc đơn chưa xử lý (runPending)', async () => {
  const n = await same('còn ít đơn', srv(DOT_FEW()), (r) => assert.equal(r.final.scope, 'pending'));
  assert.ok(n.final.counts.approve === 2 && n.final.counts.reject === 1);
});

test('= bản cũ: bộ lọc "chưa xử lý" của máy chủ hỏng → đọc cả đợt', async () => {
  await same('bộ lọc 0 hỏng', srv(DOT_FEW(), { filter0: 'ignored', reorder: false }), (r) => assert.equal(r.final.scope, 'all'));
});

test('= bản cũ: bộ lọc "chưa xử lý" trả đúng đơn nhưng sai thứ tự → không tin, đọc cả đợt', async () => {
  await same('bộ lọc 0 sai thứ tự', srv(DOT_FEW(), { filter0: 'reversed', reorder: false }), (r) => assert.equal(r.final.scope, 'all'));
});

test('= bản cũ: đọc chậm hơn ghi, danh sách xô lệch → có đơn bị sót, "xử lý nốt" làm hết', async () => {
  const n = await same('đọc chậm hơn ghi', srv(DOT_MANY(), { delay: { list: 3 } }), null, 'ADX_CONFIG.api.runPageSize = 4;');
  // không còn đơn chưa xử lý nào mà luật cho phép gửi lệnh
  const left = n.items.filter((v) => v.trangThaiGoiTinDongBo === 0 && ['approve', 'reject'].includes(RR.decide(v).status));
  assert.deepEqual(left.map((v) => v.goiTinDongBoNId), []);
  assert.ok(n.calls.some((c) => !isWrite(c) && c.body.requestQueries.trangThai === '0' && c.body.length === 1), 'có đếm lại');
});

test('= bản cũ: có đơn bị đổi về "chưa xử lý" lúc đếm lại cuối lượt → chạy thêm lượt', async () => {
  const mk = () => {
    let flipped = false;
    const s = makeServer(DOT_FEW(), {
      onCall(c) {
        // Lần đếm lại đầu tiên (đọc 1 đơn): người khác vừa trả G03 về chưa xử lý
        if (flipped || isWrite(c) || c.body.requestQueries.trangThai !== '0' || c.body.length !== 1) return;
        flipped = true;
        const g03 = s.items.find((v) => v.goiTinDongBoNId === 'G03');
        g03.trangThaiGoiTinDongBo = 0;
        g03.ThongTinDangKyThiCong.ActionProcessSyncData = 0;
      },
    });
    return s;
  };
  const n = await same('chạy thêm lượt', mk);
  assert.ok(n.calls.some((c) => isWrite(c) && c.body.goiTinDongBoNId === 'G03'), 'G03 được xử lý ở lượt 2');
});

test('= bản cũ: không còn đơn chưa xử lý', async () => {
  const n = await same('không còn đơn chưa xử lý', srv(makeDot().filter((v) => v.trangThaiGoiTinDongBo !== 0)));
  assert.equal(n.calls.filter(isWrite).length, 0);
});

test('= bản cũ: trang trả thiếu, lỗi tạm thời ở lần đọc và lần ghi đầu', async () => {
  await same('trang thiếu, lỗi 503', srv(DOT_FEW(), () => {
    let reads = 0;
    let writes = 0;
    return { maxPage: 4, fault: (c) => ((isWrite(c) ? writes++ : reads++) === 0 ? { status: 503, text: 'bận' } : null) };
  }));
});

test('= bản cũ: lệnh "Cập nhật lịch sử" hỏng → dừng, KIỂM TRA TAY (H1)', async () => {
  const fault = (c) => (c.name === 'UpdateStatusGoiTinDongBoVanHanh' && c.body.goiTinDongBoNId === 'D02'
    ? { text: JSON.stringify({ success: true, value: { trangThai: 1, actionProcessSyncDataVanHanh: '{}' } }) } : null);
  const n = await same('Cập nhật lịch sử hỏng', srv(DOT_FEW(), { fault }));
  assert.match(n.final.msg, /^Lỗi: Đơn DON_D02: đã làm: Thêm vào dữ liệu vận hành; HỎNG: Cập nhật lịch sử \(2 bản ghi\)/);
  const e = n.storage['run:log:DON_D02'];
  assert.equal(e.result, 'KIỂM TRA TAY');
  assert.equal(e.note, 'Quyết định ban đầu: ĐƯỢC DUYỆT · đã làm: Thêm vào dữ liệu vận hành; HỎNG: Cập nhật lịch sử (2 bản ghi)');
});

test('= bản cũ: lệnh "Không xử lý" hỏng → ghi chú giữ lý do không duyệt', async () => {
  const fault = (c) => (c.name === 'UpdateStatusGoiTinDongBoThiCong' && c.body.goiTinDongBoNId === 'D03'
    ? { text: JSON.stringify({ success: true, value: { trangThai: 0, actionProcessSyncDataThiCong: 0 } }) } : null);
  const n = await same('Không xử lý hỏng', srv(DOT_FEW(), { fault }));
  assert.match(n.storage['run:log:DON_D03'].note, /^Quyết định ban đầu: KHÔNG DUYỆT \(Khung phải đã có Giấy chứng nhận: .*\) · HỎNG: Không xử lý$/);
});

test('bất biến 1: token và listBody không vào storage; khoá đúng tiền tố "run:"', async () => {
  const n = await runNew(makeServer(DOT_MANY()));
  const dump = JSON.stringify(n.storage);
  assert.ok(!dump.includes(TOKEN) && !dump.includes('LISTBODY-BI-MAT') && !dump.includes('requestQueries'));
  assert.ok(Object.keys(n.storage).every((k) => k.startsWith('run:')));
});

test('Chạy tự động đọc và gửi chồng nhau: tổng không quá 6 kết nối (3 đọc + 3 gửi)', async () => {
  const server = makeServer(DOT_MANY(), { delay: { list: 8, write: 8 } });
  await runNew(server, 'ADX_CONFIG.api.runPageSize = 2;');
  assert.ok(server.load.max <= 6, `tối đa ${server.load.max}`);
  assert.ok(server.load.maxRead <= 3 && server.load.maxWrite <= 3);
  assert.equal(server.load.overlap, true, 'runAll có đọc và gửi cùng lúc');
});

test('chạy lần hai: không còn lệnh nào để gửi', async () => {
  const server = makeServer(DOT_MANY());
  await runNew(server);
  const k = server.calls.length;
  await runNew(server);
  assert.equal(server.calls.slice(k).filter(isWrite).length, 0);
});

// ---------------------------------------------------------------- Side Panel
test('Side Panel: tiến độ, ô số, ghi chú giống renderRun của bản Duyệt cũ', () => {
  const t = loadScripts([...NEW_CORE, 'tools/run/rules.js', 'tools/run/tool.js']).get("ADXTools.get('run').panel");
  const c = (o) => ({ approve: 0, reject: 0, fix: 0, skip: 0, unknown: 0, warn: 0, ...o });
  const base = { mode: 'run', counts: c({}), pos: 0, total: 0, done: 0, before: 0, phase: '', scope: '', msg: '' };
  const states = [
    { ...base, running: true, phase: 'Đang đọc danh sách đơn…' },
    { ...base, running: true, scope: 'all', pos: 12, total: 40, done: 10, counts: c({ approve: 5, reject: 3, unknown: 2 }) },
    { ...base, running: true, scope: 'pending', pos: 3, total: 9, done: 3, before: 17, counts: c({ approve: 2, skip: 1 }) },
    { ...base, running: true, scope: 'pending', phase: 'Đang xử lý nốt các đơn còn sót…', pos: 1, total: 2, done: 1 },
    { ...base, running: true, stopping: true, scope: 'all', pos: 5, total: 40 },
    { ...base, running: false, scope: 'all', pos: 40, total: 40, done: 40, msg: 'Xong', counts: c({ approve: 20, reject: 10, warn: 2, unknown: 3 }) },
    { ...base, running: false, scope: 'pending', pos: 9, total: 9, done: 9, msg: 'Xong', counts: c({ unknown: 4 }) },
    { ...base, running: false, msg: 'Không còn đơn nào chưa xử lý.', before: 30 },
  ];
  // renderRun của popup.js cũ chạy trên $ giả → [dòng, %, 4 ô số, ghi chú] cho từng trạng thái
  const olds = legacy('run', 'renderRun', () => {
    const src = read(`legacy/${LEGACY_DUYET}/popup/popup.js`);
    const fn = src.slice(src.indexOf('function renderRun(s) {'), src.indexOf('\n}\n', src.indexOf('function renderRun(s) {')) + 2);
    const els = {};
    const old = loadScripts([], { $: (id) => (els[id] = els[id] || { style: {} }) }).get(`(${fn})`);
    return states.map((s) => {
      old(s);
      return { line: els.runLine.textContent, pct: els.runPct.textContent, boxes: [els.rApprove, els.rReject, els.rManual, els.rSkip].map((e) => String(e.textContent)), note: els.runNote.textContent };
    });
  });
  states.forEach((s, i) => {
    const p = t.progress(s);
    assert.deepEqual([p.text, p.pct + '%'], [olds[i].line, olds[i].pct], JSON.stringify(s));
    assert.deepEqual(plain(t.counters(s).map((x) => String(x.value))), olds[i].boxes);
    assert.equal(t.note(s), olds[i].note);
  });
});

// ---------------------------------------------------------------- số tờ / số thửa, log từng lần chạy
test('landOf: số tờ / số thửa của khung trái (nhiều thửa nối " | " cùng thứ tự)', () => {
  const M = loadNew().get('ADXModel');
  const of = (goi) => plain(M.landOf(DUYET.find((c) => c.v.goiTinDongBoNId === goi).v));
  assert.deepEqual(of('D01'), { soTo: '12', soThua: '34' });
  assert.deepEqual(of('D02'), { soTo: '3 | 3', soThua: '45 | 46' });
  assert.deepEqual(of('D22'), { soTo: '15', soThua: '16' }); // tên trường khác, lồng sâu
  assert.deepEqual(of('D11'), { soTo: '5', soThua: '' });    // số thửa để trắng
  assert.deepEqual(of('D14'), { soTo: '', soThua: '' });     // không có trường số tờ / số thửa
});

test('log có số tờ / số thửa; log lần chạy lưu khi xong, khớp các đơn đã ghi, lần sau ghi đè', async () => {
  const server = makeServer(DOT_FEW());
  const r1 = await runNew(server);
  assert.deepEqual([r1.storage['run:log:DON_D02'].soTo, r1.storage['run:log:DON_D02'].soThua], ['3 | 3', '45 | 46']);
  const job1 = r1.storage['run:job'];
  assert.equal(job1.tool, 'run');
  assert.equal(job1.msg, r1.final.msg);
  const logged = Object.keys(r1.storage).filter((k) => k.startsWith('run:log:')).map((k) => k.slice(8)).sort();
  assert.deepEqual(job1.entries.map((e) => e.maDon).sort(), logged);
  assert.deepEqual([job1.entries.find((e) => e.maDon === 'DON_D02').soTo], ['3 | 3']);
  assert.ok(job1.entries.every((e) => e.time && e.result));
  // Lần chạy thứ hai: chỉ còn đơn kiểm tra tay / cảnh báo được ghi lại → log lần chạy mới ít đơn hơn, ghi đè lần trước
  const r2 = await runNew(server);
  const job2 = r2.storage['run:job'];
  assert.ok(job2.endedAt >= job1.endedAt && job2.entries.length < job1.entries.length);
  assert.ok(job2.entries.every((e) => e.result !== 'ĐƯỢC DUYỆT'));
});
