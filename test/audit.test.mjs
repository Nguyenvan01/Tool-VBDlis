// Công cụ Quét và sửa lỡ duyệt GCN (audit): cả lần chạy trên máy chủ giả = auditFix của bản Duyệt 2.1.3; CSV bảng lỡ duyệt = bản cũ.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts, readJson, read, plain, NEW_CORE, LEGACY_DUYET } from './lib/vm.mjs';
import { makeDot, makeServer, runOnce, isWrite, NEW_FILES, NEW_RUNNER, legacyFiles, TOKEN } from './lib/fake-mplis.mjs';
import { legacy } from './lib/golden.mjs';

const NEW = [...NEW_FILES, 'tools/run/rules.js', 'tools/run/tool.js', 'tools/audit/tool.js', NEW_RUNNER];
const runNew = (server) => runOnce({ files: NEW, server, ctxType: 'vbdlis3:ctx', start: { cmd: 'apiStart', tool: 'audit' } });
const runOld = (server) => runOnce({ files: legacyFiles(LEGACY_DUYET), server, ctxType: 'adx:ctx', start: { cmd: 'apiStart', mode: 'audit' } });

const writes = (calls) => calls.filter(isWrite).map((c) => JSON.stringify([c.name, c.body])).sort();
const noTime = (s) => s.replace(/trong \d+ (phút \d+ )?giây/, 'trong … giây');
const pick = (s) => plain({ audit: s.audit, counts: s.counts, pos: s.pos, total: s.total, scope: s.scope, running: s.running, stopping: s.stopping });
// Kết quả quét đã lưu: bỏ giờ (lần quét, giờ sửa)
const report = (r) => r && plain({ ...r, time: '', findings: r.findings.map((f) => ({ ...f, fixed: f.fixed.replace(/^đã sửa .*/, 'đã sửa …') })) });
const logs = (storage, prefix) => Object.fromEntries(Object.entries(storage)
  .filter(([k]) => k.startsWith(prefix))
  // soTo / soThua: cột mới của bản 3 (bản cũ không có) – kiểm riêng
  .map(([k, { soTo, soThua, ...e }]) => [k.slice(prefix.length), { ...e, time: '', actionTime: '', seq: 0 }]));

// Đợt có đơn lỡ duyệt: đã duyệt mà có GCN (D18, G11), trạng thái lạ có GCN + lịch sử (D20), cùng các đơn khác
const DOT = () => [...makeDot(2, 'test/fixtures/duyet.json'), ...makeDot()];

// Kết quả một lần quét, đã bỏ phần phụ thuộc đồng hồ – dạng dùng để so và để chốt (test/golden/audit.json)
const norm = (r, auditKey, prefix) => ({
  error: r.started.error, writes: writes(r.calls), items: plain(r.items), state: pick(r.final), msg: noTime(r.final.msg),
  report: report(r.storage[auditKey]) ?? null, logs: logs(r.storage, prefix),
});

async function same(key, opts) {
  const o = await legacy('audit', key, async () => norm(await runOld(makeServer(DOT(), opts)), 'adxAudit', 'adxLog:'));
  const n = await runNew(makeServer(DOT(), opts));
  const nn = norm(n, 'audit:last', 'run:log:');
  assert.equal(nn.error, o.error);
  assert.deepEqual(nn.writes, o.writes, 'tập lệnh ghi');
  assert.deepEqual(nn.items, o.items, 'dữ liệu trên máy chủ sau khi quét');
  assert.deepEqual(nn.state, o.state, 'trạng thái cuối');
  assert.equal(nn.msg, o.msg);
  assert.deepEqual(nn.report, o.report, 'kết quả quét đã lưu');
  // Nhật ký ghi chung với Chạy tự động ("run:log:*"), như bản cũ ghi vào "adxLog:*"
  const [lo, ln] = [o.logs, nn.logs];
  assert.deepEqual(Object.keys(ln).sort(), Object.keys(lo).sort());
  for (const k of Object.keys(lo)) {
    if (lo[k].action.startsWith('LỖI')) {
      assert.equal(ln[k].result, 'KIỂM TRA TAY'); // H1
      assert.ok(ln[k].note.startsWith(`Quyết định ban đầu: ${lo[k].result} (${lo[k].note}) · `), ln[k].note);
    } else {
      assert.deepEqual(ln[k], lo[k], k);
    }
  }
  assert.ok(Object.keys(n.storage).every((k) => k.startsWith('run:') || k === 'audit:last' || k === 'audit:job'), 'khoá đúng tiền tố');
  assert.ok(!JSON.stringify(n.storage).includes(TOKEN));
  return n;
}

test('= bản cũ: quét cả đợt, sửa đơn lỡ duyệt, liệt kê đơn trạng thái lạ', async () => {
  const n = await same('quét cả đợt', {});
  const a = n.final.audit;
  assert.ok(a.wrong > 0 && a.fixed > 0 && a.manual > 0, JSON.stringify(a));
  assert.match(n.final.msg, /^Xong: quét \d+\/\d+ đơn/);
  // Đơn sửa xong: Bỏ duyệt khung phải → Không xử lý
  const d18 = n.items.find((v) => v.goiTinDongBoNId === 'D18');
  assert.deepEqual([d18.trangThaiGoiTinDongBo, d18.ThongTinDangKyThiCong.ActionProcessSyncData, ...d18.ThongTinDangKyVanHanh.map((h) => h.ActionProcessSyncData)], [1, 0, -1, -1]);
  // Cả hai kiểu lỡ duyệt đều có trong bảng
  const why = new Set(n.storage['audit:last'].findings.map((f) => f.why));
  assert.deepEqual(why, new Set(['đã Cập nhật lịch sử', 'đã Thêm vào dữ liệu vận hành']));
});

