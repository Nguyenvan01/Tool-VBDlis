// Công cụ Gỡ duyệt chạy trên máy chủ giả: (1) cho kết quả như bản Gỡ 2.2.4 cũ, (2) giữ các bất biến an toàn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { plain, LEGACY_GO } from './lib/vm.mjs';
import { makeDot, makeServer, runOnce, boot, isWrite, NEW_FILES, NEW_RUNNER, legacyFiles, TOKEN } from './lib/fake-mplis.mjs';
import { legacy } from './lib/golden.mjs';

const NEW = [...NEW_FILES, 'tools/undo/rules.js', 'tools/undo/tool.js', NEW_RUNNER];
const runNew = (server, patch) => runOnce({ files: NEW, server, ctxType: 'vbdlis3:ctx', start: { cmd: 'apiStart', tool: 'undo' }, patch });
const runOld = (server, patch) => runOnce({ files: legacyFiles(LEGACY_GO), server, ctxType: 'adx:ctx', start: { cmd: 'apiStart' }, patch });

const writes = (calls) => calls.filter(isWrite).map((c) => JSON.stringify([c.name, c.body])).sort();
const noTime = (s) => s.replace(/trong \d+ (phút \d+ )?giây/, 'trong … giây');
// Nhật ký theo mã đơn, bỏ các trường thời gian / thứ tự ghi (phụ thuộc đồng hồ)
const logs = (storage, prefix) => Object.fromEntries(Object.entries(storage)
  .filter(([k]) => k.startsWith(prefix))
  // soTo / soThua: cột mới của bản 3 (bản cũ không có) – kiểm riêng
  .map(([k, { soTo, soThua, ...e }]) => [k.slice(prefix.length), { ...e, time: '', actionTime: '', seq: 0 }]));
const STATE_KEYS = ['counts', 'pos', 'total', 'before', 'wDone', 'wTotal', 'dup', 'scope', 'step', 'running', 'stopping'];
const pick = (s) => plain(Object.fromEntries(STATE_KEYS.map((k) => [k, s[k]])));

// Kết quả một lần chạy, đã bỏ phần phụ thuộc đồng hồ – dạng dùng để so và để chốt vào test/golden/undo.json
const norm = (r, prefix, statsKey) => ({
  error: r.started.error, writes: writes(r.calls), items: plain(r.items), state: pick(r.final), msg: noTime(r.final.msg),
  logs: logs(r.storage, prefix), stats: plain(r.storage[statsKey]) ?? null,
});

// So bản mới với bản cũ trên cùng đợt và cùng kiểu máy chủ (opts: cấu hình máy chủ giả, hoặc hàm tạo cấu hình mới mỗi lần).
// key: tên kịch bản trong test/golden/undo.json
async function same(key, opts, check) {
  const dot = makeDot();
  const mk = typeof opts === 'function' ? opts : () => opts;
  const o = await legacy('undo', key, async () => norm(await runOld(makeServer(dot, mk())), 'adxUndo:', 'adxUndoStats'));
  // So với bản cũ ở CÙNG độ song song (bản cũ: 3 đọc, 3 gửi) – bản mới mặc định 3 / 6 cho công cụ hai bước
  const n = await runNew(makeServer(dot, mk()), 'ADX_CONFIG.api.phasedReadAhead = 3; ADX_CONFIG.api.phasedWriteConcurrency = 3;');
  const nn = norm(n, 'undo:log:', 'undo:stats');
  assert.equal(nn.error, o.error);
  assert.deepEqual(nn.writes, o.writes, 'tập lệnh ghi');
  assert.deepEqual(nn.items, o.items, 'dữ liệu trên máy chủ sau khi chạy');
  assert.deepEqual(nn.state, o.state, 'trạng thái cuối');
  assert.equal(nn.msg, o.msg);
  const [lo, ln] = [o.logs, nn.logs];
  assert.deepEqual(Object.keys(ln).sort(), Object.keys(lo).sort(), 'nhật ký: cùng các mã đơn');
  for (const k of Object.keys(lo)) {
    if (lo[k].action.startsWith('LỖI')) {
      // H1: chỉ khác ghi chú – quyết định ban đầu chuyển sang ghi chú, kèm đã làm / HỎNG / chưa làm
      assert.equal(lo[k].result, 'KIỂM TRA TAY');
      assert.ok(ln[k].note.startsWith(`Quyết định ban đầu: ${lo[k].note} · `), ln[k].note);
      assert.ok(ln[k].note.includes('HỎNG'));
      assert.deepEqual({ ...ln[k], note: '' }, { ...lo[k], note: '' });
    } else {
      assert.deepEqual(ln[k], lo[k], `nhật ký ${k}`);
    }
  }
  assert.deepEqual(nn.stats, o.stats, 'thống kê');
  if (check) check(n);
  return n;
}

test('= bản cũ: bộ lọc "đã xử lý" đúng → chỉ đọc đơn đã xử lý', async () => {
  const n = await same('lọc đúng', {}, (r) => assert.equal(r.final.scope, 'done'));
  assert.ok(n.final.counts.undo > 0 && n.final.counts.unknown > 0 && n.final.counts.skip > 0, 'đợt mẫu phải có đủ undo / unknown / skip');
  assert.match(n.final.msg, /^Xong – đã gỡ duyệt/);
});

