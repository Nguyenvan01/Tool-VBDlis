// Máy chủ MPLIS GIẢ trong bộ nhớ + chạy bộ máy của extension trong node:vm. Không gửi request nào ra mạng.
// Máy chủ giả làm như máy chủ thật theo mô hình dữ liệu ở docs/KIEN_TRUC.md mục 9: lọc theo trangThai, cắt trang,
// và mỗi lệnh ghi đẩy đơn xuống cuối danh sách (đổi thứ tự – hiện tượng làm bản 2.2.2 sót đơn).
import vm from 'node:vm';
import { read, readJson } from './vm.mjs';

export const TOKEN = 'TOKEN-BI-MAT-123';
export const LIST_BODY = { dotBanGiaoNId: 'DOT-0001-ABCD', requestQueries: { trangThai: '-1', maBiMat: 'LISTBODY-BI-MAT' }, draw: 1 };
const LIST = 'KiemTraDuLieuChuyenDoi';
const THI_CONG = 'UpdateStatusGoiTinDongBoThiCong';
const VAN_HANH = 'UpdateStatusGoiTinDongBoVanHanh';
const clone = (x) => JSON.parse(JSON.stringify(x));
export const isWrite = (c) => c.name !== LIST;

// Đợt mẫu: các đơn trong don.json, nhân thêm `copies` bản có mã khác (đơn thiếu mã gói tin chỉ giữ một bản).
// Bỏ đơn không có trangThaiGoiTinDongBo: máy chủ thật không trả đơn như vậy, và nó làm phép đếm của bộ lọc luôn lệch.
export function makeDot(copies = 2, file = 'test/fixtures/don.json') {
  const out = [];
  for (let i = 0; i < copies; i++) {
    for (const { v } of readJson(file)) {
      if ((!v.goiTinDongBoNId && i) || v.trangThaiGoiTinDongBo === undefined) continue;
      const x = clone(v);
      if (i) {
        x.goiTinDongBoNId += `-${i}`;
        const thd = x.ThongTinDangKyThiCong && x.ThongTinDangKyThiCong.TinhHinhDangKy;
        if (thd && thd.maDon) thd.maDon += `-${i}`; // mã đơn rỗng giữ rỗng
        if (x.giayChungNhanIds) x.giayChungNhanIds = x.giayChungNhanIds.map((id) => id + i * 100000);
        const shift = (id) => id + i * 100000;
        if (Array.isArray(x.tinhHinhDangKyVanHanhIds)) x.tinhHinhDangKyVanHanhIds = x.tinhHinhDangKyVanHanhIds.map(shift);
        for (const h of x.ThongTinDangKyVanHanh || []) h.TinhHinhDangKy.tinhHinhDangKyId = shift(h.TinhHinhDangKy.tinhHinhDangKyId);
      }
      out.push(x);
    }
  }
  return out;
}

// opts.filter1: 'ok' | 'ignored' (máy chủ bỏ qua bộ lọc '1') | 'mixed' ; opts.filter0: 'ok' | 'ignored' | 'reversed' (đúng đơn, sai thứ tự)
// opts.maxPage: trả tối đa bấy nhiêu đơn mỗi trang ; opts.reorder: false = ghi xong không đẩy đơn xuống cuối
// opts.delay: { list, write } ms ; opts.fault(call, n) → { status, text } để giả lỗi ; opts.onCall(call) gọi khi nhận request
export function makeServer(dons, opts = {}) {
  const items = clone(dons);
  const calls = [];
  // Số request đang chạy cùng lúc (kiểm giới hạn 6 kết nối của Chrome): tổng, riêng đọc, riêng ghi, đọc–ghi có chồng nhau không
  const load = { now: { read: 0, write: 0 }, max: 0, maxRead: 0, maxWrite: 0, overlap: false };
  const { filter1 = 'ok', filter0 = 'ok', maxPage = Infinity, reorder = true, delay = {}, fault, onCall } = opts;

  function value(v) {
    const vh = Array.isArray(v.ThongTinDangKyVanHanh) ? v.ThongTinDangKyVanHanh : [];
    return {
      trangThai: v.trangThaiGoiTinDongBo,
      actionProcessSyncDataThiCong: (v.ThongTinDangKyThiCong || {}).ActionProcessSyncData,
      actionProcessSyncDataVanHanh: JSON.stringify({ ListProcessSyncData: vh.map((h) => ({ tinhHinhDangKyId: h.TinhHinhDangKy.tinhHinhDangKyId, actionProcessSyncData: h.ActionProcessSyncData })) }),
    };
  }

  function handle(name, body) {
    if (name === LIST) {
      const tt = body.requestQueries.trangThai;
      const by = (s) => items.filter((v) => v.trangThaiGoiTinDongBo === s);
      // filter1 'mixed': đếm đúng nhưng lẫn một đơn chưa xử lý thay cho một đơn đã xử lý
      const mixed = () => { const l = by(1); l[l.length - 1] = by(0)[0]; return l; };
      const one = { ok: () => by(1), ignored: () => items, mixed }[filter1];
      const zero = { ok: () => by(0), ignored: () => items, reversed: () => by(0).reverse() }[filter0];
      const list = tt === '0' ? zero() : tt === '1' ? one() : tt === '2' ? by(2) : items;
      const n = Math.min(body.length, maxPage);
      return { success: true, value: clone(list.slice(body.start, body.start + n)), recordsTotal: list.length };
    }
    const i = items.findIndex((x) => x.goiTinDongBoNId === body.goiTinDongBoNId);
    if (i < 0) return { success: false, message: 'không có gói tin' };
    const v = items[i];
    if (name === THI_CONG) {
      v.trangThaiGoiTinDongBo = body.trangThai;
      v.ThongTinDangKyThiCong.ActionProcessSyncData = body.actionProcessSyncDataThiCong;
    } else if (name === VAN_HANH) {
      for (const p of body.processSyncDatas) {
        v.ThongTinDangKyVanHanh.find((h) => h.TinhHinhDangKy.tinhHinhDangKyId === p.tinhHinhDangKyId).ActionProcessSyncData = p.actionProcessSyncData;
      }
      v.trangThaiGoiTinDongBo = body.trangThai;
    }
    if (reorder) items.push(...items.splice(i, 1)); // ghi xong → đơn nhảy xuống cuối danh sách
    return { success: true, value: value(v) };
  }

  const wait = (ms, signal) => new Promise((ok, no) => {
    if (!ms) return ok();
    const t = setTimeout(ok, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); no(Object.assign(new Error('aborted'), { name: 'AbortError' })); }, { once: true });
  });

  async function fetch(url, init) {
    const call = { name: url.split('/').pop(), body: JSON.parse(init.body), token: init.headers.__RequestVerificationToken };
    calls.push(call);
    if (onCall) onCall(call);
    const kind = call.name === LIST ? 'read' : 'write';
    const n = load.now;
    n[kind]++;
    load.max = Math.max(load.max, n.read + n.write);
    load.maxRead = Math.max(load.maxRead, n.read);
    load.maxWrite = Math.max(load.maxWrite, n.write);
    if (n.read && n.write) load.overlap = true;
    try {
      await wait(call.name === LIST ? delay.list : delay.write, init.signal);
    } finally {
      n[kind]--;
    }
    const f = fault && fault(call, calls.length);
    if (f) return { status: f.status || 200, ok: (f.status || 200) < 400, text: async () => f.text };
    return { status: 200, ok: true, text: async () => JSON.stringify(handle(call.name, call.body)) };
  }

  return { fetch, calls, items, load };
}

