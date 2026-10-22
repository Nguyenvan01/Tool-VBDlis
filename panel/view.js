/*
 * Side Panel – phần THUẦN (không DOM): nhóm công cụ thành tab, trạng thái hiển thị của từng thẻ công cụ, phím chuyển tab.
 * panel.js chỉ việc áp kết quả lên DOM. Test: test/panel.test.mjs.
 */
const ADXView = (() => {
  // Tab = nhóm công cụ cùng nhãn `tab` (không có thì dùng `name`), theo thứ tự đăng ký (= thứ tự trong manifest).
  // ns: các nhật ký cần thẻ thống kê trong tab (công cụ ghi chung nhật ký thì chỉ một thẻ)
  function groupTabs(tools, logNs) {
    const tabs = [];
    for (const t of tools) {
      const label = t.tab || t.name;
      let g = tabs.find((x) => x.label === label);
      if (!g) tabs.push(g = { label, tools: [], ns: [] });
      g.tools.push(t);
      const ns = logNs(t);
      if (!g.ns.includes(ns)) g.ns.push(ns);
    }
    return tabs;
  }

  // Câu lỗi chuẩn của lõi khi một lệnh ghi hỏng (core/runner.js → execute):
  //   "Lỗi: Đơn <mã>: đã làm: …; HỎNG: …; chưa làm: … – <lý do>. Đã dừng, kiểm tra tay đơn này."
  // Tách để hiện rõ mã đơn và bước hỏng, không bỏ chữ nào. Câu khác mẫu → null (hiện nguyên văn).
  const ERR_RE = /^Lỗi: Đơn (\S+): (.+?) – ([\s\S]+)\. (Đã dừng, kiểm tra tay đơn này\.)$/;
  function splitError(msg) {
    const m = ERR_RE.exec(msg || '');
    if (!m) return null;
    const steps = m[2].split('; ').map((part) => /^(đã làm|HỎNG|chưa làm): (.+)$/.exec(part));
    if (steps.some((x) => !x)) return null;
    return {
      maDon: m[1],
      steps: steps.map(([, k, val]) => [k === 'HỎNG' ? k : k[0].toUpperCase() + k.slice(1), val]),
      reason: m[3],
      hint: m[4],
    };
  }

  // Trạng thái hiển thị của thẻ công cụ t, từ trạng thái s của khung được chọn.
  // old: cảnh báo lệch phiên bản ('' nếu không); error: lỗi lần bấm chạy gần nhất của t; runnerName: tên công cụ đang chạy
  function cardView(t, s, old, error, runnerName) {
    const running = !!(s && s.running);
    const mine = !!(s && s.tool === t.id);
    const v = {
      // Mỗi tab trình duyệt chỉ một công cụ chạy: đang chạy thì khoá nút chạy của MỌI công cụ
      startDisabled: running || !s || !s.hasCtx || !!old,
      // Nút Dừng ở thẻ nào cũng dừng được công cụ đang chạy
      stopDisabled: !running || !!s.stopping,
      stopText: running && s.stopping ? 'Đang dừng…' : 'Dừng',
      dot: s && s.dot ? 'Đợt ' + s.dot.slice(0, 8) + '…' : '',
      state: '',
      stateCls: 'api-state',
      report: null,
    };
    if (!s) {
      v.state = 'Extension chưa chạy trên tab này – tải lại trang (F5).';
    } else if (old && !running) {
      v.state = old;
      v.stateCls += ' err';
    } else if (running && !mine) {
      v.state = `Đang chạy: ${runnerName}`;
      v.stateCls += ' live';
    } else if (running) {
      v.state = '';
    } else if (error) {
      v.state = error;
      v.stateCls += ' err';
    } else if (mine && s.msg) {
      v.state = s.msg;
      v.stateCls += /^Lỗi|Chưa|đang chạy/.test(s.msg) ? ' err' : /^Xong/.test(s.msg) ? ' ok' : '';
    } else if (!s.hasCtx) {
      v.state = 'Chưa thấy danh sách đơn: F5 trang rồi mở hộp thoại "Xử lý đơn đăng ký" (extension cần lấy đợt bàn giao và mã xác thực từ lần trang tải danh sách).';
    }
    v.error = v.stateCls.endsWith(' err') ? splitError(v.state) : null;

    // Nhãn trạng thái ở đầu thẻ – chỉ khi dữ liệu có thật, cùng thứ tự ưu tiên với dòng trạng thái
    const badge = (cls, text) => ({ cls, text });
    const manual = t.panel.manual ? t.panel.manual(s || {}) : (s && s.counts && s.counts.unknown) || 0;
    if (!s || (old && !running) || (!running && !s.hasCtx)) v.badge = badge('idle', 'Chưa sẵn sàng');
    else if (running) v.badge = mine ? badge('run', 'Đang chạy') : null;
    else if (error) v.badge = /^Chưa/.test(error) ? badge('idle', 'Chưa sẵn sàng') : badge('err', 'Lỗi');
    else if (mine && /^Lỗi/.test(s.msg)) v.badge = badge('err', 'Lỗi');
    else if (mine && /^Xong/.test(s.msg)) v.badge = manual ? badge('warn', 'Cần kiểm tra') : badge('ok', 'Hoàn thành');
    else v.badge = null;
    // Tiến độ chỉ của lần chạy gần nhất của CHÍNH công cụ này – không lẫn giữa các thẻ
    if (mine && (running || s.msg)) {
      const p = t.panel.progress(s);
      v.report = { text: p.text, pct: p.pct, live: running, counters: t.panel.counters(s), note: t.panel.note ? t.panel.note(s) : '' };
    }
    return v;
  }

  // Phím trên thanh tab: ← → (vòng), Home, End
  const nextTab = (i, key, n) => ({ ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 })[key] ?? null;

  return { groupTabs, cardView, nextTab, splitError };
})();