test('= bản cũ: máy chủ bỏ qua bộ lọc "1" → đọc cả đợt (bất biến 8)', async () => {
  await same('bỏ qua bộ lọc 1', { filter1: 'ignored' }, (r) => assert.equal(r.final.scope, 'all'));
});

test('= bản cũ: bộ lọc "1" đếm đúng nhưng lẫn đơn chưa xử lý → không tin, đọc cả đợt (bất biến 8)', async () => {
  await same('bộ lọc 1 lẫn đơn chưa xử lý', { filter1: 'mixed' }, (r) => assert.equal(r.final.scope, 'all'));
});

test('= bản cũ: máy chủ trả thiếu trang', async () => {
  await same('trang trả thiếu', { maxPage: 4 });
});

test('= bản cũ: lỗi tạm thời (HTTP 500) ở lần đọc và lần ghi đầu → thử lại rồi xong', async () => {
  const n = await same('lỗi 500 rồi thử lại', () => {
    let reads = 0;
    let writes = 0;
    return { fault: (c) => ((isWrite(c) ? writes++ : reads++) === 0 ? { status: 500, text: 'lỗi' } : null) };
  });
  assert.match(n.final.msg, /^Xong/);
  // lệnh ghi đầu tiên được gửi lại đúng y nguyên (idempotent)
  const first = n.calls.find(isWrite);
  assert.equal(n.calls.filter((c) => JSON.stringify(c) === JSON.stringify(first)).length, 2);
});

test('= bản cũ: phản hồi sai trạng thái ở khung trái → dừng, KIỂM TRA TAY (H1)', async () => {
  const fault = (c) => (c.name === 'UpdateStatusGoiTinDongBoThiCong' && c.body.goiTinDongBoNId === 'G02'
    ? { text: JSON.stringify({ success: true, value: { trangThai: 1, actionProcessSyncDataThiCong: 1 } }) } : null);
  const n = await same('khung trái phản hồi sai', { fault });
  assert.match(n.final.msg, /^Lỗi: Đơn DON_T02: đã làm: Bỏ duyệt \(khung phải\) \(3 bản ghi\); HỎNG: Bỏ duyệt \(khung trái\)/);
  const e = n.storage['undo:log:DON_T02'];
  assert.equal(e.result, 'KIỂM TRA TAY');
  assert.equal(e.note, 'Quyết định ban đầu: GỠ DUYỆT: Bỏ duyệt (khung phải) (3 bản ghi) → Bỏ duyệt (khung trái) · đã làm: Bỏ duyệt (khung phải) (3 bản ghi); HỎNG: Bỏ duyệt (khung trái)');
  assert.match(e.action, /^LỖI – /);
});

test('bất biến 2: hỏng ở lệnh đầu → log có "chưa làm", thống kê đếm vào Kiểm tra tay', async () => {
  const fault = (c) => (c.name === 'UpdateStatusGoiTinDongBoVanHanh' && c.body.goiTinDongBoNId === 'G01'
    ? { text: JSON.stringify({ success: true, value: { trangThai: 0, actionProcessSyncDataVanHanh: '{}' } }) } : null);
  const n = await runNew(makeServer(makeDot(), { fault }));
  const e = n.storage['undo:log:DON_T01'];
  assert.equal(e.note, 'Quyết định ban đầu: GỠ DUYỆT: Bỏ duyệt (khung phải) → Bỏ duyệt (khung trái) · HỎNG: Bỏ duyệt (khung phải); chưa làm: Bỏ duyệt (khung trái)');
  const unknownLogs = Object.entries(n.storage).filter(([k, v]) => k.startsWith('undo:log:') && v.result === 'KIỂM TRA TAY').length;
  assert.equal(n.storage['undo:stats'].unknown, unknownLogs);
  // không gửi lệnh khung trái của đơn hỏng
  assert.ok(!n.calls.some((c) => c.name === 'UpdateStatusGoiTinDongBoThiCong' && c.body.goiTinDongBoNId === 'G01'));
});

test('bất biến 3: success:false và không phải JSON → không thử lại, dừng', async () => {
  for (const text of [JSON.stringify({ success: false, message: 'từ chối' }), '<html>đăng nhập</html>']) {
    const fault = (c) => (isWrite(c) && c.body.goiTinDongBoNId === 'G03' ? { text } : null);
    const n = await runNew(makeServer(makeDot(), { fault }));
    assert.equal(n.calls.filter((c) => isWrite(c) && c.body.goiTinDongBoNId === 'G03').length, 1, 'chỉ gửi một lần');
    assert.match(n.final.msg, /^Lỗi: Đơn DON_T03: HỎNG: Bỏ duyệt \(khung trái\)/);
  }
});

