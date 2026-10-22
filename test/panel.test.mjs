// Side Panel (panel.html + view.js + panel.js) chạy trên DOM giả: thanh tab, nội dung từng tab, khoá nút khi đang chạy,
// thông báo trạng thái, thống kê, bảng lỡ duyệt. Bố cục / màu / bề rộng 320px phải kiểm bằng mắt (docs/KIEN_TRUC.md mục 8).
import test from 'node:test';
import assert from 'node:assert/strict';
import { read, plain, loadScripts } from './lib/vm.mjs';
import { bootPanel } from './lib/fake-dom.mjs';

// Trạng thái một khung trên trang MPLIS (stateObj của core/runner.js)
const S = (o = {}) => ({
  frame: 'https://x.mplis.gov.vn/', version: '3.0.0', hasCtx: true, dot: 'DOT-0001-ABCD', seenAt: 1,
  tool: '', running: false, stopping: false, t0: 0, msg: '', step: '', scope: '', phase: '', pos: 0, total: 0, counts: {}, ...o,
});
// Khung giả: trả `page.s` (null = trang không có content script), ghi lại lỗi khi bấm chạy
function boot(s, opts = {}) {
  const page = { s, error: '' };
  const frame = (msg) => (page.s && msg.cmd === 'apiStart' ? { ...page.s, error: page.error } : page.s);
  return bootPanel({ frame, ...opts }).then((p) => Object.assign(p, { page }));
}
const label = (tab) => tab.byClass('tab-label')[0].textContent;
const titles = (panel) => panel.all((e) => e.tagName === 'SECTION').map((s) => s.children[0].children[0].textContent);
function card(p, name) {
  const sec = p.doc.body.all((e) => e.tagName === 'SECTION' && e.children[0].children[0].textContent === name)[0];
  const [start, stop] = sec.all((e) => e.tagName === 'BUTTON');
  const report = sec.byClass('run-report')[0];
  return { sec, start, stop, state: sec.byClass('api-state')[0], report, line: report.byClass('run-line')[0].children[0], extra: sec.children.at(-1) };
}
const TOOLS = ['Chạy tự động', 'Quét và sửa lỡ duyệt GCN', 'Gỡ duyệt', 'Không xử lý hết', 'Duyệt ĐVHC 2 cấp'];

test('đúng bốn tab, đúng thứ tự, đúng tên, đúng vai trò ARIA; mặc định chọn Duyệt đơn', async () => {
  const p = await boot(S());
  assert.match(read('panel/panel.html'), /<nav class="tabs" id="tabs" role="tablist"/);
  const tabs = p.tabs();
  assert.deepEqual(tabs.map(label), ['Duyệt đơn', 'Gỡ duyệt', 'Không xử lý hết', 'ĐVHC 2 cấp']);
  assert.deepEqual(tabs.map((t) => t.getAttribute('role')), ['tab', 'tab', 'tab', 'tab']);
  assert.deepEqual(tabs.map((t) => t.getAttribute('aria-selected')), ['true', 'false', 'false', 'false']);
  assert.deepEqual(tabs.map((t) => t.tabIndex), [0, -1, -1, -1]);
  const panels = p.panels();
  assert.deepEqual(panels.map((x) => x.getAttribute('role')), ['tabpanel', 'tabpanel', 'tabpanel', 'tabpanel']);
  assert.deepEqual(panels.map((x) => x.getAttribute('aria-labelledby')), tabs.map((t) => t.id));
  assert.deepEqual(panels.map((x) => x.hidden), [false, true, true, true]);
});

test('mỗi tab chỉ chứa thẻ của công cụ đó; Duyệt đơn có cả Chạy tự động và Quét và sửa, một thẻ thống kê chung', async () => {
  const p = await boot(S());
  assert.deepEqual(p.panels().map(titles), [
    ['Chạy tự động', 'Quét và sửa lỡ duyệt GCN', 'Thống kê duyệt'],
    ['Gỡ duyệt', 'Thống kê bỏ duyệt'],
    ['Không xử lý hết', 'Thống kê Không xử lý hết'],
    ['Duyệt ĐVHC 2 cấp', 'Thống kê duyệt ĐVHC 2 cấp'],
  ]);
});