test('= bản cũ: máy chủ trả thiếu trang, đổi thứ tự sau mỗi lệnh ghi', async () => {
  await same('trang thiếu, đổi thứ tự', { maxPage: 7 });
});

test('= bản cũ: sửa một đơn hỏng → dừng hẳn, dòng LỖI trong bảng, KIỂM TRA TAY trong nhật ký', async () => {
  const fault = (c) => (c.name === 'UpdateStatusGoiTinDongBoThiCong' && c.body.goiTinDongBoNId === 'D18'
    ? { text: JSON.stringify({ success: true, value: { trangThai: 0, actionProcessSyncDataThiCong: 1 } }) } : null);
  const n = await same('sửa hỏng', { fault });
  assert.match(n.final.msg, /^Lỗi: Đơn DON_D18: đã làm: Bỏ duyệt \(khung phải\) \(2 bản ghi\); HỎNG: Không xử lý/);
  const f = n.storage['audit:last'].findings.find((x) => x.maDon === 'DON_D18');
  assert.equal(f.result, 'error');
  assert.equal(n.storage['run:log:DON_D18'].result, 'KIỂM TRA TAY');
  assert.equal(n.storage['audit:last'].complete, false);
});

test('chạy lại sau khi sửa xong: không còn gì để sửa', async () => {
  const server = makeServer(DOT());
  await runNew(server);
  const k = server.calls.length;
  const r = await runNew(server);
  assert.equal(server.calls.slice(k).filter(isWrite).length, 0);
  assert.equal(r.final.audit.fixed, 0);
});

test('Side Panel: dòng tiến độ lúc đang quét giống bản cũ', () => {
  const t = loadScripts([...NEW_CORE, 'tools/run/rules.js', 'tools/run/tool.js', 'tools/audit/tool.js']).get("ADXTools.get('audit')");
  const s = { running: true, stopping: false, total: 40, audit: { scanned: 12, wrong: 3, fixed: 2, manual: 1 } };
  // renderApi bản cũ: `${s.stopping ? 'Đang dừng…' : 'Đang quét và sửa'} · ${a.scanned}/${s.total || '?'} đơn · lỡ duyệt ${a.wrong} · đã sửa ${a.fixed}`
  assert.equal(t.panel.progress(s).text, 'Đang quét và sửa · 12/40 đơn · lỡ duyệt 3 · đã sửa 2');
  assert.equal(t.panel.progress({ ...s, stopping: true, total: 0 }).text, 'Đang dừng… · 12/? đơn · lỡ duyệt 3 · đã sửa 2');
  assert.equal(t.tab, 'Duyệt đơn');
  assert.equal(t.log, 'run');
});

test('CSV bảng lỡ duyệt = nút "Xuất CSV" của bản cũ (cột, thứ tự, chống CSV injection)', async () => {
  const t = loadScripts([...NEW_CORE, 'core/csv.js', 'tools/run/rules.js', 'tools/run/tool.js', 'tools/audit/tool.js']);
  const rep = t.get("ADXTools.get('audit').panel.report");
  const res = {
    findings: [
      { page: 1, pos: 3, maDon: 'DON_1', why: 'đã Cập nhật lịch sử', owners: '=CMD()', gcnIds: '9, 10', reason: 'Khung phải đã có Giấy chứng nhận: ListGiayChungNhan (1)', stateLabel: 'đã thêm vào dữ liệu vận hành', result: 'fixed', fixed: 'đã sửa 1/1/2026' },
      { page: 2, pos: 14, maDon: 'DON_2', why: 'đã Thêm vào dữ liệu vận hành', owners: 'A, "B"', gcnIds: '', reason: 'x', stateLabel: 'trạng thái khác (trangThai=2)', result: 'manual', fixed: '' },
      { page: 2, pos: 15, maDon: 'DON_3', why: 'đã Cập nhật lịch sử', owners: '', gcnIds: '11', reason: 'y', stateLabel: '', result: 'error', fixed: 'LỖI: hỏng' },
    ],
  };
  const got = t.get('ADXCsv').build(rep.CSV_HEAD, rep.csvRows(res));
  // Code cũ: resultOf + RESULT_TEXT + thân nút btnAuditCsv, chạy với cùng dữ liệu; so từng byte (Blob.text() tự bỏ BOM)
  const old = await legacy('audit', 'CSV bảng lỡ duyệt', async () => {
    const src = read(`legacy/${LEGACY_DUYET}/popup/popup.js`);
    const part = (from, to) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)) + to.length);
    const L = loadScripts([`legacy/${LEGACY_DUYET}/config.js`], { lastAudit: res, stamp: () => 'X', Blob });
    const out = [];
    L.ctx.download = (_name, blob) => out.push(blob);
    L.get(`${part('const resultOf =', ';\n')} ${part('const RESULT_TEXT = {', '\n};')}`);
    L.get(`(${part("$('btnAuditCsv').onclick = () => {", '\n};').replace("$('btnAuditCsv').onclick = ", '').replace(/;$/, '')})()`);
    return Buffer.from(await out[0].arrayBuffer()).toString('utf8');
  });
  assert.equal(got, old);
});
