// Chạy theo mã đợt bàn giao nhập trên Side Panel – không phải mở hộp thoại "Xử lý đơn đăng ký".
// Lõi: dựng body lấy danh sách từ mã đợt (mẫu config.js, hoặc body trang đã gửi thay mã đợt). Side Panel: ô nhập, khoá / mở nút chạy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { plain, readJson } from './lib/vm.mjs';
import { makeDot, makeServer, runOnce, boot, isWrite, LIST_BODY, NEW_FILES, NEW_RUNNER, TOKEN } from './lib/fake-mplis.mjs';
import { bootPanel } from './lib/fake-dom.mjs';

const DOT = '36a06ac3-51c4-4929-8191-186a868d8346';
const FILES = [...NEW_FILES, 'tools/run/rules.js', 'tools/run/tool.js', NEW_RUNNER];
const run = (server, dot, list) => runOnce({ files: FILES, server, ctxType: 'vbdlis3:ctx', start: { cmd: 'apiStart', tool: 'run', dot }, list });
// Đợt mẫu có cả đơn duyệt được (như DOT_FEW của run.test.mjs)
const DOT_DATA = () => [...makeDot(), ...readJson('test/fixtures/duyet.json').filter((c) => ['D01', 'D02', 'D03'].includes(c.v.goiTinDongBoNId)).map((c) => plain(c.v))];
const reads = (calls) => calls.filter((c) => !isWrite(c)).map((c) => c.body);

test('trang chưa tải danh sách lần nào: nhập mã đợt → đọc bằng mẫu config.js + mã đợt, chạy hết, log lần chạy ghi đúng đợt', async () => {
  const server = makeServer(DOT_DATA());
  const r = await run(server, ` ${DOT} `, null);
  assert.equal(r.started.error, '');
  assert.match(r.final.msg, /^Xong/);
  const rs = reads(r.calls);
  assert.ok(rs.length > 0);
  for (const b of rs) {
    assert.equal(b.dotBanGiaoNId, DOT);
    assert.deepEqual(Object.keys(b).sort(), ['dotBanGiaoNId', 'length', 'requestQueries', 'start']);
  }
  assert.ok(r.calls.some(isWrite), 'có gửi lệnh');
  assert.ok(r.calls.every((c) => c.token === TOKEN), 'mọi request mang mã xác thực');
  assert.equal(r.storage['run:job'].dot, DOT);
});

test('trang đã tải danh sách đợt khác: dùng body trang đã gửi, chỉ thay mã đợt; ngữ cảnh của trang không đổi', async () => {
  const server = makeServer(makeDot());
  const r = await run(server, DOT);
  for (const b of reads(r.calls)) {
    assert.equal(b.dotBanGiaoNId, DOT);
    assert.equal(b.requestQueries.maBiMat, LIST_BODY.requestQueries.maBiMat);
    assert.equal(b.draw, LIST_BODY.draw);
  }
  assert.equal(r.b.get('ADXApiContext.get().listBody.dotBanGiaoNId'), LIST_BODY.dotBanGiaoNId);
  assert.equal(r.final.dot, LIST_BODY.dotBanGiaoNId, 'chạy xong: hiện lại đợt đang mở trên trang');
});

test('đang chạy theo mã nhập: trạng thái báo đúng đợt đang chạy', async () => {
  const server = makeServer(makeDot(), { delay: { list: 20 } });
  const b = boot({ files: FILES, server, ctxType: 'vbdlis3:ctx' });
  const s = await b.send({ cmd: 'apiStart', tool: 'run', dot: DOT });
  assert.equal(s.running, true);
  assert.equal(s.dot, DOT);
  await b.finish();
});

test('mã đợt sai dạng → từ chối, không gửi gì; không mã đợt và chưa có danh sách → từ chối như cũ', async () => {
  let r = await run(makeServer(makeDot()), 'abc-123', null);
  assert.match(r.started.error, /^Mã đợt bàn giao "abc-123" không đúng dạng/);
  assert.equal(r.calls.length, 0);
  r = await run(makeServer(makeDot()), '', null);
  assert.match(r.started.error, /^Chưa thấy danh sách đơn/);
  assert.equal(r.calls.length, 0);
  assert.equal(r.started.hasCtx, false);
  assert.equal(r.started.hasToken, true);
});

