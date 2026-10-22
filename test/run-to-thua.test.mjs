// Duyệt đơn (run): khung trái luôn Thêm vào dữ liệu vận hành (khi được duyệt); khung phải chỉ Cập nhật lịch sử các bản ghi
// trùng số tờ / số thửa với khung trái, bản ghi không trùng để nguyên. Không bản ghi nào có số tờ / số thửa (hoặc khung
// phải trống) → chỉ Thêm vào, khung phải để nguyên. Luật mới, không có bản cũ để so.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts, plain, NEW_CORE } from './lib/vm.mjs';
import { makeServer, runOnce, isWrite, NEW_FILES, NEW_RUNNER } from './lib/fake-mplis.mjs';

const RR = loadScripts([...NEW_CORE, 'tools/run/rules.js']).get('ADXRules.run');
const thua = (list) => ({ ListThuaDat: list.map(([soTo, soThua]) => ({ soTo, soThua })) });
// Đơn chưa xử lý; right = danh sách bản ghi khung phải (mã 100, 101, …), mỗi bản ghi là TaiSan (null = không có mục tài sản)
function don(left, right, extra = {}) {
  return {
    goiTinDongBoNId: 'T1', trangThaiGoiTinDongBo: 0, tinhHinhDangKyVanHanhIds: right.map((_, i) => 100 + i),
    ThongTinDangKyThiCong: { ActionProcessSyncData: 0, TinhHinhDangKy: { maDon: 'DON_T1' }, ChuSoHuu: { ListCaNhan: [{ hoTen: 'Tên Giả' }] }, TaiSan: thua(left), ...extra.tc },
    ThongTinDangKyVanHanh: right.map((ts, i) => ({ ActionProcessSyncData: 0, TinhHinhDangKy: { tinhHinhDangKyId: 100 + i }, ...(ts && { TaiSan: ts }), ...extra.vh })),
  };
}
const THEM_VAO = ['UpdateStatusGoiTinDongBoThiCong', { goiTinDongBoNId: 'T1', actionProcessSyncDataThiCong: 1, trangThai: 1, processSyncDatas: [] }];
const LICH_SU = (ids) => ['UpdateStatusGoiTinDongBoVanHanh', { goiTinDongBoNId: 'T1', processSyncDatas: ids.map((id) => ({ actionProcessSyncData: 3, tinhHinhDangKyId: id })), trangThai: 1 }];
const reqsOf = (v) => plain(RR.planFor(v, RR.decide(v))).reqs.map((r) => [r.name, r.body]);
// Lệnh mong đợi khi duyệt: Thêm vào, rồi Cập nhật lịch sử đúng các mã `ids` (rỗng = không gửi lệnh khung phải)
const duyet = (ids) => (ids.length ? [THEM_VAO, LICH_SU(ids)] : [THEM_VAO]);

// [tên, đơn, mã bản ghi được Cập nhật lịch sử, lý do thêm (ghi chú log)]
const CASES = [
  ['1 bản ghi trùng tờ / thửa', don([['27', '125']], [thua([['27', '125']])]), [100], undefined],
  ['1 bản ghi khác thửa → chỉ Thêm vào, khung phải để nguyên', don([['27', '125']], [thua([['27', '126']])]), [], /^Không bản ghi khung phải nào trùng tờ \/ thửa/],
  ['1 bản ghi khác tờ → chỉ Thêm vào', don([['27', '125']], [thua([['28', '125']])]), [], /^Không bản ghi/],
  ['"027" = "27" (so theo số)', don([['027', '125']], [thua([['27', '0125']])]), [100], undefined],
  ['khung phải không có mục tài sản → chỉ Thêm vào, khung phải để nguyên', don([['27', '125']], [null]), [], /^Khung phải không có số tờ \/ số thửa/],
  ['2 bản ghi đều không có tờ / thửa → để nguyên cả hai', don([['27', '125']], [null, null]), [], /^Khung phải không có số tờ/],
  ['khung phải trống → chỉ Thêm vào (như cũ)', don([['27', '125']], []), [], undefined],
  ['2 bản ghi, 1 trùng → chỉ bản ghi đó', don([['27', '125']], [thua([['30', '5']]), thua([['27', '125']])]), [101], /^Cập nhật lịch sử 1\/2 bản ghi/],
  ['2 bản ghi, bản ghi kia không có tờ / thửa → để nguyên', don([['27', '125']], [null, thua([['27', '125']])]), [101], /^Cập nhật lịch sử 1\/2/],
  ['2 bản ghi đều trùng → cả hai (như cũ)', don([['27', '125']], [thua([['27', '125']]), thua([['27', '125']])]), [100, 101], undefined],
  ['2 bản ghi, không bản ghi nào trùng → chỉ Thêm vào', don([['27', '125']], [thua([['30', '5']]), thua([['27', '126']])]), [], /^Không bản ghi/],
  ['nhiều thửa, chia ở hai bản ghi, khác thứ tự → cả hai', don([['1', '2'], ['1', '3']], [thua([['1', '3']]), thua([['1', '2']])]), [100, 101], undefined],
  ['nhiều thửa, khung phải chỉ có một thửa → bản ghi đó', don([['1', '2'], ['1', '3']], [thua([['1', '2']])]), [100], undefined],
  ['bản ghi có thêm thửa không thuộc đơn → không trùng', don([['1', '2']], [thua([['1', '2'], ['1', '9']])]), [], /^Không bản ghi/],
  ['"tờ / thửa cũ" khác nhưng tờ / thửa hiện tại trùng',
    don([['27', '125']], [{ ListThuaDat: [{ soHieuToBanDo: '27', soThuTuThua: '125', soHieuToBanDoCu: '9', soThuTuThuaCu: '99' }] }]), [100], undefined],
];

