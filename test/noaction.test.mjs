// Công cụ "Không xử lý hết" (noaction): bảng luật 1–7, đối chiếu lệnh với bản Duyệt cũ, và chạy trên máy chủ giả.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts, readJson, plain, NEW_CORE, legacyRules, LEGACY_DUYET } from './lib/vm.mjs';
import { makeDot, makeServer, runOnce, boot, isWrite, NEW_FILES, NEW_RUNNER, TOKEN } from './lib/fake-mplis.mjs';
import { legacy } from './lib/golden.mjs';

const N = loadScripts([...NEW_CORE, 'tools/noaction/rules.js']);
const M = N.get('ADXModel');
const R = N.get('ADXRules.noaction');
// planFor + fixApproved của bản Duyệt 2.1.3 cho đơn v (coi như không duyệt); legacy/ đã xoá thì đọc test/golden/noaction.json
const oldFix = (goi, v) => legacy('noaction', `fix: ${goi}`, () => {
  const D = loadScripts(legacyRules(LEGACY_DUYET)).get('ADXApiRules');
  return D.planFor(v, { ...D.decide(v), status: 'reject' }, { fixApproved: true });
});

// Dòng luật mong đợi: đơn trong don.json (theo mã gói tin) + đơn trong noaction.json (trường row)
const ROW_OF_DON = { G01: 4, G02: 4, G03: 6, G04: 1, G05: 4, G06: 5, G07: 7, G08: 3, G09: 3, G10: 5, G11: 4, G12: 3, G13: 3 };
const EXTRA = readJson('test/fixtures/noaction.json');
const CASES = [
  ...readJson('test/fixtures/don.json').map((c) => ({ ...c, row: ROW_OF_DON[c.v.goiTinDongBoNId || 'G04'] })),
  ...EXTRA,
];
const plan = (v) => plain(R.noactionFor(v, M.info(v)));

// Lệnh mong đợi – viết thẳng body / expect theo docs/KIEN_TRUC.md mục 10 (không dựng bằng hàm của lõi)
const KHONG_XU_LY = (goi) => ({
  name: 'UpdateStatusGoiTinDongBoThiCong', label: 'Không xử lý',
  body: { goiTinDongBoNId: goi, actionProcessSyncDataThiCong: 0, trangThai: 1, processSyncDatas: [] },
  expect: { trangThai: 1, thiCong: 0 },
});
const BO_DUYET_PHAI = (goi, ids) => ({
  name: 'UpdateStatusGoiTinDongBoVanHanh', label: ids.length > 1 ? `Bỏ duyệt (khung phải) (${ids.length} bản ghi)` : 'Bỏ duyệt (khung phải)',
  body: { goiTinDongBoNId: goi, processSyncDatas: ids.map((id) => ({ actionProcessSyncData: -1, tinhHinhDangKyId: id })), trangThai: 0 },
  expect: { trangThai: 0, vanHanh: { ids, action: -1 } },
});

function expected(row, v) {
  const goi = v.goiTinDongBoNId;
  if (row <= 3) return { kind: 'unknown', reqs: [] };
  if (row === 4) return { kind: 'change', reqs: [BO_DUYET_PHAI(goi, v.tinhHinhDangKyVanHanhIds), KHONG_XU_LY(goi)] };
  if (row === 7) return { kind: 'skip', reqs: [] };
  return { kind: 'change', reqs: [KHONG_XU_LY(goi)] };
}
const WHY = { 1: 'không có mã gói tin', 2: 'khung phải không khớp', 3: 'trạng thái khác' };

test('mỗi dòng luật 1–7 có ít nhất một đơn; dòng 4 có khung phải nhiều bản ghi và khung trái pending', () => {
  for (let r = 1; r <= 7; r++) assert.ok(CASES.some((c) => c.row === r), `dòng ${r}`);
  const row4 = CASES.filter((c) => c.row === 4);
  assert.ok(row4.some((c) => c.v.tinhHinhDangKyVanHanhIds.length > 1));
  assert.ok(row4.some((c) => M.serverState(c.v) === 'pending'));
  assert.ok(CASES.some((c) => c.row === 5 && c.v.ThongTinDangKyThiCong.ActionProcessSyncData === -1), 'dòng 5 có khung trái -1');
});

