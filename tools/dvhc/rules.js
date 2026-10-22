/*
 * LUẬT "DUYỆT ĐVHC 2 CẤP" – thuần, không I/O. Lệnh dựng bằng core/model.js (không viết body mới).
 * Đơn chưa xử lý mà khung trái và khung phải cùng Giấy chứng nhận (cùng tập số phát hành) và cùng chủ sử dụng
 * (tên giống hệt, kể cả hoa / thường) → duyệt: Thêm vào dữ liệu vận hành → Cập nhật lịch sử. Không khớp → Không xử lý.
 */
ADXRules.dvhc = (() => {
  const M = ADXModel;
  // Hai danh sách mã giống nhau (không kể thứ tự) – như sameIds của luật duyệt
  const sameIds = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
  // Hai tập giống nhau (không kể thứ tự, bỏ trùng); tập rỗng không bao giờ "trùng"
  const sameSet = (a, b) => {
    const x = [...new Set(a)].sort();
    const y = [...new Set(b)].sort();
    return x.length > 0 && x.length === y.length && x.every((v, i) => v === y[i]);
  };

  // Mọi số phát hành trong một khung (dò cả cây dữ liệu), bỏ khoảng trắng, không phân biệt hoa / thường
  function soPhatHanh(root) {
    const out = [];
    const walk = (o, depth) => {
      if (!o || typeof o !== 'object' || depth > 14) return;
      if (Array.isArray(o)) { o.forEach((x) => walk(x, depth + 1)); return; }
      for (const [k, v] of Object.entries(o)) {
        if (/^soPhatHanh$/i.test(k) && v != null && typeof v !== 'object' && !ADX.isEmptyValue(String(v))) {
          out.push(String(v).replace(/\s+/g, '').toUpperCase());
        } else if (v && typeof v === 'object') walk(v, depth + 1);
      }
    };
    walk(root, 0);
    return out;
  }
  // Số phát hành của MỘT khung: chỉ lấy ở mục Giấy chứng nhận (ListGiayChungNhan) – dò cả cây sẽ vớ cả số của
  // dữ liệu khác trong khung (18/10/2026: khung phải ra hàng chục số không có trên trang). Không có mục đó mới dò cả cây.
  const soCuaKhung = (k) => soPhatHanh(Array.isArray(k && k.ListGiayChungNhan) ? k.ListGiayChungNhan : k);

  // Hai khung có khớp không (cùng số phát hành – hoặc cả hai không có – và cùng tên chủ). ok = nên duyệt.
  function khop(v, d) {
    const tc = v.ThongTinDangKyThiCong || {};
    const vh = Array.isArray(v.ThongTinDangKyVanHanh) ? v.ThongTinDangKyVanHanh : [];
    // Bản ghi khung phải không khớp danh sách mã của đơn → không thể Cập nhật lịch sử đúng → Không xử lý
    if (!sameIds(vh.map((h) => (h.TinhHinhDangKy || {}).tinhHinhDangKyId), d.vhIds)) return { ok: false, reason: 'khung phải không khớp mã tình hình đăng ký' };
    const phTrai = soCuaKhung(tc);
    const phPhai = vh.flatMap(soCuaKhung);
    const chuTrai = d.owners;      // tên đã chuẩn hoá khoảng trắng (ADX.norm), GIỮ hoa / thường
    const chuPhai = d.ownersRight;
    const why = [];
    // Cả hai khung đều không có số phát hành → chỉ xét tên chủ
    const khongSo = !phTrai.length && !phPhai.length;
    if (!khongSo && !sameSet(phTrai, phPhai)) why.push(`số phát hành khác (trái: ${[...new Set(phTrai)].join(', ') || 'không có'}; phải: ${[...new Set(phPhai)].join(', ') || 'không có'})`);
    if (!sameSet(chuTrai, chuPhai)) why.push(`tên chủ khác (trái: ${chuTrai.join('; ') || 'không có'}; phải: ${chuPhai.join('; ') || 'không có'})`);
    if (why.length) return { ok: false, reason: why.join(' · ') };
    return { ok: true, reason: khongSo ? 'cả hai khung không có số phát hành, trùng tên chủ' : `trùng số phát hành ${[...new Set(phTrai)].join(', ')} và tên chủ` };
  }
  // Lệnh đánh đúng theo kết quả khop: duyệt = Thêm vào → Cập nhật lịch sử; không khớp = Không xử lý
  function danh(d, k) {
    if (!k.ok) return [M.thiCong(d.goi, 0, 'Không xử lý')];
    const reqs = [M.thiCong(d.goi, 1, 'Thêm vào dữ liệu vận hành')];
    if (d.vhIds.length) reqs.push(M.vanHanh(d.goi, d.vhIds, 3, 1, 'Cập nhật lịch sử'));
    return reqs;
  }
  const kindOf = (k) => (k.ok ? 'approve' : 'reject');

  // Xét theo thứ tự, khớp đâu dừng đó
  function dvhcFor(v, d) {
    const tc = v.ThongTinDangKyThiCong || {};
    const unknown = (why) => ({ kind: 'unknown', label: `Duyệt ĐVHC: ${why} – kiểm tra tay`, reqs: [] });
    // Không cần mã đơn: lệnh chỉ dùng mã gói tin (+ mã bản ghi khung phải); mã đơn chỉ để ghi log
    if (!d.goi) return unknown('không có mã gói tin');
    if (M.serverState(v) !== 'pending') return { kind: 'skip', label: `bỏ qua (${M.stateLabel(v)})`, reqs: [] };
    const k = khop(v, d);
    // Không xử lý mà khung phải còn Cập nhật lịch sử (VD đơn Bỏ duyệt dở) → Bỏ duyệt khung phải trước
    const hist = !k.ok && M.vhActions(v).includes(3);
    const reqs = [...(hist ? [M.vanHanh(d.goi, M.historyIds(v), -1, 0, 'Bỏ duyệt (khung phải)')] : []), ...danh(d, k)];
    // Đã bị "Bỏ duyệt" (người làm, hoặc extension hỏng giữa lúc đánh lại) → đánh lại theo luật như đơn chưa xử lý
    const boDuyet = tc.ActionProcessSyncData === -1;
    return {
      kind: kindOf(k), fix: boDuyet || hist,
      reason: boDuyet ? `sửa từ "đã Bỏ duyệt": ${k.reason}` : k.reason,
      label: reqs.map((r) => r.label).join(' → '), reqs,
    };
  }

  // SỬA ĐƠN ĐÁNH NHẦM: đơn đã xử lý mà kết quả khác luật → Bỏ duyệt khung phải (nếu đã Cập nhật lịch sử)
  // → Bỏ duyệt khung trái (đơn về chưa xử lý) → đánh lại đúng luật. Hai lệnh Bỏ duyệt giống hệt Gỡ duyệt của bộ công cụ cũ.
  // Đơn chưa xử lý (kể cả đã bị Bỏ duyệt) do dvhcFor đánh.
  function suaFor(v, d) {
    const unknown = (why) => ({ kind: 'unknown', label: `Sửa ĐVHC: ${why} – kiểm tra tay`, reqs: [] });
    if (!d.goi) return unknown('không có mã gói tin');
    const s = M.serverState(v);
    if (s === 'pending') return { kind: 'skip', label: `bỏ qua (${M.stateLabel(v)} – dùng Duyệt ĐVHC)`, reqs: [] };
    if (s === 'other') return unknown(M.stateLabel(v));
    const k = khop(v, d);
    const hist = M.vhActions(v).includes(3);
    // Đúng = duyệt đủ (mọi bản ghi khung phải đã Cập nhật lịch sử) hoặc Không xử lý mà khung phải chưa Cập nhật lịch sử
    const dung = k.ok ? s === 'approved' && sameIds(M.historyIds(v), d.vhIds) : s === 'noaction' && !hist;
    if (dung) return { kind: 'ok', label: `đã đúng (${M.stateLabel(v)})`, reason: k.reason, reqs: [] };
    // Gỡ đúng các bản ghi khung phải đang Cập nhật lịch sử (mã lấy từ chính bản ghi – đúng cả khi khung phải không khớp)
    const reqs = hist ? [M.vanHanh(d.goi, M.historyIds(v), -1, 0, 'Bỏ duyệt (khung phải)')] : [];
    reqs.push(M.thiCong(d.goi, -1, 'Bỏ duyệt (khung trái)', 0), ...danh(d, k));
    return {
      kind: kindOf(k), fix: true,
      reason: `sửa từ "${M.stateLabel(v)}": ${k.reason}`,
      label: reqs.map((r) => r.label).join(' → '), reqs,
    };
  }

  // MỘT nút: chưa xử lý → duyệt; đã xử lý → kiểm tra, sai thì gỡ và đánh lại
  const planFor = (v, d) => (M.serverState(v) === 'pending' ? dvhcFor(v, d) : suaFor(v, d));

  return { planFor, dvhcFor, suaFor, soPhatHanh };
})();