for (const [name, v, ids, why] of CASES) {
  test(`tờ / thửa: ${name}`, () => {
    const d = RR.decide(v);
    assert.equal(d.status, 'approve', d.reasons.join(' | '));
    assert.deepEqual(reqsOf(v), duyet(ids));
    if (why) assert.match(d.reasons[1], why);
    else assert.equal(d.reasons.length, 1, 'không có lý do thêm');
  });
}

test('các luật trước vẫn đứng trước: đã bị Bỏ duyệt → Kiểm tra tay; khung phải có GCN → Không xử lý', () => {
  const khac = (extra) => RR.decide(don([['27', '125']], [thua([['27', '126']])], extra));
  assert.equal(khac({ tc: { ActionProcessSyncData: -1 } }).status, 'unknown');
  const g = khac({ vh: { ListGiayChungNhan: [{ soPhatHanh: 'AA 000001' }] } });
  assert.equal(g.status, 'reject');
  assert.match(g.reasons[0], /^Khung phải đã có Giấy chứng nhận/);
});

test('expect của lệnh khung phải chỉ gồm bản ghi trùng; lý do ghi tờ / thửa hai bên', () => {
  const v = don([['27', '125']], [thua([['30', '5']]), thua([['27', '125']])]);
  const d = RR.decide(v);
  assert.deepEqual(plain(RR.planFor(v, d)).reqs[1].expect, { trangThai: 1, vanHanh: { ids: [101], action: 3 } });
  assert.equal(d.reasons[1], 'Cập nhật lịch sử 1/2 bản ghi khung phải trùng tờ / thửa, bản ghi khác để nguyên (trái: tờ 27, thửa 125; phải: tờ 30, thửa 5; tờ 27, thửa 125)');
});

// ---------------------------------------------------------------- chạy trên máy chủ giả
const go = (server) => runOnce({ files: [...NEW_FILES, 'tools/run/rules.js', 'tools/run/tool.js', NEW_RUNNER], server, ctxType: 'vbdlis3:ctx', start: { cmd: 'apiStart', tool: 'run' } });

test('máy chủ giả: chỉ bản ghi trùng thành lịch sử, bản ghi kia giữ nguyên; log ghi lý do; chạy lại không gửi gì', async () => {
  const server = makeServer([don([['27', '125']], [thua([['30', '5']]), thua([['27', '125']])])]);
  const r = await go(server);
  assert.match(r.final.msg, /^Xong/);
  assert.deepEqual(r.calls.filter(isWrite).map((c) => [c.name, plain(c.body)]), [THEM_VAO, LICH_SU([101])]);
  const v = server.items[0];
  assert.equal(v.trangThaiGoiTinDongBo, 1);
  assert.deepEqual(v.ThongTinDangKyVanHanh.map((h) => h.ActionProcessSyncData), [0, 3]);
  assert.equal(r.storage['run:log:DON_T1'].result, 'ĐƯỢC DUYỆT');
  assert.match(r.storage['run:log:DON_T1'].note, /^Cập nhật lịch sử 1\/2 bản ghi/);
  const n = server.calls.length;
  await go(server);
  assert.equal(server.calls.slice(n).filter(isWrite).length, 0);
});

test('máy chủ giả: không bản ghi nào trùng → chỉ Thêm vào, khung phải giữ nguyên', async () => {
  const server = makeServer([don([['27', '125']], [thua([['27', '126']])])]);
  const r = await go(server);
  assert.deepEqual(r.calls.filter(isWrite).map((c) => [c.name, plain(c.body)]), [THEM_VAO]);
  assert.equal(server.items[0].trangThaiGoiTinDongBo, 1);
  assert.deepEqual(server.items[0].ThongTinDangKyVanHanh.map((h) => h.ActionProcessSyncData), [0]);
});

// ---------------------------------------------------------------- mã đơn khung trái = mã đơn khung phải → không duyệt
const voiMaPhai = (...ma) => {
  const v = don([['27', '125']], ma.map(() => thua([['27', '125']])));
  v.ThongTinDangKyVanHanh.forEach((h, i) => { h.TinhHinhDangKy.maDon = ma[i]; });
  return v;
};
test('mã đơn trái = mã đơn một bản ghi phải (không phân biệt hoa / thường, khoảng trắng) → KHÔNG DUYỆT, chỉ Không xử lý', () => {
  for (const v of [voiMaPhai('DON_T1'), voiMaPhai('1585', ' don_t1 ')]) {
    const d = RR.decide(v);
    assert.equal(d.status, 'reject');
    assert.equal(d.reasons[0], 'Mã đơn khung trái trùng mã đơn khung phải (DON_T1)');
    assert.deepEqual(reqsOf(v), [['UpdateStatusGoiTinDongBoThiCong', { goiTinDongBoNId: 'T1', actionProcessSyncDataThiCong: 0, trangThai: 1, processSyncDatas: [] }]]);
  }
});
test('mã đơn phải khác (hoặc không có) → không ảnh hưởng', () => {
  assert.equal(RR.decide(voiMaPhai('1585')).status, 'approve');
  assert.equal(RR.decide(voiMaPhai('')).status, 'approve');
});
test('có GCN vẫn đứng trước: lý do là GCN', () => {
  const v = voiMaPhai('DON_T1');
  v.ThongTinDangKyVanHanh[0].ListGiayChungNhan = [{ soPhatHanh: 'AA 000001' }];
  assert.match(RR.decide(v).reasons[0], /^Khung phải đã có Giấy chứng nhận/);
});