for (const { name, row, v } of CASES) {
  test(`dòng ${row}: ${name}`, () => {
    const p = plan(v);
    const e = expected(row, v);
    assert.equal(p.kind, e.kind);
    assert.deepEqual(p.reqs, e.reqs);
    if (WHY[row]) assert.ok(p.label.includes(WHY[row]), p.label);
    if (row === 5) assert.equal(M.serverState(v), 'pending');
    if (row === 6) assert.equal(M.serverState(v), 'approved');
  });
}

test('dòng 4 và 6 (đơn đã duyệt) gửi đúng lệnh như "Quét và sửa" của bản Duyệt 2.1.3 (planFor + fixApproved)', () => {
  // Kiểm giả định dòng 6: khung phải trống thì bản cũ đi thẳng approved → Không xử lý
  for (const goi of ['G01', 'G02', 'G03', 'G11']) {
    const { v } = CASES.find((c) => c.v.goiTinDongBoNId === goi);
    const old = oldFix(goi, v);
    assert.equal(old.kind, 'fix');
    assert.deepEqual(plan(v).reqs, plain(old.reqs), goi);
  }
});

test('khác bản cũ (có chủ đích, theo bảng luật): đã duyệt, khung phải có bản ghi nhưng không có lịch sử → chỉ Không xử lý', () => {
  const { v } = EXTRA.find((c) => c.v.goiTinDongBoNId === 'N03');
  const old = oldFix('N03', v).reqs;
  assert.deepEqual(old.map((r) => r.label), ['Bỏ duyệt (khung phải) (2 bản ghi)', 'Không xử lý']);
  assert.deepEqual(plan(v).reqs.map((r) => r.label), ['Không xử lý']);
});

// ---------------------------------------------------------------- chạy trên máy chủ giả
const FILES = [...NEW_FILES, 'tools/noaction/rules.js', 'tools/noaction/tool.js', NEW_RUNNER];
const START = { cmd: 'apiStart', tool: 'noaction' };
const dot = () => [...makeDot(), ...EXTRA.map((c) => plain(c.v))];
const run = (server) => runOnce({ files: FILES, server, ctxType: 'vbdlis3:ctx', start: START });
const writesOf = (calls, from = 0) => calls.slice(from).filter(isWrite);
const byGoi = (items, goi) => items.find((x) => x.goiTinDongBoNId === goi);

test('chạy hết: đơn "change" về đã Không xử lý, lần đọc cuối trước lần ghi đầu, khung phải trước khung trái', async () => {
  const server = makeServer(dot());
  const before = plain(server.items);
  const r = await run(server);
  assert.match(r.final.msg, /^Xong – đã Không xử lý \d+ đơn/);
  const firstWrite = r.calls.findIndex(isWrite);
  assert.ok(firstWrite > 0 && r.calls.map((c) => !isWrite(c)).lastIndexOf(true) < firstWrite, 'đọc hết rồi mới gửi');
  for (const v0 of before) {
    const p = plan(v0);
    const v1 = byGoi(r.items, v0.goiTinDongBoNId);
    const sent = writesOf(r.calls).filter((c) => v0.goiTinDongBoNId && c.body.goiTinDongBoNId === v0.goiTinDongBoNId);
    assert.deepEqual(sent.map((c) => c.body), p.reqs.map((q) => q.body), `${v0.goiTinDongBoNId}: đúng lệnh, đúng thứ tự`);
    if (p.kind === 'change') {
      assert.equal(M.serverState(v1), 'noaction', v0.goiTinDongBoNId);
      if (p.reqs.length === 2) assert.ok(M.vhActions(v1).every((a) => a === -1));
    } else {
      assert.deepEqual(plain(v1), v0, `${v0.goiTinDongBoNId} không bị đụng tới`);
    }
  }
  const c = r.final.counts;
  assert.equal(c.change, before.filter((v) => plan(v).kind === 'change').length);
  assert.equal(r.storage['noaction:stats'].change, c.change);
  // Nhật ký lấy mã đơn làm khoá: đơn không có mã đơn chỉ đếm ở lần chạy, không ghi log (như bản cũ)
  assert.equal(r.storage['noaction:stats'].unknown, before.filter((v) => plan(v).kind === 'unknown' && M.info(v).maDon).length);
  assert.ok(c.unknown > r.storage['noaction:stats'].unknown);
  // Bất biến 1: khoá đúng tiền tố, không có token / listBody
  assert.ok(Object.keys(r.storage).every((k) => k.startsWith('noaction:')));
  assert.ok(!JSON.stringify(r.storage).includes(TOKEN) && !JSON.stringify(r.storage).includes('requestQueries'));
});

