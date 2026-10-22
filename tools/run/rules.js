/*
 * LUẬT DUYỆT trên dữ liệu JSON của API – thuần, không I/O. Chép nguyên văn từ bản Duyệt 2.1.3 (content/api-rules.js);
 * phần dùng chung (ownerNames, serverState, stateLabel, lệnh thiCong / vanHanh) lấy từ core/model.js.
 * Dùng cho "Chạy tự động" (run) và "Quét và sửa lỡ duyệt GCN" (audit, planFor với fixApproved).
 */
ADXRules.run = (() => {
  const M = ADXModel;

  // Cờ quy tắc (bản cũ để ở config.js → rules), cố định – không có mục cài đặt
  const RULES = {
    // NGUYÊN TẮC (cố định trong decide): có thông tin Giấy chứng nhận là TUYỆT ĐỐI KHÔNG DUYỆT,
    // kể cả khi chưa có Số phát hành / Số vào sổ (VD DON_22586703, DON_22586704)
    // Khung trái (đơn mới) không có thông tin chủ VÀ không có thông tin đất → KHÔNG DUYỆT
    rejectIfLeftEmpty: true,
    // Đơn đã bị "Bỏ duyệt" trước đó (chưa xử lý lại) → kiểm tra tay, không tự duyệt lại đè lên quyết định của người
    keepUndone: true,
    // Đơn được duyệt: khung phải chỉ Cập nhật lịch sử các bản ghi trùng số tờ / số thửa với khung trái; bản ghi khác (kể cả
    // bản ghi không có số tờ / số thửa) để nguyên. false = như bản cũ: Cập nhật lịch sử mọi bản ghi.
    // ponytail: tên trường số tờ / số thửa khung phải chưa xác nhận trên trang thật – nếu sai, mọi đơn chỉ được Thêm vào;
    // tắt cờ này để quay về cách cũ trong lúc sửa TO_KEY / THUA_KEY
    historyByLand: true,
  };

  // Ngày rỗng của máy chủ (.NET DateTime.MinValue) – coi như không có giá trị
  const EMPTY_DATE = /^\/Date\(-62135\d+\)\/$/;
  const nonEmpty = (v) => {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'string') return !ADX.isEmptyValue(v) && v.trim() !== '[]' && !EMPTY_DATE.test(v.trim());
    return true;
  };

  // Mọi dấu hiệu có Giấy chứng nhận trong một khung (trả về danh sách mô tả, rỗng = không có):
  //   - trường có tên chứa "GiayChungNhan" là danh sách có phần tử / đối tượng khác rỗng
  //     (ListGiayChungNhan, ListQuanLyMaGiayChungNhan, GiayChungNhan, giayChungNhanIds, thuThapThongTinGiayChungNhanIds…)
  //   - …GiayChungNhanId > 0, laGiayChungNhan = true (file quét chính là GCN)
  //   - Số phát hành / Số vào sổ / Ngày vào sổ / Mã GCN / Số seri có giá trị
  //   Bỏ qua: giấy chứng nhận KẾT HÔN, loại / phiên bản / tình trạng GCN (chỉ là thuộc tính, không phải có GCN)
  const GCN_KEY = /giaychungnhan/i;
  const GCN_IGNORE = /kethon|^loai|^version|^tinhtrang/i;
  const GCN_VALUES = /^(soPhatHanh|soVaoSo|soVaoSoCu|ngayVaoSo|maGiayChungNhan|soSeri|soSerial)$/i;
  function gcnSignals(root) {
    const out = [];
    const seen = new Set();
    const walk = (o, depth) => {
      if (!o || typeof o !== 'object' || depth > 14 || seen.has(o)) return;
      seen.add(o);
      if (Array.isArray(o)) { o.forEach((x) => walk(x, depth + 1)); return; }
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (GCN_VALUES.test(k)) {
          if (v != null && typeof v !== 'object' && nonEmpty(String(v))) out.push(`${k}=${v}`);
        } else if (GCN_KEY.test(k) && !GCN_IGNORE.test(k)) {
          if (Array.isArray(v) ? v.length > 0 : v && typeof v === 'object') out.push(`${k} (${Array.isArray(v) ? v.length : 1})`);
          else if (typeof v === 'number' && v > 0 && /id$/i.test(k)) out.push(`${k}=${v}`);
          else if (v === true) out.push(k);
          else if (typeof v === 'string' && /ids$/i.test(k) && nonEmpty(v)) out.push(k);
        }
        if (v && typeof v === 'object') walk(v, depth + 1);
      }
    };
    walk(root, 0);
    return ADX.uniq(out);
  }

  // Số tờ / số thửa của từng thửa (khung trái; khung phải chỉ lấy pairs để so): lỗi nếu trống, có chữ cái, hoặc cả hai là 0
  // ponytail: tên trường đoán theo VBDLIS – nếu máy chủ dùng tên khác, đơn sẽ về "Kiểm tra tay" (không gửi gì)
  const TO_KEY = /^(soTo|soToBanDo|soHieuToBanDo)$/i;
  const THUA_KEY = /^(soThua|soThuaDat|soThuTuThua)$/i;
  function landProblems(taiSan) {
    const out = [];
    const pairs = [];
    let found = 0;
    const walk = (o, depth) => {
      if (!o || typeof o !== 'object' || depth > 8) return;
      if (Array.isArray(o)) { o.forEach((x) => walk(x, depth + 1)); return; }
      const keys = Object.keys(o);
      const kTo = keys.find((k) => TO_KEY.test(k));
      const kThua = keys.find((k) => THUA_KEY.test(k));
      if (kTo || kThua) {
        found++;
        const to = ADX.norm(kTo ? o[kTo] : '');
        const thua = ADX.norm(kThua ? o[kThua] : '');
        const tt = `tờ "${to}", thửa "${thua}"`;
        // "027" = "27": so theo số khi là chữ số
        const num = (s) => (/^\d+$/.test(s) ? String(Number(s)) : s);
        if (to || thua) pairs.push(`${num(to)}/${num(thua)}`);
        if (!to || !thua) out.push(`Số tờ / số thửa để trắng (${tt})`);
        else if (!/^\d+$/.test(to) || !/^\d+$/.test(thua)) out.push(`Số tờ / số thửa có chữ cái (${tt})`);
        else if (Number(to) === 0 && Number(thua) === 0) out.push(`Số tờ, số thửa là 0, 0`);
      }
      for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, depth + 1);
    };
    walk(taiSan, 0);
    return { found, problems: ADX.uniq(out), pairs: ADX.uniq(pairs) };
  }

  // Hai danh sách mã giống nhau (không kể thứ tự)
  const sameIds = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
  const fmtPairs = (p) => p.map((x) => `tờ ${x.replace('/', ', thửa ')}`).join('; ') || 'không có';

  const anyList = (o) => !!o && Object.values(o).some((x) => Array.isArray(x) && x.length > 0);

  function decide(v) {
    const tc = v.ThongTinDangKyThiCong || {};
    const vh = Array.isArray(v.ThongTinDangKyVanHanh) ? v.ThongTinDangKyVanHanh : [];
    const vhIds = Array.isArray(v.tinhHinhDangKyVanHanhIds) ? v.tinhHinhDangKyVanHanhIds : [];
    const res = {
      status: 'unknown', reasons: [],
      maDon: (tc.TinhHinhDangKy && tc.TinhHinhDangKy.maDon) || '',
      goi: v.goiTinDongBoNId || '',
      owners: M.ownerNames(tc.ChuSoHuu),
      ownersRight: ADX.uniq(vh.flatMap((h) => M.ownerNames(h.ChuSoHuu))),
      gcn: vh.flatMap((h) => h.ListGiayChungNhan || []).map((g) => ({ soPhatHanh: g.soPhatHanh || '', soVaoSo: g.soVaoSo || '' })),
      vhIds,
    };
    const gRight = gcnSignals(vh);
    if (nonEmpty(v.giayChungNhanIds)) gRight.push('giayChungNhanIds');
    const gLeft = gcnSignals(tc);
    const leftHasOwner = anyList(tc.ChuSoHuu);
    const leftHasLand = anyList(tc.TaiSan);
    const land = landProblems(tc.TaiSan);
    // Số tờ / số thửa từng bản ghi khung phải (thửa hiện tại – không tính "tờ / thửa cũ").
    // Bản ghi trùng = mọi thửa của nó đều có ở khung trái; chỉ bản ghi trùng được Cập nhật lịch sử, bản ghi khác để nguyên
    // (khung trái vẫn Thêm vào dữ liệu vận hành). Không bản ghi nào có số tờ / số thửa → không Cập nhật lịch sử bản ghi nào.
    const recs = vh.map((h) => ({ id: (h.TinhHinhDangKy || {}).tinhHinhDangKyId, pairs: landProblems(h.TaiSan).pairs })).filter((r) => r.pairs.length);
    const landRight = ADX.uniq(recs.flatMap((r) => r.pairs));
    const match = recs.filter((r) => r.pairs.every((p) => land.pairs.includes(p)));

    // NGUYÊN TẮC: có thông tin Giấy chứng nhận là TUYỆT ĐỐI KHÔNG DUYỆT
    if (gRight.length) {
      res.status = 'reject';
      res.reasons.push('Khung phải đã có Giấy chứng nhận: ' + gRight.slice(0, 4).join(', '));
    } else if (gLeft.length) {
      res.status = 'reject';
      res.reasons.push('Khung trái có thông tin Giấy chứng nhận: ' + gLeft.slice(0, 4).join(', '));
    } else if (!res.goi) {
      res.reasons.push('Không có mã gói tin (goiTinDongBoNId)');
    } else if (!res.maDon) {
      res.reasons.push('Không có mã đơn');
    } else if (vh.some((h) => ADX.key((h.TinhHinhDangKy || {}).maDon) === ADX.key(res.maDon))) {
      // Mã đơn khung trái trùng mã đơn một bản ghi khung phải → không duyệt (bảng nguyên tắc, dòng 22)
      // ponytail: mã đơn khung phải đọc ở TinhHinhDangKy.maDon như khung trái – chưa xác nhận trên trang thật
      res.status = 'reject';
      res.reasons.push(`Mã đơn khung trái trùng mã đơn khung phải (${res.maDon})`);
    } else if (RULES.rejectIfLeftEmpty && !leftHasOwner && !leftHasLand) {
      res.status = 'reject';
      res.reasons.push('Khung trái không có thông tin chủ và đất');
    } else if (land.problems.length) {
      res.status = 'reject';
      res.reasons.push('Khung trái: ' + land.problems.slice(0, 3).join('; '));
    } else if (!land.found) {
      res.reasons.push('Khung trái không thấy trường số tờ / số thửa – kiểm tra tay');
    } else if (!sameIds(vh.map((h) => (h.TinhHinhDangKy || {}).tinhHinhDangKyId), vhIds)) {
      res.reasons.push('Khung phải không khớp mã tình hình đăng ký – kiểm tra tay');
    } else if (RULES.keepUndone && tc.ActionProcessSyncData === -1 && v.trangThaiGoiTinDongBo === 0) {
      // Ai đó đã chủ động "Bỏ duyệt" đơn này – không tự duyệt lại đè lên quyết định của người
      res.reasons.push('Đơn đã bị "Bỏ duyệt" trước đó – kiểm tra tay, extension không tự duyệt lại');
    } else {
      // Khung phải có nhiều bản ghi mà không có GCN vẫn ĐƯỢC DUYỆT (chỉ có GCN mới không duyệt)
      res.status = 'approve';
      res.reasons.push(vh.length ? 'Khung phải không có Giấy chứng nhận' : 'Khung phải trống');
      // Chỉ một phần (hoặc không) bản ghi khung phải trùng tờ / thửa → chỉ Cập nhật lịch sử các bản ghi đó
      if (RULES.historyByLand && match.length < vhIds.length) {
        res.lsIds = match.map((r) => r.id);
        const tt = `(trái: ${fmtPairs(land.pairs)}; phải: ${fmtPairs(landRight)})`;
        res.reasons.push(!recs.length
          ? `Khung phải không có số tờ / số thửa – chỉ Thêm vào dữ liệu vận hành, khung phải để nguyên (trái: ${fmtPairs(land.pairs)})`
          : match.length
          ? `Cập nhật lịch sử ${match.length}/${vhIds.length} bản ghi khung phải trùng tờ / thửa, bản ghi khác để nguyên ${tt}`
          : `Không bản ghi khung phải nào trùng tờ / thửa – chỉ Thêm vào dữ liệu vận hành, khung phải để nguyên ${tt}`);
      }
    }
    return res;
  }

  // Việc cần làm cho một đơn: { kind, label, reqs[] }
  //   kind: approve | reject | fix (sửa đơn có GCN đã lỡ duyệt) | skip | unknown
  function planFor(v, d, opts = {}) {
    const s = M.serverState(v);
    if (d.status === 'unknown') return { kind: 'unknown', label: 'KIỂM TRA TAY – không gửi gì', reqs: [] };
    if (s === 'pending' && d.status === 'approve') {
      const reqs = [M.thiCong(d.goi, 1, 'Thêm vào dữ liệu vận hành')];
      const ids = d.lsIds || d.vhIds;
      if (ids.length) reqs.push(M.vanHanh(d.goi, ids, 3, 1, 'Cập nhật lịch sử'));
      return { kind: 'approve', label: reqs.map((r) => r.label).join(' → '), reqs };
    }
    if (s === 'pending' && d.status === 'reject') {
      return { kind: 'reject', label: 'Không xử lý', reqs: [M.thiCong(d.goi, 0, 'Không xử lý')] };
    }
    if (s === 'approved' && d.status === 'reject') {
      if (!opts.fixApproved) return { kind: 'skip', label: '⚠ ĐÃ LỠ DUYỆT dù có GCN – sửa ở thẻ "Kiểm tra lỡ duyệt GCN"', reqs: [] };
      // Giống thao tác sửa tay: Bỏ duyệt khung phải → Không xử lý khung trái
      const reqs = d.vhIds.length ? [M.vanHanh(d.goi, d.vhIds, -1, 0, 'Bỏ duyệt (khung phải)')] : [];
      reqs.push(M.thiCong(d.goi, 0, 'Không xử lý'));
      return { kind: 'fix', label: 'SỬA: ' + reqs.map((r) => r.label).join(' → '), reqs };
    }
    if (s === 'other' && d.status === 'reject') {
      return { kind: 'skip', label: `⚠ KHÔNG DUYỆT nhưng đang ở ${M.stateLabel(v)} – kiểm tra tay`, reqs: [] };
    }
    return { kind: 'skip', label: `bỏ qua (${M.stateLabel(v)})`, reqs: [] };
  }

  return { decide, planFor, gcnSignals, RULES };
})();
