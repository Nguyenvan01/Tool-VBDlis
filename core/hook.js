/*
 * Chạy trong "MAIN world" từ document_start: lấy NGỮ CẢNH để các công cụ gọi API giống hệt trang –
 * mã xác thực (__RequestVerificationToken) và nội dung lần lấy danh sách đơn gần nhất (đợt bàn giao đang mở).
 * Chỉ nhìn request trang gửi đi – không sửa, không chặn, không đọc nội dung trả về, không gửi thêm request nào.
 * Chuyển sang core/context.js (thế giới riêng của extension) qua postMessage.
 * Cờ và kiểu thông điệp mang tên riêng của bản 3: MAIN world dùng chung với trang, nên không được trùng extension cũ.
 */
(() => {
  if (window.__vbdlis3HookLoaded) return;
  window.__vbdlis3HookLoaded = true;

  const LIST_RE = /\/KiemTraDuLieuChuyenDoi(\?|$)/;
  let lastToken = '';

  const absUrl = (u) => {
    try { return new URL(String(u), location.href).href; } catch (e) { return String(u); }
  };

  // Chỉ báo khi có mã xác thực MỚI hoặc khi trang lấy danh sách đơn
  function seen(method, url, headers, body) {
    const key = Object.keys(headers).find((k) => k.toLowerCase() === '__requestverificationtoken');
    const token = key ? String(headers[key] || '') : '';
    const isList = String(method).toUpperCase() === 'POST' && LIST_RE.test(url);
    if (!isList && (!token || token === lastToken)) return;
    if (token) lastToken = token;
    try {
      window.postMessage({
        type: 'vbdlis3:ctx', token,
        listUrl: isList ? url : '',
        listBody: isList && typeof body === 'string' ? body : '',
      }, location.origin);
    } catch (e) { /* bỏ qua */ }
  }

  // ---------------------------------------------------------------- XMLHttpRequest (jQuery $.ajax dùng cái này)
  const XP = XMLHttpRequest.prototype;
  const origOpen = XP.open;
  const origSend = XP.send;
  const origSetHeader = XP.setRequestHeader;

  XP.open = function (method, url) {
    this.__adx = { method: String(method || 'GET'), url: absUrl(url), headers: {} };
    return origOpen.apply(this, arguments);
  };
  XP.setRequestHeader = function (k, v) {
    if (this.__adx) this.__adx.headers[k] = v;
    return origSetHeader.apply(this, arguments);
  };
  XP.send = function (body) {
    const info = this.__adx;
    if (info) seen(info.method, info.url, info.headers, body);
    return origSend.apply(this, arguments);
  };

  // ---------------------------------------------------------------- fetch
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input, init) {
      try {
        const req = input instanceof Request ? input : null;
        const headers = {};
        new Headers((init && init.headers) || (req && req.headers) || {}).forEach((v, k) => { headers[k] = v; });
        seen((init && init.method) || (req && req.method) || 'GET', absUrl(req ? req.url : input), headers, init && init.body);
      } catch (e) { /* bỏ qua */ }
      return origFetch.apply(this, arguments);
    };
  }
})();