test('bấm tab và phím ← → Home End chuyển tab, đưa focus theo', async () => {
  const p = await boot(S());
  const tabs = p.tabs();
  const shown = () => p.panels().map((x) => !x.hidden);
  tabs[2].click();
  assert.deepEqual(shown(), [false, false, true, false]);
  assert.equal(tabs[2].getAttribute('aria-selected'), 'true');
  tabs[2].keydown('ArrowRight');
  assert.deepEqual(shown(), [false, false, false, true]);
  tabs[3].keydown('ArrowRight');
  assert.deepEqual(shown(), [true, false, false, false]);
  assert.equal(p.doc.activeElement, tabs[0]);
  tabs[0].keydown('ArrowLeft');
  assert.deepEqual(shown(), [false, false, false, true]);
  tabs[3].keydown('Home');
  assert.deepEqual(shown(), [true, false, false, false]);
  tabs[0].keydown('End');
  assert.deepEqual(shown(), [false, false, false, true]);
  tabs[3].keydown('a');
  assert.deepEqual(shown(), [false, false, false, true]);
});

test('Gỡ duyệt đang chạy: nút chạy ở mọi thẻ khác bị khoá kèm "Đang chạy: Gỡ duyệt", nút Dừng bấm được, vẫn chuyển tab được', async () => {
  const p = await boot(S({ tool: 'undo', running: true, step: 'read', scope: 'done', pos: 3, total: 10, counts: { undo: 0, skip: 1, unknown: 0 }, before: 0, wDone: 0, wTotal: 0 }));
  for (const name of ['Chạy tự động', 'Quét và sửa lỡ duyệt GCN', 'Không xử lý hết', 'Duyệt ĐVHC 2 cấp']) {
    const c = card(p, name);
    assert.equal(c.start.disabled, true, name);
    assert.equal(c.state.textContent, 'Đang chạy: Gỡ duyệt', name);
    assert.equal(c.report.hidden, true, `${name}: không hiện tiến độ của công cụ khác`);
  }
  const u = card(p, 'Gỡ duyệt');
  assert.equal(u.start.disabled, true);
  assert.equal(u.report.hidden, false);
  assert.equal(u.line.textContent, 'Bước 1/2 · Đang đọc đơn đã xử lý 3 / 10');
  for (const name of TOOLS) assert.equal(card(p, name).stop.disabled, false, `Dừng ở ${name}`);
  // tab đang chạy có chấm báo hiệu (và chữ cho trình đọc màn hình)
  assert.deepEqual(p.tabs().map((t) => t.classList.contains('running')), [false, true, false, false]);
  assert.equal(p.tabs()[1].byClass('sr-only')[0].textContent, ' (đang chạy)');
  // không chuyển tab tự động khi đang xem tab khác; vẫn bấm chuyển được
  assert.equal(p.tabs()[1].getAttribute('aria-selected'), 'true', 'mở Side Panel lúc đang chạy → chọn tab của công cụ đang chạy');
  p.tabs()[0].click();
  await p.refresh();
  assert.equal(p.tabs()[0].getAttribute('aria-selected'), 'true');
  // Dừng ở thẻ khác dừng được công cụ đang chạy
  p.sent.length = 0;
  await card(p, 'Chạy tự động').stop.click();
  await p.settle();
  assert.ok(p.sent.some((m) => m.cmd === 'apiStop'));
});

test('mở Side Panel khi Không xử lý hết đang chạy → chọn sẵn tab Không xử lý hết', async () => {
  const p = await boot(S({ tool: 'noaction', running: true, step: 'write', wDone: 1, wTotal: 4, counts: { change: 1, skip: 0, unknown: 0 } }));
  assert.deepEqual(p.tabs().map((t) => t.getAttribute('aria-selected')), ['false', 'false', 'true', 'false']);
});

test('không có gì chạy: nút chạy mở, nút Dừng khoá; bấm chạy gửi apiStart đúng công cụ', async () => {
  const p = await boot(S());
  for (const name of TOOLS) {
    assert.equal(card(p, name).start.disabled, false, name);
    assert.equal(card(p, name).stop.disabled, true, name);
  }
  await card(p, 'Không xử lý hết').start.click();
  await p.settle();
  assert.deepEqual(plain(p.sent.filter((m) => m.cmd === 'apiStart')), [{ cmd: 'apiStart', tool: 'noaction' }]);
});