test('chạy hai lần liên tiếp: lần hai mọi đơn là skip hoặc unknown, không gửi lệnh nào', async () => {
  const server = makeServer(dot());
  await run(server);
  const n = server.calls.length;
  const r2 = await run(server);
  assert.equal(writesOf(server.calls, n).length, 0);
  assert.equal(r2.final.counts.change, 0);
  assert.equal(r2.final.counts.skip + r2.final.counts.unknown, r2.final.total);
});

test('dòng 4 hỏng ở lệnh thứ hai → KIỂM TRA TAY, dừng; lần sau đơn rơi vào dòng 5, chỉ gửi Không xử lý', async () => {
  let failOnce = true;
  const fault = (c) => {
    if (failOnce && c.name === 'UpdateStatusGoiTinDongBoThiCong' && c.body.goiTinDongBoNId === 'G02') {
      failOnce = false;
      return { text: JSON.stringify({ success: true, value: { trangThai: 0, actionProcessSyncDataThiCong: 1 } }) };
    }
    return null;
  };
  const server = makeServer(dot(), { fault });
  const r1 = await run(server);
  assert.match(r1.final.msg, /^Lỗi: Đơn DON_T02: đã làm: Bỏ duyệt \(khung phải\) \(3 bản ghi\); HỎNG: Không xử lý/);
  const e = r1.storage['noaction:log:DON_T02'];
  assert.equal(e.result, 'KIỂM TRA TAY');
  assert.equal(e.note, 'Quyết định ban đầu: KHÔNG XỬ LÝ: Bỏ duyệt (khung phải) (3 bản ghi) → Không xử lý · đã làm: Bỏ duyệt (khung phải) (3 bản ghi); HỎNG: Không xử lý');
  // Trên máy chủ: khung phải đã -1, đơn về chưa xử lý
  const g02 = byGoi(server.items, 'G02');
  assert.equal(M.serverState(g02), 'pending');
  assert.ok(M.vhActions(g02).every((a) => a === -1));
  assert.deepEqual(plan(g02).reqs, [KHONG_XU_LY('G02')], 'giờ thuộc dòng 5');

  const n = server.calls.length;
  const r2 = await run(server);
  assert.match(r2.final.msg, /^Xong/);
  assert.deepEqual(writesOf(server.calls, n).filter((c) => c.body.goiTinDongBoNId === 'G02').map((c) => c.body), [KHONG_XU_LY('G02').body]);
  assert.equal(M.serverState(byGoi(server.items, 'G02')), 'noaction');
  assert.equal(r2.storage['noaction:log:DON_T02'].result, 'ĐÃ KHÔNG XỬ LÝ');
});

test('lệnh đầu sai expect → không gửi lệnh sau của đơn đó', async () => {
  const fault = (c) => (c.name === 'UpdateStatusGoiTinDongBoVanHanh' && c.body.goiTinDongBoNId === 'G01'
    ? { text: JSON.stringify({ success: true, value: { trangThai: 0, actionProcessSyncDataVanHanh: '{}' } }) } : null);
  const r = await run(makeServer(dot(), { fault }));
  assert.match(r.final.msg, /HỎNG: Bỏ duyệt \(khung phải\); chưa làm: Không xử lý/);
  assert.ok(!r.calls.some((c) => c.name === 'UpdateStatusGoiTinDongBoThiCong' && c.body.goiTinDongBoNId === 'G01'));
});

