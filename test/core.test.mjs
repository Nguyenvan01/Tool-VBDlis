// Lõi: cấu hình, manifest, ranh giới lõi / công cụ, sổ đăng ký, CSV, background, Side Panel, công cụ mới không sửa lõi.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, read, readJson, loadScripts, plain, NEW_CORE, LEGACY_GO } from './lib/vm.mjs';
import { makeDot, makeServer, runOnce, isWrite, NEW_FILES, NEW_RUNNER } from './lib/fake-mplis.mjs';
import { legacy } from './lib/golden.mjs';

const manifest = readJson('manifest.json');
const NOT_EXT = ['legacy', 'test', 'docs', 'node_modules', '.git'];
function walk(dir = '', skip = NOT_EXT) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return skip.includes(rel) ? [] : [rel + '/', ...walk(rel, skip)];
    return [rel];
  });
}
const SRC = walk().filter((f) => f.endsWith('.js'));
const TOOL_FILES = manifest.content_scripts.flatMap((c) => c.js).filter((f) => f.startsWith('tools/'));
// Quét mã đã bỏ chú thích (chú thích được phép nhắc tên các thứ bị cấm)
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const has = (f, re) => re.test(code(f));

test('bất biến 7, 9: readAhead + writeConcurrency ≤ 6, phasedReadAhead / phasedWriteConcurrency mỗi số ≤ 6; ADX_VERSION = manifest.version', () => {
  const { get } = loadScripts(['config.js']);
  const A = get('ADX_CONFIG.api');
  assert.ok(A.readAhead + A.writeConcurrency <= 6);
  assert.ok(A.phasedReadAhead <= 6 && A.phasedWriteConcurrency <= 6);
  assert.equal(get('ADX_VERSION'), manifest.version);
});

test('manifest: file trỏ tới đều có, chỉ chạy trên mplis, Alt+Shift+S, thứ tự nạp', () => {
  const refs = [manifest.background.service_worker, manifest.side_panel.default_path, ...Object.values(manifest.icons),
    ...manifest.content_scripts.flatMap((c) => c.js)];
  for (const f of refs) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  assert.deepEqual(manifest.host_permissions, ['https://*.mplis.gov.vn/*']);
  for (const c of manifest.content_scripts) assert.deepEqual(c.matches, ['https://*.mplis.gov.vn/*']);
  assert.equal(manifest.commands['emergency-stop'].suggested_key.default, 'Alt+Shift+S');
  const [hook, ctx, main] = manifest.content_scripts;
  assert.deepEqual([hook.js, hook.world, hook.run_at], [['core/hook.js'], 'MAIN', 'document_start']);
  assert.deepEqual([ctx.js, ctx.run_at], [['core/context.js'], 'document_start']);
  assert.equal(main.js.at(-1), 'core/runner.js', 'runner nạp sau cùng, sau mọi công cụ');
  assert.ok(TOOL_FILES.length > 0);
});

test('Load unpacked: không file / thư mục nào bắt đầu bằng "_" (Chrome từ chối)', () => {
  const bad = walk('', ['node_modules', '.git']).filter((f) => f.split('/').some((p) => p.startsWith('_')));
  assert.deepEqual(bad, []);
});

test('cú pháp: mọi file JS của extension biên dịch được', () => {
  for (const f of SRC) assert.doesNotThrow(() => new vm.Script(read(f), { filename: f }), f);
});

test('background.js: nạp không lỗi, không đụng storage (H2), Alt+Shift+S gửi apiStop tới mọi khung', async () => {
  const on = {};
  const sent = [];
  const chrome = {
    sidePanel: { setPanelBehavior: async () => {} },
    runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} } },
    commands: { onCommand: { addListener: (fn) => { on.cmd = fn; } } },
    tabs: { query: async () => [{ id: 7 }], sendMessage: async (id, msg, o) => { sent.push([id, msg.cmd, o.frameId]); } },
    webNavigation: { getAllFrames: async () => [{ frameId: 0 }, { frameId: 3 }] },
  };
  loadScripts(['background.js'], { chrome });
  await on.cmd('emergency-stop');
  assert.deepEqual(sent, [[7, 'apiStop', 0], [7, 'apiStop', 3]]);
});

test('bất biến 1: chỉ core/log.js đọc / ghi chrome.storage; Side Panel chỉ nghe onChanged', () => {
  assert.deepEqual(SRC.filter((f) => has(f, /chrome\.storage\.(?!onChanged)/)), ['core/log.js']);
  assert.deepEqual(SRC.filter((f) => has(f, /chrome\.storage\.onChanged/)), ['panel/panel.js']);
});

test('bất biến 1: ngữ cảnh (token, listBody) chỉ core/context.js giữ và core/runner.js đọc', () => {
  assert.deepEqual(SRC.filter((f) => has(f, /ADXApiContext/)).sort(), ['core/context.js', 'core/runner.js']);
  assert.deepEqual(SRC.filter((f) => has(f, /listBody/)).sort(), ['core/context.js', 'core/hook.js', 'core/runner.js']);
});