test('lỗi khi bấm chạy chỉ hiện ở thẻ của công cụ đó', async () => {
  const p = await boot(S());
  p.page.error = 'Chưa lấy được mã xác thực (__RequestVerificationToken) – hãy F5 trang rồi mở hộp thoại';
  await card(p, 'Gỡ duyệt').start.click();
  await p.settle();
  assert.equal(card(p, 'Gỡ duyệt').state.textContent, p.page.error);
  assert.match(card(p, 'Gỡ duyệt').state.className, /err/);
  assert.equal(card(p, 'Chạy tự động').state.textContent, '');
});

test('tiến độ không lẫn: chạy xong Chạy tự động thì chỉ thẻ đó hiện kết quả', async () => {
  const counts = { approve: 3, reject: 1, fix: 0, skip: 2, unknown: 1, warn: 0 };
  const p = await boot(S({ tool: 'run', msg: 'Xong – đã xử lý 4 đơn trong 3 giây, 1 đơn cần kiểm tra tay.', scope: 'all', pos: 7, total: 7, done: 7, before: 0, counts }));
  const r = card(p, 'Chạy tự động');
  assert.equal(r.report.hidden, false);
  assert.equal(r.line.textContent, 'Đã chạy 7 / 7 hồ sơ');
  assert.match(r.state.className, /ok/);
  for (const name of ['Quét và sửa lỡ duyệt GCN', 'Gỡ duyệt', 'Không xử lý hết', 'Duyệt ĐVHC 2 cấp']) {
    assert.equal(card(p, name).report.hidden, true, name);
    assert.equal(card(p, name).state.textContent, '', name);
  }
});

test('giữ thông báo cũ: chưa có ngữ cảnh, trang chưa có extension, lệch phiên bản (khoá mọi nút chạy)', async () => {
  let p = await boot(S({ hasCtx: false, dot: '' }));
  assert.match(card(p, 'Gỡ duyệt').state.textContent, /^Chưa thấy danh sách đơn: F5 trang rồi mở hộp thoại "Xử lý đơn đăng ký"/);
  assert.equal(card(p, 'Gỡ duyệt').start.disabled, true);

  p = await boot(null);
  for (const name of TOOLS) assert.equal(card(p, name).state.textContent, 'Extension chưa chạy trên tab này – tải lại trang (F5).');

  p = await boot(S({ version: '2.2.4' }));
  for (const name of TOOLS) {
    assert.equal(card(p, name).start.disabled, true);
    assert.match(card(p, name).state.textContent, /^⚠ Trang đang chạy bản cũ của extension/);
  }
  p = await boot(S(), { version: '9.9.9' });
  for (const name of TOOLS) {
    assert.equal(card(p, name).start.disabled, true);
    assert.match(card(p, name).state.textContent, /^⚠ Extension chưa được tải lại/);
  }
});

test('thống kê đúng nhật ký của từng tab, cập nhật khi storage đổi', async () => {
  const p = await boot(S(), { storage: {
    'run:stats': { total: 5, approve: 3, reject: 1, unknown: 1, next: 6 },
    'undo:stats': { total: 2, undo: 2, unknown: 0, next: 3 },
  } });
  const stats = (title) => {
    const sec = p.doc.body.all((e) => e.tagName === 'SECTION' && e.children[0].children[0].textContent === title)[0];
    return [sec.children[0].children[1].textContent, ...sec.byClass('stat').map((x) => x.children[0].textContent)];
  };
  assert.deepEqual(stats('Thống kê duyệt'), ['5 đơn', '3', '1', '1']);
  assert.deepEqual(stats('Thống kê bỏ duyệt'), ['2 đơn', '2', '0']);
  assert.deepEqual(stats('Thống kê Không xử lý hết'), ['0 đơn', '0', '0']);
  assert.deepEqual(stats('Thống kê duyệt ĐVHC 2 cấp'), ['0 đơn', '0', '0', '0']);
  await p.change('undo:stats', { total: 4, undo: 3, unknown: 1, next: 5 });
  assert.deepEqual(stats('Thống kê bỏ duyệt'), ['4 đơn', '3', '1']);
  assert.deepEqual(stats('Thống kê duyệt'), ['5 đơn', '3', '1', '1']);
});