// ---------------------------------------------------------------- nhiều đợt
const DOT2 = 'cc36b344-033f-4672-a3bf-26004be20719';
const DOT3 = '0e1f2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b';
// Máy chủ giả nhiều đợt: mỗi mã đợt một danh sách riêng; lỗi theo ý muốn ở lệnh ghi của một đợt
function multiServer(dots, failDot) {
  const servers = Object.fromEntries(dots.map((d) => [d, makeServer(DOT_DATA(), d === failDot ? { fault: (c) => (isWrite(c) ? { status: 200, text: '{"success":false}' } : null) } : {})]));
  const calls = [];
  return {
    calls,
    servers,
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      // Lệnh ghi không mang mã đợt: gửi về đợt đang đọc gần nhất (công cụ chạy lần lượt từng đợt)
      const dot = body.dotBanGiaoNId || calls.filter((c) => c.dot).at(-1).dot;
      calls.push({ dot, name: url.split('/').pop(), write: !body.dotBanGiaoNId });
      return servers[dot].fetch(url, init);
    },
  };
}
const runMany = (server, dots) => runOnce({ files: FILES, server, ctxType: 'vbdlis3:ctx', start: { cmd: 'apiStart', tool: 'run', dots }, list: null });

test('nhiều đợt: chạy lần lượt (đợt sau chỉ bắt đầu khi đợt trước xong), câu tổng, log lần chạy gộp có cột đợt', async () => {
  const server = multiServer([DOT, DOT2, DOT3]);
  const r = await runMany(server, [DOT, DOT2, ` ${DOT} `, DOT3]);
  assert.equal(r.started.error, '');
  assert.equal(r.final.msg, 'Xong – đã chạy hết 3 đợt bàn giao.');
  const order = server.calls.map((c) => c.dot).filter((d, i, a) => d !== a[i - 1]);
  assert.deepEqual(order, [DOT, DOT2, DOT3], 'mỗi đợt một khối liền, đúng thứ tự, mã trùng chỉ chạy một lần');
  for (const d of [DOT, DOT2, DOT3]) assert.ok(server.calls.some((c) => c.dot === d && c.write), `đợt ${d} có gửi lệnh`);
  assert.deepEqual(plain(r.final.batch.done.map((x) => x.dot)), [DOT, DOT2, DOT3]);
  assert.ok(r.final.batch.done.every((x) => /^Xong/.test(x.msg)));
  const job = r.storage['run:job'];
  assert.equal(job.dot, [DOT, DOT2, DOT3].join(', '));
  for (const d of [DOT, DOT2, DOT3]) assert.ok(job.entries.some((e) => e.dot === d && e.maDon === 'DON_D02'), 'cùng mã đơn ở hai đợt là hai dòng');
});

test('nhiều đợt: lỗi ở đợt 2 → dừng, không chạy đợt 3, giữ nguyên câu lỗi', async () => {
  const server = multiServer([DOT, DOT2, DOT3], DOT2);
  const r = await runMany(server, [DOT, DOT2, DOT3]);
  assert.match(r.final.msg, /^Lỗi: Đơn \S+: HỎNG: .+ Đã dừng, kiểm tra tay đơn này\.$/);
  assert.equal(server.calls.filter((c) => c.dot === DOT3).length, 0);
  assert.deepEqual(plain(r.final.batch.done.map((x) => x.dot)), [DOT, DOT2]);
  assert.equal(r.final.batch.total, 3);
});

test('nhiều đợt: một mã sai dạng → từ chối cả lần chạy, không gửi gì', async () => {
  const server = multiServer([DOT]);
  const r = await runMany(server, [DOT, 'abc']);
  assert.match(r.started.error, /^Mã đợt bàn giao "abc" không đúng dạng/);
  assert.equal(server.calls.length, 0);
});

// ---------------------------------------------------------------- Side Panel
const S = (o = {}) => ({
  frame: 'https://x.mplis.gov.vn/', version: '3.2.0', hasCtx: false, hasToken: true, dot: '', seenAt: 0,
  tool: '', running: false, stopping: false, t0: 0, msg: '', step: '', scope: '', phase: '', pos: 0, total: 0, counts: {}, ...o,
});
function card(p, name) {
  const sec = p.doc.body.all((e) => e.tagName === 'SECTION' && e.children[0].children[0].textContent === name)[0];
  const [start] = sec.all((e) => e.tagName === 'BUTTON');
  return { sec, start, state: sec.byClass('api-state')[0], dot: sec.children[0].children[2] };
}
async function type(p, v) {
  const input = p.doc.getElementById('dot-input');
  input.value = v;
  input.oninput();
  await p.settle();
}

