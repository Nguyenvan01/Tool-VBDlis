// Nạp script cổ điển (không phải module) vào node:vm – đúng như trình duyệt nạp content script theo manifest:
// các file chạy lần lượt trong CÙNG một ngữ cảnh và dùng chung phạm vi toàn cục. File của extension không phải sửa gì.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
export const readJson = (rel) => JSON.parse(read(rel));
// Bỏ khác biệt giữa các ngữ cảnh vm (prototype) trước khi so sánh
export const plain = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

export function loadScripts(files, globals = {}) {
  const ctx = vm.createContext({ ...globals });
  for (const f of files) vm.runInContext(read(f), ctx, { filename: f });
  return { ctx, get: (expr) => vm.runInContext(expr, ctx) };
}

// Luật thuần của bản mới / bản cũ – nạp KHÔNG có chrome, fetch, document, setTimeout
export const NEW_CORE = ['config.js', 'core/common.js', 'core/model.js', 'core/registry.js'];
export const legacyRules = (ver) => [`legacy/${ver}/config.js`, `legacy/${ver}/common.js`, `legacy/${ver}/content/api-rules.js`];
export const LEGACY_DUYET = 'duyet-2.1.3';
export const LEGACY_GO = 'go-duyet-2.2.4';
