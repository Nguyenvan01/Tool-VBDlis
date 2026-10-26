// Công cụ "Duyệt (GCN)" (gcn): như Chạy tự động nhưng khung trái có Giấy chứng nhận vẫn duyệt; khung phải có GCN vẫn không.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts, plain, NEW_CORE } from './lib/vm.mjs';
import { makeServer, runOnce, isWrite, NEW_FILES, NEW_RUNNER, TOKEN } from './lib/fake-mplis.mjs';

const FILES = ['tools/run/rules.js', 'tools/run/tool.js', 'tools/gcn/tool.js'];
const N = loadScripts([...NEW_CORE, ...FILES]);
const RR = N.get('ADXRules.run');
const GCN_LEFT = [{ giayChungNhanId: 9001, soPhatHanh: 'CS 009001' }];
const GCN_RIGHT = [{ giayChungNhanId: 9002, soPhatHanh: 'CS 009002' }];
// Đơn chưa xử lý, khung trái tờ 27 thửa 125, một bản ghi khung phải cùng thửa
function don(goi, { left = [], right = [], maDonPhai = '', empty = false, boDuyet = false } = {}) {
  const id = Number(goi.slice(1)) * 10;
  const v = {
    goiTinDongBoNId: goi, trangThaiGoiTinDongBo: 0, tinhHinhDangKyVanHanhIds: [id],
    ThongTinDangKyThiCong: {
      ActionProcessSyncData: boDuyet ? -1 : 0, TinhHinhDangKy: { maDon: `DON_${goi}` }, ChuSoHuu: { ListCaNhan: [{ hoTen: 'Tên Giả' }] },
      TaiSan: { ListThuaDat: [{ soTo: '27', soThua: '125' }] }, ListGiayChungNhan: left,
    },
    ThongTinDangKyVanHanh: [{
      ActionProcessSyncData: 0, TinhHinhDangKy: { tinhHinhDangKyId: id, maDon: maDonPhai },
      TaiSan: { ListThuaDat: [{ soTo: '27', soThua: '125' }] }, ListGiayChungNhan: right,
    }],
  };
  if (empty) Object.assign(v, { tinhHinhDangKyVanHanhIds: [], ThongTinDangKyVanHanh: [] });
  return v;
}
const NO = { leftGcn: false };

test('luật: khung trái có GCN → Duyệt (GCN) duyệt (khung phải trống / có bản ghi không GCN / đã Bỏ duyệt), Duyệt đơn vẫn không duyệt', () => {
  for (const v of [don('G1', { left: GCN_LEFT, empty: true }), don('G6', { left: GCN_LEFT, empty: true, boDuyet: true }), don('G7', { left: GCN_LEFT })]) {
    assert.equal(RR.decide(v, NO).status, 'approve');
    const d = RR.decide(v);
    assert.equal(d.status, 'reject');
    assert.match(d.reasons[0], /^Khung trái có thông tin Giấy chứng nhận/);
  }
});

test('luật: không có GCN bên trái → đơn đã Bỏ duyệt vẫn để kiểm tra tay', () => {
  assert.equal(RR.decide(don('G8', { boDuyet: true }), NO).status, 'unknown');
});

test('luật: khung phải có GCN → cả hai đều không duyệt', () => {
  for (const v of [don('G2', { right: GCN_RIGHT }), don('G3', { left: GCN_LEFT, right: GCN_RIGHT })]) {
    const d = RR.decide(v, NO);
    assert.equal(d.status, 'reject');
    assert.match(d.reasons[0], /^Khung phải đã có Giấy chứng nhận/);
  }
});

test('luật: các điều kiện khác giữ nguyên (VD mã đơn trái = mã đơn phải → không duyệt)', () => {
  const d = RR.decide(don('G4', { maDonPhai: 'DON_G4' }), NO);
  assert.equal(d.status, 'reject');
  assert.match(d.reasons[0], /^Mã đơn khung trái trùng mã đơn khung phải/);
});

test('đăng ký: tab riêng, nhật ký riêng, không đổi cấu hình của Chạy tự động', () => {
  const t = N.get("ADXTools.get('gcn')");
  assert.equal(t.tab, 'Duyệt (GCN)');
  assert.equal(N.get("ADXTools.logNs(ADXTools.get('gcn'))"), 'gcn');
  assert.deepEqual(plain(t.config.rules), NO);
  assert.equal(N.get("ADXTools.get('run').config.rules"), undefined);
  assert.match(t.panel.confirm, /KHUNG TRÁI CÓ GIẤY CHỨNG NHẬN VẪN DUYỆT/);
});

// ---------------------------------------------------------------- chạy trên máy chủ giả
const dot = () => [don('G1', { left: GCN_LEFT, empty: true }), don('G2', { right: GCN_RIGHT }), don('G5')];
const go = (server, tool) => runOnce({ files: [...NEW_FILES, ...FILES, NEW_RUNNER], server, ctxType: 'vbdlis3:ctx', start: { cmd: 'apiStart', tool } });
const THEM_VAO = (goi) => ['UpdateStatusGoiTinDongBoThiCong', { goiTinDongBoNId: goi, actionProcessSyncDataThiCong: 1, trangThai: 1, processSyncDatas: [] }];
const LICH_SU = (goi, id) => ['UpdateStatusGoiTinDongBoVanHanh', { goiTinDongBoNId: goi, processSyncDatas: [{ actionProcessSyncData: 3, tinhHinhDangKyId: id }], trangThai: 1 }];
const KHONG_XU_LY = (goi) => ['UpdateStatusGoiTinDongBoThiCong', { goiTinDongBoNId: goi, actionProcessSyncDataThiCong: 0, trangThai: 1, processSyncDatas: [] }];
const writes = (r) => r.calls.filter(isWrite).map((c) => [c.name, plain(c.body)]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const sorted = (l) => l.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

test('máy chủ giả: Duyệt (GCN) duyệt đơn có GCN bên trái, Không xử lý đơn có GCN bên phải; log riêng "gcn:"; chạy lại không gửi gì', async () => {
  const server = makeServer(dot());
  const r = await go(server, 'gcn');
  assert.match(r.final.msg, /^Xong – đã xử lý 3 đơn/);
  assert.deepEqual(writes(r), sorted([THEM_VAO('G1'), KHONG_XU_LY('G2'), THEM_VAO('G5'), LICH_SU('G5', 50)]));
  assert.equal(r.storage['gcn:log:DON_G1'].result, 'ĐƯỢC DUYỆT');
  assert.equal(r.storage['gcn:log:DON_G2'].result, 'KHÔNG DUYỆT');
  assert.equal(r.storage['gcn:job'].tool, 'gcn');
  assert.ok(Object.keys(r.storage).every((k) => k.startsWith('gcn:')), 'không ghi vào nhật ký của Chạy tự động');
  assert.ok(!JSON.stringify(r.storage).includes(TOKEN));
  const n = server.calls.length;
  await go(server, 'gcn');
  assert.equal(server.calls.slice(n).filter(isWrite).length, 0);
});

test('máy chủ giả: cùng đợt, Chạy tự động vẫn Không xử lý đơn có GCN bên trái (không bị ảnh hưởng)', async () => {
  const r = await go(makeServer(dot()), 'run');
  assert.deepEqual(writes(r), sorted([KHONG_XU_LY('G1'), KHONG_XU_LY('G2'), THEM_VAO('G5'), LICH_SU('G5', 50)]));
});
