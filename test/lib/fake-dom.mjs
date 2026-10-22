// DOM GIẢ tối giản – chỉ đủ những gì panel/panel.js dùng (createElement, append, id, class, thuộc tính, textContent,
// hidden, disabled, onclick, onkeydown, focus). Không phải trình duyệt: bố cục / CSS phải kiểm bằng mắt trên Chrome.
import vm from 'node:vm';
import path from 'node:path';
import { read } from './vm.mjs';
import { makeStorage } from './fake-mplis.mjs';

export function makeDocument(onScript) {
  const byId = new Map();
  const doc = { activeElement: null };

  class El {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.attrs = {};
      this.style = {};
      this.dataset = {};
      this.className = '';
      this.hidden = false;
      this.disabled = false;
      this.tabIndex = 0;
      this.text = '';
      const el = this;
      const list = () => el.className.split(/\s+/).filter(Boolean);
      this.classList = {
        contains: (c) => list().includes(c),
        add: (c) => { if (!list().includes(c)) el.className = [...list(), c].join(' '); },
        remove: (c) => { el.className = list().filter((x) => x !== c).join(' '); },
        toggle: (c, force) => {
          const on = force === undefined ? !list().includes(c) : !!force;
          if (on) el.classList.add(c); else el.classList.remove(c);
          return on;
        },
      };
    }
    get id() { return this.attrs.id || ''; }
    set id(v) { this.attrs.id = v; byId.set(v, this); }
    setAttribute(k, v) {
      if (k === 'class') this.className = String(v);
      else if (k === 'id') this.id = String(v);
      else this.attrs[k] = String(v);
    }
    getAttribute(k) { return k === 'class' ? this.className : (this.attrs[k] ?? null); }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this.text = String(v); this.children = []; }
    get lastChild() { return this.children[this.children.length - 1] || null; }
    append(...cs) { for (const c of cs) this.appendChild(typeof c === 'string' ? Object.assign(new El('#text'), { text: c }) : c); }
    appendChild(c) {
      if (c.parentNode) c.remove();
      this.children.push(c);
      c.parentNode = this;
      if (c.tagName === 'SCRIPT' && onScript) onScript(c);
      return c;
    }
    remove() {
      const p = this.parentNode;
      if (p) p.children.splice(p.children.indexOf(this), 1);
      this.parentNode = null;
    }
    click() { if (this.onclick && !this.disabled) return this.onclick({ preventDefault() {} }); return undefined; }
    keydown(key) { if (this.onkeydown) this.onkeydown({ key, preventDefault() {} }); }
    focus() { doc.activeElement = this; }
    // tiện cho test: mọi con cháu thoả điều kiện
    all(pred = () => true) {
      const out = [];
      const walk = (e) => { for (const c of e.children) { if (pred(c)) out.push(c); walk(c); } };
      walk(this);
      return out;
    }
    byClass(c) { return this.all((e) => e.classList.contains(c)); }
    // đang hiện thật: chính nó và mọi tổ tiên đều không hidden
    get shown() { for (let e = this; e; e = e.parentNode) if (e.hidden) return false; return true; }
  }

  Object.assign(doc, {
    body: new El('body'),
    createElement: (t) => new El(t),
    createElementNS: (_ns, t) => new El(t),
    getElementById: (id) => byId.get(id) || null,
  });
  return doc;
}

// Chạy Side Panel thật (panel.html: config, core, view.js, panel.js) với chrome giả.
// frame(msg) → phản hồi của khung trên trang MPLIS cho tin nhắn msg (null = trang không có content script)
export async function bootPanel({ frame, storage = {}, version }) {
  const manifest = JSON.parse(read('manifest.json'));
  if (version) manifest.version = version;
  const sent = [];
  const blobs = [];
  const on = {};
  const store = makeStorage();
  Object.assign(store.data, storage);
  let ctx;
  const doc = makeDocument((script) => {
    // <script src="../tools/x.js"> → nạp file vào cùng ngữ cảnh, như trình duyệt
    const file = path.posix.normalize(path.posix.join('panel', script.src));
    try {
      vm.runInContext(read(file), ctx, { filename: file });
      setTimeout(() => script.onload(), 0);
    } catch (e) {
      setTimeout(() => script.onerror(e), 0);
    }
  });
  for (const id of ['tabs', 'panels']) {
    const e = doc.createElement(id === 'tabs' ? 'nav' : 'main');
    e.id = id;
    doc.body.appendChild(e);
  }
  const chrome = {
    runtime: { getManifest: () => manifest, onMessage: { addListener: (fn) => { on.message = fn; } } },
    tabs: {
      query: async () => [{ id: 7 }],
      sendMessage: async (_tab, msg) => {
        sent.push(msg);
        const r = frame(msg);
        if (r == null) throw new Error('Could not establish connection');
        return JSON.parse(JSON.stringify(r));
      },
      onActivated: { addListener() {} },
      onUpdated: { addListener() {} },
    },
    webNavigation: { getAllFrames: async () => [{ frameId: 0 }] },
    storage: { local: store, onChanged: { addListener: (fn) => { on.changed = fn; } } },
  };
  ctx = vm.createContext({
    document: doc, chrome, console, Blob, Promise,
    setTimeout: (fn, ms) => (ms >= 1000 ? 0 : setTimeout(fn, ms)), // bỏ hẹn giờ dài (thu hồi URL tải file)
    clearTimeout,
    setInterval: () => 0, // không hỏi trạng thái định kỳ trong test
    URL: { createObjectURL: (b) => { blobs.push(b); return 'blob:test'; }, revokeObjectURL() {} },
    confirm: () => true,
    alert: () => {},
  });
  for (const f of ['config.js', 'core/common.js', 'core/model.js', 'core/registry.js', 'core/log.js', 'core/csv.js', 'panel/view.js', 'panel/panel.js']) {
    vm.runInContext(read(f), ctx, { filename: f });
  }
  await vm.runInContext('ready', ctx);
  const settle = () => new Promise((r) => setTimeout(r, 5));
  await settle();
  return {
    doc, ctx, sent, blobs, store, settle,
    tabs: () => doc.getElementById('tabs').children,
    panels: () => doc.getElementById('panels').children,
    refresh: async () => { await vm.runInContext('refreshApi()', ctx); await settle(); },
    // giả lập storage.onChanged
    change: async (key, newValue) => { store.data[key] = newValue; on.changed({ [key]: { newValue } }, 'local'); await settle(); },
  };
}