test('ranh giới: tools/* không gọi fetch, chrome, ADXApiContext, localStorage; rules.js thuần', () => {
  for (const f of SRC.filter((x) => x.startsWith('tools/'))) {
    assert.ok(!has(f, /\bfetch\s*\(|\bchrome\.|ADXApiContext|localStorage|XMLHttpRequest/), f);
    // đọc giờ (new Date / Date.now) cũng là I/O; chữ "Date" trong regex ngày rỗng /Date(-62135…)/ thì không
    if (f.endsWith('rules.js')) assert.ok(!has(f, /\bdocument\b|\bsetTimeout\b|\bnew Date\b|\bDate\.now\b|\bwindow\b/), f);
  }
});

test('kết quả bản cũ đã chốt (test/golden) không chứa token / listBody', () => {
  const dir = path.join(ROOT, 'test/golden');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  assert.ok(files.length > 0, 'chưa có test/golden/*.json');
  for (const f of files) {
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!s.includes('TOKEN-BI-MAT') && !s.includes('LISTBODY-BI-MAT') && !s.includes('requestQueries'), f);
  }
});

test('H2a: cờ MAIN world và kiểu thông điệp mang tên riêng của bản 3', () => {
  assert.ok(has('core/hook.js', /window\.__vbdlis3HookLoaded = true/) && has('core/hook.js', /type: 'vbdlis3:ctx'/));
  assert.ok(has('core/context.js', /d\.type !== 'vbdlis3:ctx'/));
  assert.deepEqual(SRC.filter((f) => has(f, /__adxHookLoaded|'adx:ctx'/)), []);
});

test('file tools/* nạp được khi không có chrome (chạy cả ở Side Panel)', () => {
  const { get } = loadScripts([...NEW_CORE, 'core/log.js', ...TOOL_FILES]);
  assert.deepEqual(plain(get('ADXTools.list().map((t) => t.id)')), TOOL_FILES.filter((f) => f.endsWith('tool.js')).map((f) => f.split('/')[1]));
});

test('sổ đăng ký: từ chối id sai kiểu, trùng, thiếu trường, log trỏ tới công cụ chưa có', () => {
  const { get } = loadScripts([...NEW_CORE, 'tools/undo/rules.js', 'tools/undo/tool.js']);
  const reg = (patch) => get(`(() => { const t = { ...ADXTools.get('undo'), panel: { ...ADXTools.get('undo').panel }, id: 'x' }; Object.assign(t, ${patch}); ADXTools.register(t); })`);
  assert.throws(reg("{ id: 'auditFix' }"), /chữ thường/);
  assert.throws(reg("{ id: 'undo' }"), /đã có/);
  assert.throws(reg('{ run: undefined }'), /thiếu "run"/);
  assert.throws(reg("{ panel: { start: 'x' } }"), /panel\.confirm/);
  assert.throws(reg("{ log: 'khongco' }"), /chưa có nhật ký/);
  assert.throws(reg("{ log: { title: 'a', file: 'b', results: {} } }"), /unknown/);
  assert.doesNotThrow(reg("{ id: 'ok', log: 'undo' }"));
  assert.equal(get("ADXTools.logNs(ADXTools.get('ok'))"), 'undo');
});

test('CSV: BOM, chống CSV injection, 12 cột log giống hệt bản cũ (+ Số tờ, Số thửa)', () => {
  const { get } = loadScripts([...NEW_CORE, 'core/csv.js']);
  const csv = get('ADXCsv');
  for (const s of ['=1+1', '+1', '-1', '@SUM(A1)']) assert.equal(csv.cell(s, ','), "'" + s);
  assert.equal(csv.cell('a,"b"', ','), '"a,""b"""');
  const log = [
    { time: '1/1', stt: '3/10', maDon: 'DON_1', owners: '=HYPERLINK("x")', ownersRight: 'A; B', result: 'KIỂM TRA TAY', soPhatHanh: '', soVaoSo: '', action: 'LỖI – x, "y"', actionTime: '1/1', note: 'dòng 1\ndòng 2' },
    { time: '1/1', stt: '', maDon: 'DON_2', owners: '-a', ownersRight: '', result: 'ĐÃ GỠ DUYỆT', soPhatHanh: 'CS 1 | CS 2', soVaoSo: '@x', action: 'GỠ', actionTime: '', note: '' },
  ];
  assert.deepEqual(plain(csv.LOG_HEAD.slice(6, 8)), ['Số tờ', 'Số thửa']);
  // Bỏ hai cột mới thì phải giống hệt CSV của bản cũ
  const drop = (r) => r.filter((_, i) => i !== 6 && i !== 7);
  const got = csv.build(drop(csv.LOG_HEAD), csv.logRows(log).map(drop));
  assert.ok(got.startsWith('﻿'));
  // toCsv của bản cũ (popup.js) chạy trên cùng nhật ký
  assert.equal(got, legacy('core', 'toCsv nhật ký', () => {
    const src = read(`legacy/${LEGACY_GO}/popup/popup.js`);
    const fn = src.slice(src.indexOf('function toCsv(log) {'), src.indexOf('\n}\n', src.indexOf('function toCsv(log) {')) + 2);
    return loadScripts([`legacy/${LEGACY_GO}/config.js`]).get(`(${fn})`)(log);
  }));
});