test('bảng lỡ duyệt: vẽ từ kết quả đã lưu, ẩn dòng tổng kết khi đang quét, xuất CSV', async () => {
  const res = {
    time: '11/10/2026', dot: 'DOT', total: 30, scanned: 30, gcn: 4, pending: 2, pendingManual: 1, complete: true, states: {},
    findings: [
      { pos: 3, page: 1, maDon: 'DON_1', why: 'đã Cập nhật lịch sử', history: true, owners: 'A', gcnIds: '9', reason: 'GCN', state: 'approved', stateLabel: 'đã thêm vào dữ liệu vận hành', result: 'fixed', fixed: 'đã sửa 11/10/2026' },
      { pos: 14, page: 2, maDon: 'DON_2', why: 'đã Cập nhật lịch sử', history: true, owners: 'B', gcnIds: '', reason: 'GCN', state: 'other', stateLabel: 'trạng thái khác (trangThai=2)', result: 'manual', fixed: '' },
    ],
  };
  const p = await boot(S(), { storage: { 'audit:last': res } });
  const a = () => card(p, 'Quét và sửa lỡ duyệt GCN');
  const rows = () => a().extra.all((e) => e.tagName === 'TR').slice(1);
  assert.equal(rows().length, 2);
  assert.deepEqual(rows().map((r) => r.className), ['fixed', 'manual']);
  assert.match(a().extra.byClass('api-state')[0].textContent, /^Đã quét hết 30\/30 đơn · có GCN 4 · 1 đơn cần kiểm tra tay · còn 2 đơn chưa xử lý \(1 cần kiểm tra tay\)$/);
  // Đang quét: dòng tiến độ ở trên, không hiện dòng tổng kết của lần trước
  p.page.s = S({ tool: 'audit', running: true, scope: 'all', total: 30, audit: { scanned: 5, wrong: 1, fixed: 1, manual: 0 }, counts: {} });
  await p.refresh();
  await p.change('audit:last', { ...res, complete: false, scanned: 5 });
  assert.equal(a().extra.byClass('api-state').length, 0);
  assert.equal(a().line.textContent, 'Đang quét và sửa · 5/30 đơn · lỡ duyệt 1 · đã sửa 1');
  // Quét xong: vẽ lại từ kết quả đã lưu, có dòng tổng kết
  p.page.s = S({ tool: 'audit', msg: 'Xong: quét 30/30 đơn trong 2 giây · lỡ duyệt 2 · đã sửa 1 · kiểm tra tay 1', scope: 'all', total: 30, audit: { scanned: 30, wrong: 2, fixed: 1, manual: 1 }, counts: {} });
  await p.change('audit:last', res);
  await p.refresh();
  assert.match(a().extra.byClass('api-state')[0].textContent, /^Đã quét hết/);
  // Xuất CSV bảng lỡ duyệt
  const csvBtn = a().extra.all((e) => e.tagName === 'BUTTON')[0];
  csvBtn.click();
  const text = Buffer.from(await p.blobs.at(-1).arrayBuffer()).toString('utf8');
  assert.ok(text.startsWith('﻿Trang,Vị trí,Mã đơn,Lỡ,Chủ (khung trái),Mã GCN (khung phải),Lý do không được duyệt,Trạng thái trên hệ thống,Kết quả\r\n1,3,DON_1,'));
});

// ---------------------------------------------------------------- nhãn trạng thái, khối lỗi đã tách (giao diện mới)

test('tách câu lỗi chuẩn của lõi: đủ mã đơn / các bước / lý do / việc cần làm, không mất chữ', () => {
  const V = loadScripts(['panel/view.js']).get('ADXView');
  const join = (e) => `Lỗi: Đơn ${e.maDon}: ${e.steps.map(([k, v]) => `${k === 'HỎNG' ? k : k[0].toLowerCase() + k.slice(1)}: ${v}`).join('; ')} – ${e.reason}. ${e.hint}`;
  const msgs = [
    'Lỗi: Đơn DON_T02: đã làm: Bỏ duyệt (khung phải) (3 bản ghi); HỎNG: Bỏ duyệt (khung trái) – trạng thái trả về 1, cần 0. Đã dừng, kiểm tra tay đơn này.',
    'Lỗi: Đơn DON_D02: đã làm: Thêm vào dữ liệu vận hành; HỎNG: Cập nhật lịch sử (2 bản ghi) – khung phải chưa ghi nhận (actionProcessSyncDataVanHanh = {}). Đã dừng, kiểm tra tay đơn này.',
    'Lỗi: Đơn DON_T01: HỎNG: Bỏ duyệt (khung phải); chưa làm: Bỏ duyệt (khung trái) – UpdateStatusGoiTinDongBoVanHanh: máy chủ không trả JSON (HTTP 200) – có thể đã hết phiên đăng nhập, hãy F5 trang. Đã dừng, kiểm tra tay đơn này.',
  ];
  for (const m of msgs) {
    const e = V.splitError(m);
    assert.ok(e, m);
    assert.equal(join(e), m, 'ghép lại phải ra đúng câu gốc');
  }
  const e = V.splitError(msgs[2]);
  assert.deepEqual(plain(e.steps), [['HỎNG', 'Bỏ duyệt (khung phải)'], ['Chưa làm', 'Bỏ duyệt (khung trái)']]);
  assert.match(e.reason, /– có thể đã hết phiên đăng nhập/);
  for (const other of ['Lỗi: Đang chạy rồi', 'Lỗi: UpdateStatusGoiTinDongBoThiCong: máy chủ báo lỗi (HTTP 500)', '⚠ Trang đang chạy bản cũ của extension', '']) {
    assert.equal(V.splitError(other), null, other);
  }
});

