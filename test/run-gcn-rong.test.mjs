// Cờ GCN rỗng: file quét có laGiayChungNhan = true nhưng không có tên file, mô tả, đường dẫn hay mã GCN
// (VD DON_24645745 – màn hình hiện "Giấy chứng nhận: -/-") → coi như KHÔNG có GCN, đơn chưa xử lý được duyệt,
// ghi chú riêng trong log. File quét có tên / mô tả / mã GCN vẫn là GCN → không duyệt. Luật mới, không có bản cũ để so.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts, plain, NEW_CORE } from './lib/vm.mjs';

const RR = loadScripts([...NEW_CORE, 'tools/run/rules.js']).get('ADXRules.run');
const thua = (soTo, soThua) => ({ ListThuaDat: [{ soTo, soThua }] });
// File quét đúng dạng máy chủ trả (ListHoSoQuet[].ListFileHoSoQuet.ListFileHoSoQuet[])
const file = (f) => ({
  nodeId: 'N1', deleteId: null, moTa: null, tenGiayTo: null, trichYeu: null, isOldFile: false, laGiayToVeNguonGoc: false,
  laGiayChungNhan: true, giayChungNhanId: null, workflowNodeId: null, versionGiayChungNhan: null, loaiHoSoQuet: 1, daKySo: true,
  duongDan: null, duLieu: null, GiayChungNhan: null, hoSoQuetId: 1, ...f,
});
const hoSoQuet = (files) => [{ hoSoQuetId: 1, ListFileHoSoQuet: { ListFileHoSoQuet: files } }];
// Đơn có một bản ghi khung phải trùng tờ / thửa; files = file quét của khung phải (side = 'vh') hoặc khung trái ('tc')
function don(files, { side = 'vh', state = 'pending' } = {}) {
  const q = { ListHoSoQuet: hoSoQuet(files) };
  return {
    goiTinDongBoNId: 'G1', trangThaiGoiTinDongBo: state === 'pending' ? 0 : 1, tinhHinhDangKyVanHanhIds: [100],
    ThongTinDangKyThiCong: {
      ActionProcessSyncData: 0, TinhHinhDangKy: { maDon: 'DON_G1' },
      ChuSoHuu: { ListCaNhan: [{ hoTen: 'Tên Giả' }] }, TaiSan: thua('93', '31'), ...(side === 'tc' && q),
    },
    ThongTinDangKyVanHanh: [{ ActionProcessSyncData: 0, TinhHinhDangKy: { tinhHinhDangKyId: 100 }, TaiSan: thua('93', '31'), ...(side === 'vh' && q) }],
  };
}
const NOTE = /^Bỏ qua cờ GCN rỗng ở file quét/;

test('khung phải: cờ GCN rỗng → duyệt (Thêm vào → Cập nhật lịch sử), ghi chú riêng', () => {
  const v = don([file()]);
  const d = plain(RR.decide(v));
  assert.equal(d.status, 'approve', d.reasons.join('; '));
  assert.ok(d.reasons.some((r) => NOTE.test(r)), d.reasons.join('; '));
  assert.deepEqual(plain(RR.planFor(v, d)).reqs.map((r) => r.label), ['Thêm vào dữ liệu vận hành', 'Cập nhật lịch sử']);
  assert.deepEqual(plain(RR.gcnSignals(v.ThongTinDangKyVanHanh)), []);
});

test('khung trái: cờ GCN rỗng → cũng không tính là GCN', () => {
  const d = RR.decide(don([file()], { side: 'tc' }));
  assert.equal(d.status, 'approve', d.reasons.join('; '));
  assert.ok(d.reasons.some((r) => NOTE.test(r)));
});

for (const [name, f] of [
  ['có mô tả', { moTa: 'GIẤY CHỨNG NHẬN R749062' }],
  ['có tên file', { tenGiayTo: 'GCN_R749062.pdf' }],
  ['có tên file (tenFile)', { tenFile: 'scan.pdf' }],
  ['có trích yếu', { trichYeu: 'GCN' }],
  ['có đường dẫn', { duongDan: '/1/hsq/GCN.pdf' }],
  ['có mã GCN', { giayChungNhanId: 661386 }],
  ['có phiên bản GCN', { versionGiayChungNhan: 11 }],
  ['có đối tượng GiayChungNhan', { GiayChungNhan: { giayChungNhanId: 5 } }],
]) {
  test(`file quét laGiayChungNhan ${name} → vẫn là GCN, không duyệt`, () => {
    const d = RR.decide(don([file(f)]));
    assert.equal(d.status, 'reject');
    assert.match(d.reasons[0], /^Khung phải đã có Giấy chứng nhận: .*laGiayChungNhan/);
  });
}

test('một file rỗng + một file GCN thật → không duyệt', () => {
  const d = RR.decide(don([file(), file({ moTa: 'Giấy chứng nhận AA 00944475' })]));
  assert.equal(d.status, 'reject');
});

test('cờ rỗng nhưng khung phải có dấu hiệu GCN khác (ListGiayChungNhan) → không duyệt', () => {
  const v = don([file()]);
  v.ThongTinDangKyVanHanh[0].ListGiayChungNhan = [{ soPhatHanh: 'AA 1' }];
  assert.equal(RR.decide(v).status, 'reject');
});

test('đơn đã Không xử lý có cờ rỗng → vẫn bỏ qua (không ghi đè quyết định cũ)', () => {
  const v = don([file()], { state: 'noaction' });
  const p = RR.planFor(v, RR.decide(v));
  assert.equal(p.kind, 'skip');
  assert.equal(p.reqs.length, 0);
});

test('tắt cờ RULES.ignoreEmptyGcnFlag → như cũ: cờ rỗng vẫn là GCN', () => {
  const R2 = loadScripts([...NEW_CORE, 'tools/run/rules.js']).get('ADXRules.run');
  R2.RULES.ignoreEmptyGcnFlag = false;
  assert.equal(R2.decide(don([file()])).status, 'reject');
});