test('đơn trùng mã gói tin khi đọc → đếm vào dup, cảnh báo trong câu kết quả, chỉ gửi một lần', async () => {
  const d = dot();
  d.splice(3, 0, plain(d.find((v) => v.goiTinDongBoNId === 'G06')));
  const r = await run(makeServer(d));
  assert.equal(r.final.dup, 1);
  assert.match(r.final.msg, /⚠ Danh sách bị thay đổi trong lúc đọc \(1 đơn đọc trùng\)/);
  assert.equal(writesOf(r.calls).filter((c) => c.body.goiTinDongBoNId === 'G06').length, 1);
});

test('mỗi tab một công cụ: Gỡ duyệt đang chạy thì Không xử lý hết bị từ chối', async () => {
  const server = makeServer(dot(), { delay: { list: 10 } });
  const b = boot({ files: [...NEW_FILES, 'tools/undo/rules.js', 'tools/undo/tool.js', 'tools/noaction/rules.js', 'tools/noaction/tool.js', NEW_RUNNER], server, ctxType: 'vbdlis3:ctx' });
  assert.equal((await b.send({ cmd: 'apiStart', tool: 'undo' })).error, '');
  const r = await b.send(START);
  assert.equal(r.error, 'Đang chạy rồi');
  assert.equal(r.tool, 'undo');
  await b.finish();
});

test('tăng tốc an toàn: đọc tới 6, gửi tới 6, không lúc nào quá 6, không chồng nhau', async () => {
  const server = makeServer(dot(), { delay: { list: 8, write: 8 } });
  const r = await runOnce({ files: FILES, server, ctxType: 'vbdlis3:ctx', start: START, patch: 'ADX_CONFIG.api.runPageSize = 2;' });
  assert.match(r.final.msg, /^Xong/);
  assert.equal(server.load.maxRead, 3);
  assert.equal(server.load.maxWrite, 6);
  assert.ok(server.load.max <= 6);
  assert.equal(server.load.overlap, false);
});

test('Dừng lúc đang đọc → không gửi lệnh ghi nào', async () => {
  const server = makeServer(dot(), { delay: { list: 30 } });
  const b = boot({ files: FILES, server, ctxType: 'vbdlis3:ctx' });
  await b.send(START);
  await new Promise((r) => setTimeout(r, 10));
  await b.send({ cmd: 'apiStop' });
  assert.match((await b.finish()).msg, /^Đã dừng/);
  assert.equal(writesOf(server.calls).length, 0);
});

test('đăng ký: id = tiền tố khoá, readBeforeWrite bật (lõi chặn mọi lệnh ghi trước khi đọc xong)', () => {
  const t = loadScripts([...NEW_CORE, 'tools/noaction/rules.js', 'tools/noaction/tool.js']).get("ADXTools.get('noaction')");
  assert.equal(t.readBeforeWrite, true);
  assert.equal(t.log.results.unknown.text, 'KIỂM TRA TAY');
});

test('Side Panel: tiến độ và ô số', () => {
  const p = loadScripts([...NEW_CORE, 'tools/noaction/rules.js', 'tools/noaction/tool.js']).get("ADXTools.get('noaction').panel");
  const s = { running: true, step: 'read', pos: 5, total: 20, counts: { change: 0, skip: 1, unknown: 2 }, wDone: 0, wTotal: 0 };
  assert.deepEqual(plain(p.progress(s)), { text: 'Bước 1/2 · Đang đọc hồ sơ 5 / 20', pct: 25 });
  assert.deepEqual(plain(p.progress({ ...s, step: 'write', wDone: 3, wTotal: 4 })), { text: 'Bước 2/2 · Đang Không xử lý 3 / 4 đơn', pct: 75 });
  assert.deepEqual(plain(p.counters(s).map((c) => c.value)), [0, 2, 1]);
  assert.ok(p.note(s).startsWith('"Cần kiểm tra tay"'));
});