const badgeOf = (p, name) => { const b = card(p, name).sec.byClass('badge')[0]; return b.hidden ? '' : `${b.className}|${b.textContent}`; };

test('nhãn trạng thái: Đang chạy chỉ ở thẻ đang chạy; Hoàn thành / Cần kiểm tra / Lỗi theo kết quả thật', async () => {
  let p = await boot(S({ tool: 'undo', running: true, step: 'read', scope: 'done', pos: 1, total: 5, counts: { undo: 0, skip: 0, unknown: 0 } }));
  assert.equal(badgeOf(p, 'Gỡ duyệt'), 'badge run|Đang chạy');
  for (const name of ['Chạy tự động', 'Quét và sửa lỡ duyệt GCN', 'Không xử lý hết']) assert.equal(badgeOf(p, name), '', name);

  p = await boot(S({ tool: 'undo', msg: 'Xong – đã gỡ duyệt 8 đơn trong 3 giây.', step: 'write', pos: 5, total: 5, wDone: 8, wTotal: 8, counts: { undo: 8, skip: 0, unknown: 0 } }));
  assert.equal(badgeOf(p, 'Gỡ duyệt'), 'badge ok|Hoàn thành');
  assert.equal(badgeOf(p, 'Chạy tự động'), '');

  p = await boot(S({ tool: 'run', msg: 'Xong – đã xử lý 4 đơn trong 3 giây, 1 đơn cần kiểm tra tay.', scope: 'all', total: 5, pos: 5, done: 5, counts: { approve: 3, reject: 1, fix: 0, skip: 0, unknown: 1, warn: 0 } }));
  assert.equal(badgeOf(p, 'Chạy tự động'), 'badge warn|Cần kiểm tra');

  p = await boot(S({ tool: 'audit', msg: 'Xong: quét 30/30 đơn trong 2 giây · lỡ duyệt 2 · đã sửa 1 · kiểm tra tay 1', total: 30, audit: { scanned: 30, wrong: 2, fixed: 1, manual: 1 }, counts: {} }));
  assert.equal(badgeOf(p, 'Quét và sửa lỡ duyệt GCN'), 'badge warn|Cần kiểm tra');

  p = await boot(S({ hasCtx: false, dot: '' }));
  for (const name of TOOLS) assert.equal(badgeOf(p, name), 'badge idle|Chưa sẵn sàng', name);
  p = await boot(S({ version: '2.2.4' }));
  for (const name of TOOLS) assert.equal(badgeOf(p, name), 'badge idle|Chưa sẵn sàng', name);
  p = await boot(S());
  for (const name of TOOLS) assert.equal(badgeOf(p, name), '', `${name}: sẵn sàng thì không có nhãn`);
});

