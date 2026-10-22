/*
 * Ngữ cảnh để các công cụ gọi lại API giống hệt trang: mã xác thực + đợt bàn giao đang mở.
 * Nhận từ core/hook.js, chỉ giữ trong bộ nhớ (không lưu gì). Chỉ core/runner.js được đọc.
 */
(() => {
  if (window.__adxCtxLoaded) return;
  window.__adxCtxLoaded = true;

  const ctx = { token: '', listUrl: '', listBody: null, seenAt: 0 };

  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (ev.source !== window || !d || d.type !== 'vbdlis3:ctx') return;
    if (d.token) ctx.token = d.token;
    if (d.listUrl && d.listBody) {
      try {
        const body = JSON.parse(d.listBody);
        if (body && body.dotBanGiaoNId) Object.assign(ctx, { listUrl: d.listUrl, listBody: body, seenAt: Date.now() });
      } catch (e) { /* bỏ qua */ }
    }
  });

  self.ADXApiContext = {
    get() {
      const input = document.querySelector('input[name="__RequestVerificationToken"]');
      return { ...ctx, token: ctx.token || (input && input.value) || '' };
    },
  };
})();