test('Side Panel: tiến độ và ô số của Gỡ duyệt giống renderRun của bản cũ', () => {
  const t = loadScripts([...NEW_CORE, 'tools/undo/rules.js', 'tools/undo/tool.js']).get("ADXTools.get('undo').panel");
  const base = { counts: { undo: 0, skip: 2, unknown: 1 }, before: 3, pos: 5, total: 20, wDone: 0, wTotal: 0, dup: 0, msg: '' };
  const states = [
    { ...base, running: true, step: 'read', scope: 'done' },
    { ...base, running: true, step: 'read', scope: 'all', total: 0 },
    { ...base, running: true, step: 'write', scope: 'done', wDone: 3, wTotal: 8 },
    { ...base, running: true, stopping: true, step: 'write', scope: 'all' },
    { ...base, running: false, step: 'write', scope: 'done', pos: 20, wTotal: 8, counts: { undo: 8, skip: 9, unknown: 0 }, msg: 'Xong' },
    { ...base, running: false, step: 'read', total: 0, pos: 0, msg: 'Xong' },
  ];
  // renderRun của popup.js cũ chạy trên $ giả → [dòng, %, 3 ô số, ghi chú] cho từng trạng thái
  const olds = legacy('core', 'renderRun Gỡ duyệt', () => {
    const src = read(`legacy/${LEGACY_GO}/popup/popup.js`);
    const fn = src.slice(src.indexOf('function renderRun(s) {'), src.indexOf('\n}\n', src.indexOf('function renderRun(s) {')) + 2);
    const els = {};
    const old = loadScripts([], { $: (id) => (els[id] = els[id] || { style: {} }) }).get(`(${fn})`);
    return states.map((s) => {
      old(s);
      return { line: els.runLine.textContent, pct: els.runPct.textContent, boxes: [els.rUndo, els.rManual, els.rSkip].map((e) => String(e.textContent)), note: els.runNote.textContent };
    });
  });
  states.forEach((s, i) => {
    const p = t.progress(s);
    assert.deepEqual([p.text, p.pct + '%'], [olds[i].line, olds[i].pct], JSON.stringify(s));
    assert.deepEqual(plain(t.counters(s).map((c) => String(c.value))), olds[i].boxes);
    assert.equal(t.note(s), olds[i].note);
  });
});

// ---------------------------------------------------------------- công cụ mới: chỉ thêm thư mục + đăng ký, core/ giữ nguyên
const DEMO = [...NEW_FILES, 'test/fixtures/tool-demo/rules.js', 'test/fixtures/tool-demo/tool.js', NEW_RUNNER];
const runDemo = (patch) => runOnce({ files: DEMO, server: makeServer(makeDot()), ctxType: 'vbdlis3:ctx', start: { cmd: 'apiStart', tool: 'demo' }, patch });

test('công cụ mới chạy qua lõi y nguyên: đọc, gửi lệnh, nhật ký riêng "demo:*"', async () => {
  const r = await runDemo();
  assert.equal(r.started.error, '');
  assert.match(r.final.msg, /^Xong – \d+ đơn/);
  const pending = makeDot().filter((v) => v.trangThaiGoiTinDongBo === 0).map((v) => v.goiTinDongBoNId).sort();
  assert.deepEqual(r.calls.filter(isWrite).map((c) => c.body.goiTinDongBoNId).sort(), pending);
  assert.equal(r.storage['demo:stats'].act, pending.length);
  assert.ok(Object.keys(r.storage).every((k) => k.startsWith('demo:')));
});

test('readBeforeWrite: công cụ gửi lệnh khi chưa đọc xong → lõi chặn, không gửi gì', async () => {
  const r = await runDemo("ADXTools.get('demo').config.writeEarly = true;");
  assert.match(r.final.msg, /^Lỗi: Lỗi chương trình: gửi lệnh khi chưa đọc xong danh sách/);
  assert.equal(r.calls.filter(isWrite).length, 0);
});

test('bất biến 2: lệnh không có expect → lõi không gửi', async () => {
  const r = await runDemo("ADXTools.get('demo').config.noExpect = true;");
  assert.match(r.final.msg, /không có expect/);
  assert.equal(r.calls.filter(isWrite).length, 0);
});
