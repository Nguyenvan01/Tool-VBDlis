// So luật thuần của bản mới với bản cũ trên CÙNG fixture. Kết quả bản cũ lấy từ legacy/ (còn) hoặc test/golden/golden.json
// (đã chốt). Kết quả gồm cả lệnh gửi (endpoint, body, expect), nên đổi body / expect / mã action là test hỏng.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts, readJson, plain, NEW_CORE, legacyRules, LEGACY_DUYET, LEGACY_GO } from './lib/vm.mjs';
import { legacy, HAS_LEGACY } from './lib/golden.mjs';

const N = loadScripts([...NEW_CORE, 'tools/undo/rules.js']);
const M = N.get('ADXModel');
const U = N.get('ADXRules.undo');
// Code cũ chỉ nạp khi còn legacy/
const D = HAS_LEGACY ? loadScripts(legacyRules(LEGACY_DUYET)).get('ADXApiRules') : null;
const G = HAS_LEGACY ? loadScripts(legacyRules(LEGACY_GO)).get('ADXApiRules') : null;

const DON = readJson('test/fixtures/don.json');
const RESP = readJson('test/fixtures/responses.json');

// Kết quả của bản cũ cho một đơn
const OLD = (name, v) => legacy('golden', `don: ${name}`, () => ({
  serverState: D.serverState(v), stateLabel: D.stateLabel(v), stateLabelGo: G.stateLabel(v), rawState: D.rawState(v),
  historyIds: D.historyIds(v), info: G.info(v), undoFor: G.undoFor(v, G.info(v)),
}));

test('fixture phủ đủ nhánh của serverState và undoFor', () => {
  assert.deepEqual(new Set(DON.map((c) => M.serverState(c.v))), new Set(['pending', 'approved', 'noaction', 'other']));
  assert.deepEqual(new Set(DON.map((c) => U.undoFor(c.v, M.info(c.v)).kind)), new Set(['undo', 'unknown', 'skip']));
});

for (const { name, v } of DON) {
  test(`serverState, stateLabel, rawState, historyIds = bản Duyệt – ${name}`, () => {
    const o = OLD(name, v);
    assert.equal(M.serverState(v), o.serverState);
    assert.equal(M.stateLabel(v), o.stateLabel);
    assert.equal(M.stateLabel(v), o.stateLabelGo);
    assert.equal(M.rawState(v), o.rawState);
    assert.deepEqual(plain(M.historyIds(v)), o.historyIds);
  });
  test(`info = bản Gỡ – ${name}`, () => {
    assert.deepEqual(plain(M.info(v)), OLD(name, v).info);
  });
  test(`undoFor (kể cả lệnh, body, expect) = bản Gỡ – ${name}`, () => {
    assert.deepEqual(plain(U.undoFor(v, M.info(v))), OLD(name, v).undoFor);
  });
}

for (const { name, resp, expect } of RESP) {
  test(`checkResponse = cả hai bản – ${name}`, () => {
    const o = legacy('golden', `checkResponse: ${name}`, () => ({ duyet: D.checkResponse(resp, expect), go: G.checkResponse(resp, expect) }));
    const got = M.checkResponse(resp, expect);
    assert.equal(got, o.duyet);
    assert.equal(got, o.go);
  });
}

test('fixture checkResponse có cả đúng lẫn sai', () => {
  const r = RESP.map(({ resp, expect }) => M.checkResponse(resp, expect) === '');
  assert.ok(r.includes(true) && r.includes(false));
});

test('bất biến 6: khung phải 3 bản ghi → MỘT lệnh VanHanh chứa cả 3', () => {
  const { v } = DON.find((c) => c.v.goiTinDongBoNId === 'G02');
  const p = U.undoFor(v, M.info(v));
  const vh = p.reqs.filter((r) => r.name === 'UpdateStatusGoiTinDongBoVanHanh');
  assert.equal(vh.length, 1);
  assert.deepEqual(plain(vh[0].body.processSyncDatas.map((x) => x.tinhHinhDangKyId)), [201, 202, 203]);
});

test('bất biến 2: mọi lệnh dựng từ model đều có expect', () => {
  for (const { v } of DON) for (const r of U.undoFor(v, M.info(v)).reqs) assert.ok(r.expect, r.label);
  assert.ok(M.thiCong('G', 1, 'x').expect && M.vanHanh('G', [1], 3, 1, 'x').expect);
});

test('thiCong mặc định trangThai 1 = lệnh Không xử lý / Thêm vào của bản Duyệt', () => {
  assert.deepEqual(plain(M.thiCong('G', 0, 'Không xử lý')), {
    name: 'UpdateStatusGoiTinDongBoThiCong', label: 'Không xử lý',
    body: { goiTinDongBoNId: 'G', actionProcessSyncDataThiCong: 0, trangThai: 1, processSyncDatas: [] },
    expect: { trangThai: 1, thiCong: 0 },
  });
});
