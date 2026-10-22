/*
 * SỔ ĐĂNG KÝ CÔNG CỤ. Mỗi công cụ là một thư mục tools/<id>/ gồm rules.js (luật thuần, gán vào ADXRules.<id>)
 * và tool.js (gọi ADXTools.register). Thêm công cụ = thêm thư mục + MỘT dòng trong manifest.json – không sửa core/.
 * Lúc nạp, file tools/* chỉ được gán ADXRules / gọi register: chúng chạy cả ở trang lẫn ở Side Panel.
 */
const ADXRules = {};

const ADXTools = (() => {
  const tools = [];
  const fail = (id, msg) => { throw new Error(`Công cụ "${id}": ${msg}`); };

  function register(t) {
    const id = t && t.id;
    // id = tiền tố khoá lưu trữ và giá trị "tool" trong tin nhắn: chữ thường, một từ
    if (!/^[a-z]+$/.test(id || '')) fail(id, 'id phải là chữ thường a–z, một từ');
    if (tools.some((x) => x.id === id)) fail(id, 'id đã có');
    for (const k of ['name', 'counts', 'run', 'summary', 'panel']) if (!t[k]) fail(id, `thiếu "${k}"`);
    for (const k of ['start', 'confirm', 'progress', 'counters']) if (!t.panel[k]) fail(id, `thiếu "panel.${k}"`);
    if (typeof t.log === 'string') {
      // Ghi chung nhật ký của công cụ khác (VD audit ghi vào nhật ký của run, như bản cũ)
      const owner = tools.find((x) => x.id === t.log);
      if (!owner || typeof owner.log !== 'object') fail(id, `chưa có nhật ký "${t.log}" (công cụ đó phải đăng ký trước)`);
    } else if (!t.log || !t.log.title || !t.log.file || !t.log.results || !t.log.results.unknown) {
      fail(id, 'log cần title, file và results có "unknown" (KIỂM TRA TAY)');
    }
    tools.push(t);
  }

  const get = (id) => tools.find((t) => t.id === id) || null;
  // Namespace nhật ký của công cụ = id của công cụ sở hữu nhật ký đó
  const logNs = (t) => (typeof t.log === 'string' ? t.log : t.id);
  const logOf = (t) => get(logNs(t)).log;

  return { register, get, list: () => [...tools], logNs, logOf };
})();
