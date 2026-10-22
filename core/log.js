/*
 * Lưu trữ (chrome.storage.local) – NƠI DUY NHẤT trong extension gọi chrome.storage. Token / listBody không bao giờ tới đây.
 * Nhật ký (Thống kê / xuất CSV) theo namespace ns = id công cụ sở hữu nhật ký:
 *   "<ns>:log:<mã đơn>"  MỖI ĐƠN MỘT MỤC
 *   "<ns>:stats"         mục tổng nhỏ { total, <mỗi khoá của log.results>, next }
 * Ghi chỉ đụng tới các đơn vừa xử lý, Side Panel chỉ đọc mục tổng → không giới hạn số đơn, không chậm dần khi log lớn.
 * Dữ liệu riêng của công cụ: "<id>:<khoá>" (VD audit:last).
 */
const ADXLog = (() => {
  const store = () => chrome.storage.local;
  const prefix = (ns) => `${ns}:log:`;
  const statsKey = (ns) => `${ns}:stats`;
  const results = (ns) => ADXTools.get(ns).log.results;
  const bucket = (ns, result) => Object.keys(results(ns)).find((k) => results(ns)[k].text === result) || '';
  const blank = (ns) => ({ total: 0, ...Object.fromEntries(Object.keys(results(ns)).map((k) => [k, 0])), next: 1 });

  async function keys(ns) {
    const all = store().getKeys ? await store().getKeys() : Object.keys(await store().get(null));
    return all.filter((k) => k.startsWith(prefix(ns)));
  }

  // Toàn bộ nhật ký của ns, đúng thứ tự ghi
  async function all(ns) {
    const r = await store().get(null);
    return Object.keys(r).filter((k) => k.startsWith(prefix(ns))).map((k) => r[k]).sort((a, b) => (a.seq || 0) - (b.seq || 0));
  }

  // Đếm lại từ đầu (dùng khi chưa có mục tổng)
  async function recount(ns) {
    const s = blank(ns);
    for (const e of await all(ns)) {
      s.total++;
      const b = bucket(ns, e.result);
      if (b) s[b]++;
      s.next = Math.max(s.next, (e.seq || 0) + 1);
    }
    await store().set({ [statsKey(ns)]: s });
    return s;
  }

  // ĐIỂM GHI NHẬT KÝ DUY NHẤT của mọi công cụ (sau này gắn thêm nơi gửi – VD Postgres – ở đây, không sửa công cụ).
  // batch: [[mã đơn, các trường cần ghi], …] – đơn đã có thì ghi đè các trường đó
  async function write(ns, batch) {
    const ks = batch.map(([k]) => prefix(ns) + k);
    const cur = await store().get([...ks, statsKey(ns)]);
    const s = cur[statsKey(ns)] || await recount(ns);
    const out = {};
    const time = new Date().toLocaleString('vi-VN');
    batch.forEach(([key, patch], i) => {
      const old = out[ks[i]] || cur[ks[i]];
      if (old) {
        const b = bucket(ns, old.result);
        if (b) s[b]--;
      } else {
        s.total++;
      }
      const e = old ? { ...old, ...patch } : { key, maDon: key, time, action: '', actionTime: '', seq: s.next++, ...patch };
      const b = bucket(ns, e.result);
      if (b) s[b]++;
      out[ks[i]] = e;
    });
    await store().set({ ...out, [statsKey(ns)]: s });
  }

  async function stats(ns) {
    return (await store().get(statsKey(ns)))[statsKey(ns)] || recount(ns);
  }

  async function clear(ns) {
    await store().remove([...(await keys(ns)), statsKey(ns)]);
  }

  const dataKey = (id, key) => `${id}:${key}`;
  const save = (id, key, value) => store().set({ [dataKey(id, key)]: value });
  const load = async (id, key) => (await store().get(dataKey(id, key)))[dataKey(id, key)];

  return { write, all, stats, clear, save, load, statsKey, dataKey };
})();
