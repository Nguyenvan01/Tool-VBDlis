// KẾT QUẢ CỦA BẢN CŨ đã chốt: test/golden/<file>.json = { "<tình huống>": kết quả }.
// - Còn legacy/: tính lại từ code cũ; nếu đã chốt thì phải trùng bản đã chốt (GOLDEN=update node --test … để ghi lại),
//   chưa chốt thì ghi vào.
// - Không còn legacy/ (đã xoá): chỉ đọc bản đã chốt. Tình huống mới (fixture mới) thì không có kết quả cũ để so → báo lỗi rõ.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ROOT, plain } from './vm.mjs';

export const HAS_LEGACY = fs.existsSync(path.join(ROOT, 'legacy'));
const UPDATE = process.env.GOLDEN === 'update';
const cache = new Map();

function load(file) {
  if (!cache.has(file)) {
    const p = path.join(ROOT, 'test/golden', `${file}.json`);
    cache.set(file, fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {});
  }
  return cache.get(file);
}
function store(file, key, value) {
  const data = load(file);
  data[key] = value;
  const dir = path.join(ROOT, 'test/golden');
  fs.mkdirSync(dir, { recursive: true });
  const sorted = Object.fromEntries(Object.keys(data).sort().map((k) => [k, data[k]]));
  fs.writeFileSync(path.join(dir, `${file}.json`), JSON.stringify(sorted, null, 1) + '\n');
}

// compute: hàm chạy code cũ (đồng bộ hoặc trả Promise); kết quả phải chuyển được sang JSON
export function legacy(file, key, compute) {
  if (!HAS_LEGACY) {
    const data = load(file);
    if (!(key in data)) throw new Error(`Không có kết quả bản cũ đã chốt cho "${key}" (test/golden/${file}.json) – legacy/ đã xoá nên không tính lại được`);
    return data[key];
  }
  const keep = (v) => {
    const fresh = v === undefined ? null : plain(v);
    const data = load(file);
    if (UPDATE || !(key in data)) store(file, key, fresh);
    else assert.deepEqual(fresh, data[key], `kết quả bản cũ đã chốt cho "${key}" không còn trùng code cũ`);
    return fresh;
  };
  const r = compute();
  return r && typeof r.then === 'function' ? r.then(keep) : keep(r);
}
