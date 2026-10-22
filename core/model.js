/*
 * MÔ HÌNH DỮ LIỆU MPLIS dùng chung cho mọi công cụ – thuần, không I/O.
 * Một đơn = một phần tử trong value[] của KiemTraDuLieuChuyenDoi:
 *   ThongTinDangKyThiCong      = khung trái (đơn mới)
 *   ThongTinDangKyVanHanh[]    = khung phải (dữ liệu cũ)
 * Lệnh gửi lấy đúng theo những gì trang gửi khi bấm menu (ghi lại ngày 03/10/2026; Bỏ duyệt ngày 09/10/2026).
 */
const ADXModel = (() => {
  // Họ tên chủ trong ChuSoHuu (cá nhân, vợ chồng, tổ chức…)
  function ownerNames(chu) {
    const out = [];
    const walk = (o, depth) => {
      if (!o || typeof o !== 'object' || depth > 4) return;
      if (Array.isArray(o)) { o.forEach((x) => walk(x, depth + 1)); return; }
      for (const k of ['hoTen', 'tenToChuc']) if (typeof o[k] === 'string' && o[k].trim()) out.push(ADX.norm(o[k]));
      for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, depth + 1);
    };
    walk(chu, 0);
    return ADX.uniq(out);
  }

  // Dữ liệu của một đơn dùng để gửi lệnh và ghi log
  function info(v) {
    const tc = v.ThongTinDangKyThiCong || {};
    const vh = Array.isArray(v.ThongTinDangKyVanHanh) ? v.ThongTinDangKyVanHanh : [];
    return {
      maDon: (tc.TinhHinhDangKy && tc.TinhHinhDangKy.maDon) || '',
      goi: v.goiTinDongBoNId || '',
      owners: ownerNames(tc.ChuSoHuu),
      ownersRight: ADX.uniq(vh.flatMap((h) => ownerNames(h.ChuSoHuu))),
      gcn: vh.flatMap((h) => h.ListGiayChungNhan || []).map((g) => ({ soPhatHanh: g.soPhatHanh || '', soVaoSo: g.soVaoSo || '' })),
      vhIds: Array.isArray(v.tinhHinhDangKyVanHanhIds) ? v.tinhHinhDangKyVanHanhIds : [],
    };
  }

  // Số tờ / số thửa của các thửa trong khung trái (để ghi log). Nhiều thửa thì nối " | " theo cùng thứ tự ở hai cột.
  // Tên trường giống luật duyệt (tools/run/rules.js TO_KEY / THUA_KEY) – đổi bên đó thì đổi cả đây.
  const TO_KEY = /^(soTo|soToBanDo|soHieuToBanDo)$/i;
  const THUA_KEY = /^(soThua|soThuaDat|soThuTuThua)$/i;
  function landOf(v) {
    const to = [];
    const thua = [];
    const walk = (o, depth) => {
      if (!o || typeof o !== 'object' || depth > 8) return;
      if (Array.isArray(o)) { o.forEach((x) => walk(x, depth + 1)); return; }
      const keys = Object.keys(o);
      const kTo = keys.find((k) => TO_KEY.test(k));
      const kThua = keys.find((k) => THUA_KEY.test(k));
      if (kTo || kThua) {
        to.push(ADX.norm(kTo ? o[kTo] : ''));
        thua.push(ADX.norm(kThua ? o[kThua] : ''));
      }
      for (const x of Object.values(o)) if (x && typeof x === 'object') walk(x, depth + 1);
    };
    walk((v.ThongTinDangKyThiCong || {}).TaiSan, 0);
    return { soTo: to.join(' | '), soThua: thua.join(' | ') };
  }

  // Trạng thái trên máy chủ: pending = chưa xử lý; approved = đã "Thêm vào dữ liệu vận hành"; noaction = đã "Không xử lý"
  function serverState(v) {
    const tc = v.ThongTinDangKyThiCong || {};
    if (v.trangThaiGoiTinDongBo === 0) return 'pending';
    if (v.trangThaiGoiTinDongBo === 1 && tc.ActionProcessSyncData === 1) return 'approved';
    if (v.trangThaiGoiTinDongBo === 1 && tc.ActionProcessSyncData === 0) return 'noaction';
    return 'other';
  }
  const STATE_LABEL = { pending: 'chưa xử lý', approved: 'đã thêm vào dữ liệu vận hành', noaction: 'đã Không xử lý', other: 'trạng thái khác' };
  // Giá trị gốc của trạng thái – để nhận ra các trạng thái chưa biết (VD đã đồng bộ)
  const vhActions = (v) => (Array.isArray(v.ThongTinDangKyVanHanh) ? v.ThongTinDangKyVanHanh : []).map((h) => h.ActionProcessSyncData);
  const rawState = (v) => `trangThai=${v.trangThaiGoiTinDongBo}, thiCong=${(v.ThongTinDangKyThiCong || {}).ActionProcessSyncData}, vanHanh=${vhActions(v).join('/') || '-'}`;
  // Các bản ghi khung phải đã "Cập nhật lịch sử" (ActionProcessSyncData = 3)
  const historyIds = (v) => (Array.isArray(v.ThongTinDangKyVanHanh) ? v.ThongTinDangKyVanHanh : [])
    .filter((h) => h.ActionProcessSyncData === 3)
    .map((h) => (h.TinhHinhDangKy || {}).tinhHinhDangKyId);
  function stateLabel(v) {
    const s = serverState(v);
    return s === 'other' ? `trạng thái khác (${rawState(v)})` : STATE_LABEL[s];
  }

  // ---------------------------------------------------------------- các lệnh gửi (giống hệt trang)
  // Mọi lệnh đặt đơn về MỘT trạng thái cố định (gửi lại không sai) và luôn mang expect để kiểm phản hồi.
  const A = ADX_CONFIG.api;
  // Khung trái: Thêm vào dữ liệu vận hành (1, trangThai 1) / Không xử lý (0, trangThai 1) / Bỏ duyệt (-1, trangThai 0)
  const thiCong = (goi, action, label, trangThai = 1) => ({
    name: A.thiCong, label,
    body: { goiTinDongBoNId: goi, actionProcessSyncDataThiCong: action, trangThai, processSyncDatas: [] },
    expect: { trangThai, thiCong: action },
  });
  // Khung phải: MỘT lệnh cho tất cả bản ghi (processSyncDatas là danh sách) – gửi riêng từng lệnh có thể ghi đè nhau
  const vanHanh = (goi, ids, action, trangThai, label) => ({
    name: A.vanHanh, label: ids.length > 1 ? `${label} (${ids.length} bản ghi)` : label,
    body: { goiTinDongBoNId: goi, processSyncDatas: ids.map((id) => ({ actionProcessSyncData: action, tinhHinhDangKyId: id })), trangThai },
    expect: { trangThai, vanHanh: { ids, action } },
  });

  // Phản hồi của máy chủ có đúng như mong đợi không ('' = đúng)
  function checkResponse(resp, exp) {
    const val = (resp && resp.value) || {};
    if (exp.trangThai != null && val.trangThai !== exp.trangThai) return `trạng thái trả về ${val.trangThai}, cần ${exp.trangThai}`;
    if (exp.thiCong != null && val.actionProcessSyncDataThiCong !== exp.thiCong) {
      return `actionProcessSyncDataThiCong trả về ${val.actionProcessSyncDataThiCong}, cần ${exp.thiCong}`;
    }
    if (exp.vanHanh) {
      let list = [];
      try { list = JSON.parse(val.actionProcessSyncDataVanHanh || '{}').ListProcessSyncData || []; } catch (e) { /* bỏ qua */ }
      const ok = exp.vanHanh.ids.every((id) => list.some((x) => x.tinhHinhDangKyId === id && x.actionProcessSyncData === exp.vanHanh.action));
      if (!ok) return `khung phải chưa ghi nhận (actionProcessSyncDataVanHanh = ${val.actionProcessSyncDataVanHanh || 'trống'})`;
    }
    return '';
  }

  // Trang danh sách
  const totalOf = (page) => Number(page && page.recordsTotal) || 0;
  const itemsOf = (page) => (page && Array.isArray(page.value) ? page.value : []);

  return {
    ownerNames, info, landOf, serverState, STATE_LABEL, vhActions, rawState, historyIds, stateLabel,
    thiCong, vanHanh, checkResponse, totalOf, itemsOf,
  };
})();
