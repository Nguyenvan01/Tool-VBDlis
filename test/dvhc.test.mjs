// Công cụ "Duyệt ĐVHC 2 cấp" (dvhc): bảng luật, lệnh gửi đúng body / expect, và chạy trên máy chủ giả.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts, readJson, plain, NEW_CORE } from './lib/vm.mjs';
import { makeServer, runOnce, boot, isWrite, NEW_FILES, NEW_RUNNER, TOKEN } from './lib/fake-mplis.mjs';

const N = loadScripts([...NEW_CORE, 'tools/dvhc/rules.js']);
const M = N.get('ADXModel');
const R = N.get('ADXRules.dvhc');
const CASES = readJson('test/fixtures/dvhc.json');
const plan = (v) => plain(R.dvhcFor(v, M.info(v)));

// Lệnh mong đợi – viết thẳng body / expect theo docs/KIEN_TRUC.md mục 10 (không dựng bằng hàm của lõi)
const THEM_VAO = (goi) => ({
  name: 'UpdateStatusGoiTinDongBoThiCong', label: 'Thêm vào dữ liệu vận hành',
  body: { goiTinDongBoNId: goi, actionProcessSyncDataThiCong: 1, trangThai: 1, processSyncDatas: [] },
  expect: { trangThai: 1, thiCong: 1 },
});
const LICH_SU = (goi, ids) => ({
  name: 'UpdateStatusGoiTinDongBoVanHanh', label: ids.length > 1 ? `Cập nhật lịch sử (${ids.length} bản ghi)` : 'Cập nhật lịch sử',
  body: { goiTinDongBoNId: goi, processSyncDatas: ids.map((id) => ({ actionProcessSyncData: 3, tinhHinhDangKyId: id })), trangThai: 1 },
  expect: { trangThai: 1, vanHanh: { ids, action: 3 } },
});
const KHONG_XU_LY = (goi) => ({
  name: 'UpdateStatusGoiTinDongBoThiCong', label: 'Không xử lý',
  body: { goiTinDongBoNId: goi, actionProcessSyncDataThiCong: 0, trangThai: 1, processSyncDatas: [] },
  expect: { trangThai: 1, thiCong: 0 },
});
function expected(kind, v) {
  const goi = v.goiTinDongBoNId;
  const ids = v.tinhHinhDangKyVanHanhIds;
  if (kind === 'approve') return ids.length ? [THEM_VAO(goi), LICH_SU(goi, ids)] : [THEM_VAO(goi)];
  if (kind === 'reject') return [KHONG_XU_LY(goi)];
  return [];
}

test('bảng luật đủ các trường hợp; dữ liệu mẫu chỉ có tên giả', () => {
  for (const k of ['approve', 'reject', 'skip', 'unknown']) assert.ok(CASES.some((c) => c.kind === k), k);
  assert.ok(CASES.some((c) => c.kind === 'approve' && c.v.tinhHinhDangKyVanHanhIds.length > 1), 'khung phải nhiều bản ghi');
});

for (const { name, kind, v } of CASES) {
  test(`${kind}: ${name}`, () => {
    const p = plan(v);
    assert.equal(p.kind, kind, p.label);
    assert.deepEqual(p.reqs, expected(kind, v));
    if (kind === 'reject') assert.match(p.reason, /số phát hành khác|tên chủ khác|khung phải không khớp/);
    if (kind === 'unknown') assert.match(p.label, /kiểm tra tay$/);
  });
}

test('tên chủ phân biệt hoa / thường; số phát hành không phân biệt hoa / thường và khoảng trắng', () => {
  assert.match(plan(CASES.find((c) => c.v.goiTinDongBoNId === 'V04').v).reason, /^tên chủ khác/);
  assert.deepEqual(plain(R.soPhatHanh({ a: [{ SoPhatHanh: ' ab 12 ' }, { soPhatHanh: '-' }, { soPhatHanh: '' }] })), ['AB12']);
});

// ---------------------------------------------------------------- lỗi "khung phải nhiều số phát hành" (18/10/2026)
// Lỗi cũ: dò soPhatHanh trong CẢ khung phải nên vớ cả số nằm ngoài mục Giấy chứng nhận (VD trong tài sản) – trên trang
// không có. Số lạ đặt ở chỗ khác nhau; tên giả, số lấy theo các đơn thật trong log duyet-dvhc_20261018-1159.csv.
const LA_15 = ['CC109407', 'CX489025', 'CX491665', 'DQ922291', 'CG483176', 'DN097258', 'CC109408', 'DP687124',
  'DC255258', 'DI871497', 'DC138451', 'AA01899914', 'AA02029425', 'DC007322'];