export function makeStorage() {
  const data = {};
  return {
    data,
    async get(keys) {
      if (keys == null) return clone(data);
      const ks = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      return Object.fromEntries(ks.filter((k) => k in data).map((k) => [k, clone(data[k])]));
    },
    async set(obj) { Object.assign(data, clone(obj)); },
    async remove(keys) { for (const k of [].concat(keys)) delete data[k]; },
    async getKeys() { return Object.keys(data); },
  };
}

export const NEW_FILES = ['core/context.js', 'config.js', 'core/common.js', 'core/model.js', 'core/registry.js', 'core/log.js'];
export const NEW_RUNNER = 'core/runner.js';
export const legacyFiles = (ver) => ['config.js', 'common.js', 'content/api-context.js', 'content/api-rules.js', 'content/api-run.js'].map((f) => `legacy/${ver}/${f}`);

// Nạp bộ máy vào vm như một khung của trang MPLIS. ctxType: 'vbdlis3:ctx' (bản mới) | 'adx:ctx' (bản cũ)
export function boot({ files, server, ctxType, patch = '' }) {
  const storage = makeStorage();
  const runtime = [];
  const message = [];
  const ctx = vm.createContext({
    console: { log() {}, warn() {} },
    setTimeout, clearTimeout, AbortController, URL,
    location: { href: 'https://test.mplis.gov.vn/dc/XuLyDon', origin: 'https://test.mplis.gov.vn' },
    document: { addEventListener() {}, querySelector: () => null },
    fetch: server.fetch,
    chrome: {
      runtime: { id: 'test', sendMessage: async () => {}, onMessage: { addListener: (fn) => runtime.push(fn) } },
      storage: { local: storage },
    },
  });
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.addEventListener = (type, fn) => { if (type === 'message') message.push(fn); };
  for (const f of files) vm.runInContext(read(f), ctx, { filename: f });
  // Thử lại nhanh cho test (bản thật chờ 3 giây)
  vm.runInContext(`ADX_CONFIG.api.retryDelayMs = 1; ${patch}`, ctx);
  const data = {
    type: ctxType, token: TOKEN,
    listUrl: 'https://test.mplis.gov.vn/dc/TichHopDongBoDuLieuAjax/KiemTraDuLieuChuyenDoi',
    listBody: JSON.stringify(LIST_BODY),
  };
  // ev.source phải là `window` nhìn từ trong vm (global bên trong, khác đối tượng sandbox bên ngoài)
  const inner = vm.runInContext('globalThis', ctx);
  for (const fn of message) fn({ source: inner, data });
  const send = (msg) => new Promise((ok) => { for (const fn of runtime) fn(msg, {}, ok); });
  async function finish() {
    for (;;) {
      const s = await send({ cmd: 'apiStatus' });
      if (!s.running) return s;
      await new Promise((r) => setTimeout(r, 2));
    }
  }
  return { ctx, send, finish, storage: storage.data, get: (expr) => vm.runInContext(expr, ctx) };
}

// Chạy một lần từ đầu tới cuối, trả kết quả cuối cùng
export async function runOnce({ files, server, ctxType, start, patch }) {
  const b = boot({ files, server, ctxType, patch });
  const started = await b.send(start);
  const final = await b.finish();
  return { started, final, storage: b.storage, calls: server.calls, items: server.items, b };
}