test('lỗi lệnh ghi hiện tách: mã đơn, đã làm / HỎNG, lý do, việc cần làm; nhãn Lỗi', async () => {
  const msg = 'Lỗi: Đơn DON_00000042: đã làm: Bỏ duyệt (khung phải); HỎNG: Bỏ duyệt (khung trái) – trạng thái trả về 1, cần 0. Đã dừng, kiểm tra tay đơn này.';
  const p = await boot(S({ tool: 'undo', msg, step: 'write', scope: 'done', pos: 20, total: 20, wDone: 3, wTotal: 8, counts: { undo: 3, skip: 0, unknown: 0 } }));
  const c = card(p, 'Gỡ duyệt');
  assert.match(c.state.className, /err/);
  assert.equal(c.state.byClass('state-title')[0].textContent, 'Lỗi · Đơn DON_00000042');
  assert.equal(c.state.all((e) => e.tagName === 'CODE')[0].textContent, 'DON_00000042');
  assert.deepEqual(c.state.all((e) => e.tagName === 'DT').map((e) => e.textContent), ['Đã làm', 'HỎNG', 'Lý do']);
  assert.deepEqual(c.state.all((e) => e.tagName === 'DD').map((e) => e.textContent), ['Bỏ duyệt (khung phải)', 'Bỏ duyệt (khung trái)', 'trạng thái trả về 1, cần 0']);
  assert.equal(c.state.byClass('state-hint')[0].textContent, 'Đã dừng, kiểm tra tay đơn này.');
  assert.equal(badgeOf(p, 'Gỡ duyệt'), 'badge err|Lỗi');
  // Câu lỗi khác mẫu (VD bấm chạy bị từ chối) vẫn hiện nguyên văn
  assert.equal(card(p, 'Chạy tự động').state.byClass('state-body').length, 0);
});

test('chân trang giữ phím tắt Alt+Shift+S / Esc', () => {
  const html = read('panel/panel.html');
  assert.match(html, /<span>Dừng khẩn cấp<\/span>\s*<span class="phim"><kbd>Alt<\/kbd>\+<kbd>Shift<\/kbd>\+<kbd>S<\/kbd> \/ <kbd>Esc<\/kbd><\/span>/);
});

test('log lần chạy: thẻ hiện "Lần chạy … · N đơn" + nút tải CSV (có Số tờ, Số thửa); ẩn khi chưa có hoặc đang chạy', async () => {
  const job = { tool: 'undo', name: 'Gỡ duyệt', dot: 'DOT', start: '17/10/2026, 09:00:00', end: '17/10/2026, 09:05:00', endedAt: Date.UTC(2026, 9, 17, 2, 5), msg: 'Xong', entries: [
    { maDon: 'DON_1', time: '17/10/2026, 09:01:00', stt: '1/20', owners: 'A', ownersRight: '', soTo: '12', soThua: '34', soPhatHanh: '', soVaoSo: '', result: 'ĐÃ GỠ DUYỆT', note: 'GỠ DUYỆT: …', action: 'GỠ DUYỆT: …', actionTime: '17/10/2026, 09:04:00' },
    { maDon: 'DON_2', time: '17/10/2026, 09:01:00', stt: '2/20', owners: 'B', ownersRight: '', soTo: '3 | 3', soThua: '45 | 46', soPhatHanh: '', soVaoSo: '', result: 'KIỂM TRA TAY', note: 'x', action: '', actionTime: '' },
  ] };
  const p = await boot(S(), { storage: { 'undo:job': job } });
  const row = (name) => card(p, name).sec.byClass('job-row')[0];
  assert.equal(row('Gỡ duyệt').hidden, false);
  assert.equal(row('Gỡ duyệt').byClass('muted')[0].textContent, 'Lần chạy 17/10/2026, 09:05:00 · 2 đơn');
  assert.equal(row('Chạy tự động').hidden, true, 'chưa có lần chạy');
  row('Gỡ duyệt').all((e) => e.tagName === 'BUTTON')[0].click();
  const text = Buffer.from(await p.blobs.at(-1).arrayBuffer()).toString('utf8');
  const lines = text.split('\r\n');
  assert.equal(lines[0], '﻿STT,Thời gian quét,Vị trí hồ sơ,Mã đơn,Chủ – khung trái (đơn mới),Chủ – khung phải (dữ liệu cũ),Số tờ,Số thửa,Kết quả,Số phát hành,Số vào sổ,Hành động đã làm,Thời gian hành động,Ghi chú');
  assert.equal(lines.length, 3);
  assert.match(lines[2], /^2,.*,DON_2,B,,3 \| 3,45 \| 46,KIỂM TRA TAY,/);
  // Đang chạy lại Gỡ duyệt → ẩn log của lần trước
  p.page.s = S({ tool: 'undo', running: true, step: 'read', scope: 'done', pos: 1, total: 5, counts: { undo: 0, skip: 0, unknown: 0 } });
  await p.refresh();
  assert.equal(row('Gỡ duyệt').hidden, true);
});