function don({ trai, phai, la = [], chuPhai = 'Lê Minh An', banGhi = 1 }) {
  const gcn = (xs) => xs.map((soPhatHanh) => ({ soPhatHanh }));
  const strays = { TaiSan: { ListThuaDat: [{ soTo: '2', soThua: '323', ListGiayChungNhan: gcn(la.slice(0, 1)) }] },
    LichSu: [{ GiayChungNhanCu: gcn(la.slice(1)) }] };
  const ids = Array.from({ length: banGhi }, (_, i) => 900 + i);
  return {
    goiTinDongBoNId: 'VX', trangThaiGoiTinDongBo: 0, tinhHinhDangKyVanHanhIds: ids,
    ThongTinDangKyThiCong: { ActionProcessSyncData: 0, TinhHinhDangKy: { maDon: 'DON_VX' },
      ChuSoHuu: { ListCaNhan: [{ hoTen: 'Lê Minh An' }] }, ListGiayChungNhan: gcn(trai) },
    ThongTinDangKyVanHanh: ids.map((id, i) => ({ ActionProcessSyncData: 0, TinhHinhDangKy: { tinhHinhDangKyId: id },
      ChuSoHuu: { ListCaNhan: [{ hoTen: chuPhai }] }, ListGiayChungNhan: gcn(phai[i] || []), ...strays })),
  };
}

test('khung phải nhiều số phát hành: số ngoài mục Giấy chứng nhận không tính', () => {
  // 000416.CN.002: trên trang cả hai chỉ có DN 174875, số lạ DG859608 → trước bị Không xử lý, nay duyệt
  const v1 = don({ trai: ['DN 174875'], phai: [['DN 174875']], la: ['DG859608'] });
  assert.ok(plain(R.soPhatHanh(v1.ThongTinDangKyVanHanh)).includes('DG859608'), 'dữ liệu mẫu có số lạ (cách dò cũ vớ phải)');
  assert.equal(plan(v1).kind, 'approve');
  assert.equal(plan(v1).reason, 'trùng số phát hành DN174875 và tên chủ');
  // 000369.CN.001: số lạ 14 số
  assert.equal(plan(don({ trai: ['DN 174144'], phai: [['DN 174144']], la: LA_15 })).kind, 'approve');
  // Cả hai mục Giấy chứng nhận trống, khung phải chỉ có số lạ → coi như cả hai không có số → so tên chủ
  assert.equal(plan(don({ trai: [], phai: [[]], la: ['DG859608'] })).reason, 'cả hai khung không có số phát hành, trùng tên chủ');
  assert.equal(plan(don({ trai: [], phai: [[]], la: ['DG859608'], chuPhai: 'Lê Minh Ân' })).kind, 'reject');
  // Số lạ TRÙNG số khung trái nhưng mục Giấy chứng nhận khung phải trống → KHÔNG được duyệt nhờ số lạ
  const p = plan(don({ trai: ['DG859608'], phai: [[]], la: ['DG859608'] }));
  assert.equal(p.kind, 'reject');
  assert.match(p.reason, /^số phát hành khác \(trái: DG859608; phải: không có\)/);
  // Khung phải thật sự nhiều số TRONG mục Giấy chứng nhận → vẫn Không xử lý, ghi chú chỉ nêu số trên trang
  const q = plan(don({ trai: ['DN 174144'], phai: [['DN 174144', 'CC 109407']], la: LA_15 }));
  assert.equal(q.kind, 'reject');
  assert.equal(q.reason, 'số phát hành khác (trái: DN174144; phải: DN174144, CC109407)');
  // Khung phải 2 bản ghi, gộp số Giấy chứng nhận của cả hai = khung trái → duyệt, Cập nhật lịch sử cả 2 bản ghi
  const v2 = don({ trai: ['AA 01', 'AA 02'], phai: [['AA 01'], ['AA 02']], la: LA_15, banGhi: 2 });
  assert.deepEqual(plan(v2).reqs, [THEM_VAO('VX'), LICH_SU('VX', [900, 901])]);
});

// ---------------------------------------------------------------- chạy trên máy chủ giả
const FILES = [...NEW_FILES, 'tools/dvhc/rules.js', 'tools/dvhc/tool.js', NEW_RUNNER];
const START = { cmd: 'apiStart', tool: 'dvhc' };
const dot = () => CASES.map((c) => plain(c.v));
const run = (server, patch) => runOnce({ files: FILES, server, ctxType: 'vbdlis3:ctx', start: START, patch });
const writesOf = (calls, from = 0) => calls.slice(from).filter(isWrite);
const byMaDon = (items, maDon) => items.find((x) => M.info(x).maDon === maDon);