test('bất biến 5: mọi lần đọc xong trước lệnh ghi đầu tiên (cả khi đọc cả đợt)', async () => {
  for (const filter1 of ['ok', 'ignored']) {
    const { calls } = await runNew(makeServer(makeDot(), { filter1 }));
    const firstWrite = calls.findIndex(isWrite);
    const lastRead = calls.map((c) => !isWrite(c)).lastIndexOf(true);
    assert.ok(firstWrite > 0 && lastRead < firstWrite, `${filter1}: đọc cuối #${lastRead}, ghi đầu #${firstWrite}`);
  }
});

test('bất biến 1: token và listBody không bao giờ vào storage; mọi request mang token', async () => {
  const n = await runNew(makeServer(makeDot()));
  const dump = JSON.stringify(n.storage);
  assert.ok(Object.keys(n.storage).length > 0);
  assert.ok(!dump.includes(TOKEN));
  assert.ok(!dump.includes('LISTBODY-BI-MAT') && !dump.includes('requestQueries'));
  assert.ok(n.calls.every((c) => c.token === TOKEN));
});

test('bất biến 4: Dừng lúc đang đọc → huỷ ngay, không gửi lệnh ghi nào', async () => {
  const server = makeServer(makeDot(), { delay: { list: 30 } });
  const b = boot({ files: NEW, server, ctxType: 'vbdlis3:ctx' });
  await b.send({ cmd: 'apiStart', tool: 'undo' });
  await new Promise((r) => setTimeout(r, 10));
  await b.send({ cmd: 'apiStop' });
  const final = await b.finish();
  assert.match(final.msg, /^Đã dừng/);
  assert.equal(server.calls.filter(isWrite).length, 0);
});

test('bất biến 4: Dừng lúc đang ghi → đơn đang gửi được gửi xong, không nhận đơn mới', async () => {
  let b;
  let stopped = false;
  const server = makeServer(makeDot(), {
    delay: { write: 15 },
    onCall: (c) => { if (isWrite(c) && !stopped) { stopped = true; b.send({ cmd: 'apiStop' }); } },
  });
  b = boot({ files: NEW, server, ctxType: 'vbdlis3:ctx' });
  await b.send({ cmd: 'apiStart', tool: 'undo' });
  const final = await b.finish();
  assert.match(final.msg, /^Đã dừng/);
  const byGoi = new Map();
  for (const c of server.calls.filter(isWrite)) byGoi.set(c.body.goiTinDongBoNId, [...(byGoi.get(c.body.goiTinDongBoNId) || []), c.name]);
  assert.ok(byGoi.size >= 1 && byGoi.size <= 6, `số đơn đã gửi: ${byGoi.size} (≤ phasedWriteConcurrency)`);
  // đơn nào đã bắt đầu thì phải có lệnh khung trái (lệnh cuối) – không đơn nào dở dang
  for (const [goi, names] of byGoi) assert.equal(names.at(-1), 'UpdateStatusGoiTinDongBoThiCong', goi);
});

test('bất biến 11: đang chạy thì apiStart (bất kỳ công cụ nào) bị từ chối', async () => {
  const server = makeServer(makeDot(), { delay: { list: 10 } });
  const b = boot({ files: NEW, server, ctxType: 'vbdlis3:ctx' });
  assert.equal((await b.send({ cmd: 'apiStart', tool: 'undo' })).error, '');
  const again = await b.send({ cmd: 'apiStart', tool: 'undo' });
  assert.equal(again.error, 'Đang chạy rồi');
  assert.equal(again.tool, 'undo');
  await b.finish();
});

test('bất biến 7: readAhead + writeConcurrency > 6 → từ chối chạy, không gửi gì', async () => {
  const server = makeServer(makeDot());
  const r = await runNew(server, 'ADX_CONFIG.api.readAhead = 4;');
  assert.match(r.started.error, /readAhead \+ writeConcurrency phải ≤ 6/);
  assert.equal(server.calls.length, 0);
  for (const k of ['phasedReadAhead', 'phasedWriteConcurrency']) {
    const s2 = makeServer(makeDot());
    const r2 = await runNew(s2, `ADX_CONFIG.api.${k} = 7;`);
    assert.match(r2.started.error, /mỗi số phải ≤ 6/, k);
    assert.equal(s2.calls.length, 0);
  }
});

test('tăng tốc an toàn: bước đọc dùng đúng phasedReadAhead (3), bước gửi tới 6 đơn, không lúc nào quá 6, đọc và gửi không chồng nhau', async () => {
  const server = makeServer(makeDot(), { delay: { list: 8, write: 8 } });
  const r = await runNew(server, 'ADX_CONFIG.api.runPageSize = 2;');
  assert.match(r.final.msg, /^Xong/);
  assert.equal(server.load.maxRead, 3, 'bước đọc');
  assert.equal(server.load.maxWrite, 6, 'bước gửi');
  assert.ok(server.load.max <= 6, `tối đa ${server.load.max} kết nối`);
  assert.equal(server.load.overlap, false);
});

test('apiStart với công cụ không có → từ chối', async () => {
  const b = boot({ files: NEW, server: makeServer([]), ctxType: 'vbdlis3:ctx' });
  assert.equal((await b.send({ cmd: 'apiStart', tool: 'khongco' })).error, 'Không có công cụ "khongco"');
});