test('Side Panel: chưa mở hộp thoại → khoá; nhập mã đúng → mở nút, gửi apiStart kèm mã đợt, xác nhận ghi rõ đợt', async () => {
  const p = await bootPanel({ frame: (msg) => (msg.cmd === 'apiStart' ? { ...S(), error: '' } : S()) });
  assert.equal(card(p, 'Gỡ duyệt').start.disabled, true);
  assert.match(card(p, 'Gỡ duyệt').state.textContent, /hoặc nhập mã đợt bàn giao ở ô trên/);

  let asked = '';
  p.ctx.confirm = (q) => { asked = q; return true; };
  await type(p, DOT);
  assert.equal(card(p, 'Gỡ duyệt').start.disabled, false);
  assert.equal(card(p, 'Gỡ duyệt').dot.textContent, 'Đợt 36a06ac3…');
  await card(p, 'Gỡ duyệt').start.click();
  await p.settle();
  assert.deepEqual(plain(p.sent.filter((m) => m.cmd === 'apiStart')), [{ cmd: 'apiStart', tool: 'undo', dots: [DOT] }]);
  assert.ok(asked.startsWith(`Đợt bàn giao: ${DOT}\n\n`), asked);
});

test('Side Panel: mã gõ dở / sai dạng → khoá nút chạy (kể cả khi trang có đợt đang mở), báo sai dạng', async () => {
  const p = await bootPanel({ frame: () => S({ hasCtx: true, dot: 'DOT-0001-ABCD', seenAt: 1 }) });
  assert.equal(card(p, 'Chạy tự động').start.disabled, false);
  await type(p, '36a06ac3-51c4');
  assert.equal(card(p, 'Chạy tự động').start.disabled, true);
  assert.match(p.doc.getElementById('dot').byClass('dot-hint')[0].textContent, /^Sai dạng mã/);
  await type(p, '');
  assert.equal(card(p, 'Chạy tự động').start.disabled, false);
});

test('Side Panel: nhiều dòng → gửi mọi mã (bỏ dòng trống, bỏ trùng), xác nhận liệt kê đủ; một dòng sai → khoá', async () => {
  const p = await bootPanel({ frame: (msg) => (msg.cmd === 'apiStart' ? { ...S(), error: '' } : S()) });
  let asked = '';
  p.ctx.confirm = (q) => { asked = q; return true; };
  await type(p, `${DOT}\n\n ${DOT2} \r\n${DOT}\n`);
  assert.equal(card(p, 'Chạy tự động').dot.textContent, '2 đợt');
  assert.match(p.doc.getElementById('dot').byClass('dot-hint')[0].textContent, /^2 đợt – chạy lần lượt/);
  await card(p, 'Chạy tự động').start.click();
  await p.settle();
  assert.deepEqual(plain(p.sent.filter((m) => m.cmd === 'apiStart')), [{ cmd: 'apiStart', tool: 'run', dots: [DOT, DOT2] }]);
  assert.ok(asked.startsWith(`2 đợt bàn giao, chạy lần lượt:\n${DOT}\n${DOT2}\n\n`), asked);
  await type(p, `${DOT}\nxyz`);
  assert.equal(card(p, 'Chạy tự động').start.disabled, true);
  assert.match(p.doc.getElementById('dot').byClass('dot-hint')[0].textContent, /^Sai dạng mã: xyz/);
});

test('Side Panel: đang chạy nhiều đợt → nhãn "Đợt 2/3 · …", ghi chú liệt kê kết quả các đợt đã xong', async () => {
  const batch = { pos: 2, total: 3, done: [{ dot: DOT, msg: 'Xong – đã xử lý 5 đơn trong 3 giây.' }] };
  const p = await bootPanel({ frame: () => S({ hasCtx: true, tool: 'run', running: true, dot: DOT2, batch, counts: { approve: 0, reject: 0, unknown: 0, warn: 0 } }) });
  const c = card(p, 'Chạy tự động');
  assert.equal(c.dot.textContent, 'Đợt 2/3 · cc36b344…');
  const note = c.sec.byClass('run-report')[0].byClass('small')[0].textContent;
  assert.ok(note.startsWith('Đợt 1/3 (36a06ac3…): Xong – đã xử lý 5 đơn trong 3 giây.\nĐang chạy đợt 2/3, còn 1 đợt'), note);
});

test('Side Panel: nhập mã nhưng trang chưa có mã xác thực → khoá, bảo F5', async () => {
  const p = await bootPanel({ frame: () => S({ hasToken: false }) });
  await type(p, DOT);
  assert.equal(card(p, 'Chạy tự động').start.disabled, true);
  assert.match(card(p, 'Chạy tự động').state.textContent, /^Chưa lấy được mã xác thực/);
});