test('chạy hết: đọc hết rồi mới gửi, đúng lệnh từng đơn, trạng thái trên máy chủ đúng, log + log lần chạy đúng khoá', async () => {
  const server = makeServer(dot());
  const before = plain(server.items);
  const r = await run(server);
  // V14 đã Không xử lý mà trùng → đánh lại thành duyệt; V13 đã duyệt đúng → không gửi gì
  assert.match(r.final.msg, /^Xong – đã duyệt 8 đơn, Không xử lý 6 đơn \(trong đó đánh lại 2 đơn đánh nhầm\), 1 đơn đã đúng/);
  const firstWrite = r.calls.findIndex(isWrite);
  assert.ok(firstWrite > 0 && r.calls.map((c) => !isWrite(c)).lastIndexOf(true) < firstWrite, 'đọc hết rồi mới gửi');
  for (const v0 of before) {
    const p = plain(R.planFor(v0, M.info(v0)));
    const v1 = byMaDon(r.items, M.info(v0).maDon);
    const sent = writesOf(r.calls).filter((c) => v0.goiTinDongBoNId && c.body.goiTinDongBoNId === v0.goiTinDongBoNId);
    assert.deepEqual(sent.map((c) => c.body), p.reqs.map((q) => q.body), `${v0.goiTinDongBoNId}: đúng lệnh, đúng thứ tự`);
    if (p.kind === 'approve') {
      assert.equal(M.serverState(v1), 'approved');
      assert.ok(M.vhActions(v1).every((a) => a === 3));
    } else if (p.kind === 'reject') assert.equal(M.serverState(v1), 'noaction');
    else assert.deepEqual(plain(v1), v0, `${v0.goiTinDongBoNId} không bị đụng tới`);
  }
  assert.deepEqual(plain(r.final.counts), { approve: 8, reject: 6, fix: 2, ok: 1, unknown: 1 });
  assert.equal(r.storage['dvhc:log:DON_V02'].result, 'ĐƯỢC DUYỆT');
  assert.equal(r.storage['dvhc:log:DON_V02'].soTo, '12');
  assert.equal(r.storage['dvhc:log:DON_V04'].result, 'KHÔNG DUYỆT');
  assert.equal(r.storage['dvhc:log:DON_V12'].result, 'ĐƯỢC DUYỆT');
  assert.match(r.storage['dvhc:log:DON_V12'].note, /^sửa từ "đã Bỏ duyệt"/);
  assert.equal(r.storage['dvhc:job'].tool, 'dvhc');
  assert.ok(r.storage['dvhc:job'].entries.length >= 9);
  // Log lần chạy có đủ: đơn thiếu mã đơn (khoá bằng mã gói tin) vẫn được xét luật, và đơn đã đúng (chỉ ở log lần chạy)
  const job = r.storage['dvhc:job'].entries;
  const v10 = job.find((e) => e.maDon === '(gói tin V10)');
  assert.equal(v10.result, 'ĐƯỢC DUYỆT');
  assert.equal(job.find((e) => e.maDon === 'DON_V13').result, 'ĐÃ ĐÚNG');
  assert.match(r.storage['dvhc:log:DON_V14'].note, /^sửa từ "đã Không xử lý"/);
  assert.equal(r.storage['dvhc:log:DON_V13'], undefined);
  // Bất biến 1: khoá đúng tiền tố, không có token / listBody
  assert.ok(Object.keys(r.storage).every((k) => k.startsWith('dvhc:')));
  assert.ok(!JSON.stringify(r.storage).includes(TOKEN) && !JSON.stringify(r.storage).includes('requestQueries'));
});

test('chạy hai lần liên tiếp: lần hai không gửi lệnh nào', async () => {
  const server = makeServer(dot());
  await run(server);
  const n = server.calls.length;
  const r2 = await run(server);
  assert.equal(writesOf(server.calls, n).length, 0);
  assert.equal(r2.final.counts.approve + r2.final.counts.reject, 0);
});

test('lệnh thứ hai (Cập nhật lịch sử) sai expect → KIỂM TRA TAY kèm đã làm / HỎNG, dừng cả lượt', async () => {
  const fault = (c) => (c.name === 'UpdateStatusGoiTinDongBoVanHanh' && c.body.goiTinDongBoNId === 'V02'
    ? { text: JSON.stringify({ success: true, value: { trangThai: 1, actionProcessSyncDataVanHanh: '{}' } }) } : null);
  const r = await run(makeServer(dot(), { fault }));
  assert.match(r.final.msg, /^Lỗi: Đơn DON_V02: đã làm: Thêm vào dữ liệu vận hành; HỎNG: Cập nhật lịch sử \(2 bản ghi\)/);
  const e = r.storage['dvhc:log:DON_V02'];
  assert.equal(e.result, 'KIỂM TRA TAY');
  assert.match(e.note, /^Quyết định ban đầu: ĐƯỢC DUYỆT/);
});

test('mỗi tab một công cụ; tăng tốc trong giới hạn; Dừng lúc đọc không gửi gì', async () => {
  let server = makeServer(dot(), { delay: { list: 8, write: 8 } });
  const r = await run(server, 'ADX_CONFIG.api.runPageSize = 2;');
  assert.match(r.final.msg, /^Xong/);
  assert.ok(server.load.maxRead <= 3 && server.load.maxWrite <= 6 && server.load.max <= 6);
  assert.equal(server.load.overlap, false);

  server = makeServer(dot(), { delay: { list: 30 } });
  const b = boot({ files: FILES, server, ctxType: 'vbdlis3:ctx' });
  await b.send(START);
  assert.equal((await b.send({ cmd: 'apiStart', tool: 'dvhc' })).error, 'Đang chạy rồi');
  await new Promise((res) => setTimeout(res, 10));
  await b.send({ cmd: 'apiStop' });
  assert.match((await b.finish()).msg, /^Đã dừng/);
  assert.equal(writesOf(server.calls).length, 0);
});

test('đăng ký và Side Panel', () => {
  const t = loadScripts([...NEW_CORE, 'tools/dvhc/rules.js', 'tools/dvhc/tool.js']).get("ADXTools.get('dvhc')");
  assert.equal(t.readBeforeWrite, true);
  assert.equal(t.log.results.unknown.text, 'KIỂM TRA TAY');
  const s = { running: true, step: 'write', pos: 14, total: 14, counts: { approve: 1, reject: 2, fix: 1, ok: 4, unknown: 3 }, wDone: 3, wTotal: 8 };
  assert.deepEqual(plain(t.panel.progress(s)), { text: 'Bước 2/2 · Đang gửi lệnh 3 / 8 đơn', pct: 38 });
  assert.deepEqual(plain(t.panel.counters(s).map((c) => c.value)), [1, 2, 1, 4, 3]);
});

// ---------------------------------------------------------------- Sửa đơn đánh nhầm (sua)
// Đặt đơn mẫu vào trạng thái "đã xử lý": dat(v, 'approved', [3, 0]) / dat(v, 'noaction')
function dat(v0, s, vh) {
  const v = plain(v0);
  v.trangThaiGoiTinDongBo = 1;
  v.ThongTinDangKyThiCong.ActionProcessSyncData = s === 'approved' ? 1 : 0;
  v.ThongTinDangKyVanHanh.forEach((h, i) => { h.ActionProcessSyncData = vh ? vh[i] : s === 'approved' ? 3 : 0; });
  return v;
}
const caseOf = (goi) => CASES.find((c) => c.v.goiTinDongBoNId === goi).v;
const sua = (v) => plain(R.suaFor(v, M.info(v)));

test('sửa: luật từng trạng thái', () => {
  // Không xử lý nhầm (trùng) → Bỏ duyệt khung trái → Thêm vào → Cập nhật lịch sử (khung phải chưa Cập nhật lịch sử: không gỡ)
  const a = sua(dat(caseOf('V06'), 'noaction'));
  assert.equal(a.kind, 'approve');
  assert.deepEqual(a.reqs.map((r) => r.label), ['Bỏ duyệt (khung trái)', 'Thêm vào dữ liệu vận hành', 'Cập nhật lịch sử']);
  assert.deepEqual(a.reqs[0].body, { goiTinDongBoNId: 'V06', actionProcessSyncDataThiCong: -1, trangThai: 0, processSyncDatas: [] });
  // Duyệt nhầm (khác tên chủ) → Bỏ duyệt khung phải → Bỏ duyệt khung trái → Không xử lý
  const b = sua(dat(caseOf('V04'), 'approved'));
  assert.equal(b.kind, 'reject');
  assert.deepEqual(b.reqs.map((r) => r.label), ['Bỏ duyệt (khung phải)', 'Bỏ duyệt (khung trái)', 'Không xử lý']);
  assert.deepEqual(b.reqs[0].body, { goiTinDongBoNId: 'V04', processSyncDatas: [{ actionProcessSyncData: -1, tinhHinhDangKyId: 401 }], trangThai: 0 });
  assert.match(b.reason, /^sửa từ "đã thêm vào dữ liệu vận hành": tên chủ khác/);
  // Duyệt dở (khung phải mới Cập nhật lịch sử 1/2 bản ghi) → gỡ cả hai rồi duyệt lại
  assert.deepEqual(sua(dat(caseOf('V02'), 'approved', [3, 0])).reqs.map((r) => r.label),
    ['Bỏ duyệt (khung phải)', 'Bỏ duyệt (khung trái)', 'Thêm vào dữ liệu vận hành', 'Cập nhật lịch sử (2 bản ghi)']);
  // Không xử lý nhưng khung phải lại có Cập nhật lịch sử → gỡ phải, gỡ trái, Không xử lý
  assert.equal(sua(dat(caseOf('V05'), 'noaction', [3])).reqs.length, 3);
  // Đã đúng / chưa xử lý / lỗi mã → không gửi gì
  assert.equal(sua(dat(caseOf('V01'), 'approved')).kind, 'ok');
  assert.equal(sua(dat(caseOf('V05'), 'noaction')).kind, 'ok');
  assert.equal(sua(caseOf('V01')).kind, 'skip');
  assert.equal(sua(caseOf('V12')).kind, 'skip');
  // Khung phải không khớp: đã Không xử lý = đúng; đã duyệt → gỡ đúng bản ghi đang Cập nhật lịch sử (mã của chính bản ghi) → Không xử lý
  assert.equal(sua(dat(caseOf('V11'), 'noaction')).kind, 'ok');
  const c = sua(dat(caseOf('V11'), 'approved'));
  assert.equal(c.kind, 'reject');
  assert.deepEqual(c.reqs[0].body.processSyncDatas, [{ actionProcessSyncData: -1, tinhHinhDangKyId: 1101 }]);
  assert.deepEqual(c.reqs.slice(1).map((r) => r.label), ['Bỏ duyệt (khung trái)', 'Không xử lý']);
  for (const v of [dat(caseOf('V01'), 'approved'), caseOf('V01')]) assert.deepEqual(sua(v).reqs, []);
  // Bỏ duyệt dở (khung trái -1, khung phải còn Cập nhật lịch sử), không khớp → Bỏ duyệt phải → Không xử lý
  const g = plain(caseOf('V04'));
  g.ThongTinDangKyThiCong.ActionProcessSyncData = -1;
  g.ThongTinDangKyVanHanh[0].ActionProcessSyncData = 3;
  const pg = plain(R.planFor(g, M.info(g)));
  assert.deepEqual([pg.kind, pg.fix, pg.reqs.map((r) => r.label)], ['reject', true, ['Bỏ duyệt (khung phải)', 'Không xử lý']]);
});

test('một nút: duyệt đơn mới + đánh lại đơn sai trên máy chủ giả, chạy lại không gửi gì', async () => {
  const items = [dat(caseOf('V06'), 'noaction'), dat(caseOf('V04'), 'approved'), dat(caseOf('V02'), 'approved', [3, 0]),
    dat(caseOf('V01'), 'approved'), dat(caseOf('V05'), 'noaction'), plain(caseOf('V03'))];
  const server = makeServer(items);
  const go = () => runOnce({ files: FILES, server, ctxType: 'vbdlis3:ctx', start: START });
  const r = await go();
  // V03 chưa xử lý → duyệt bình thường, trong cùng một lần bấm
  assert.match(r.final.msg, /^Xong – đã duyệt 3 đơn, Không xử lý 1 đơn \(trong đó đánh lại 3 đơn đánh nhầm\), 2 đơn đã đúng/);
  const st = (goi) => M.serverState(server.items.find((x) => x.goiTinDongBoNId === goi));
  assert.deepEqual(['V06', 'V04', 'V02', 'V01', 'V05', 'V03'].map(st), ['approved', 'noaction', 'approved', 'approved', 'noaction', 'approved']);
  assert.ok(M.vhActions(server.items.find((x) => x.goiTinDongBoNId === 'V04')).every((a) => a === -1));
  assert.ok(M.vhActions(server.items.find((x) => x.goiTinDongBoNId === 'V02')).every((a) => a === 3));
  // Ghi chung nhật ký Duyệt ĐVHC: kết quả mới ghi đè
  assert.equal(r.storage['dvhc:log:DON_V04'].result, 'KHÔNG DUYỆT');
  assert.equal(r.storage['dvhc:log:DON_V06'].result, 'ĐƯỢC DUYỆT');
  const n = server.calls.length;
  await go();
  assert.equal(writesOf(server.calls, n).length, 0);
});
