/* Dựng CSV cho Side Panel: BOM UTF-8 (Excel đọc đúng tiếng Việt), chống CSV injection. */
const ADXCsv = (() => {
  const cell = (v, sep) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s; // tránh Excel hiểu là công thức
    return /["\r\n]/.test(s) || s.includes(sep) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const build = (head, rows, sep = ADX_CONFIG.csvSeparator) => '﻿' + [head, ...rows].map((r) => r.map((v) => cell(v, sep)).join(sep)).join('\r\n');

  // Cột nhật ký: 12 cột của hai bản cũ + Số tờ, Số thửa (khung trái) sau hai cột Chủ
  const LOG_HEAD = ['STT', 'Thời gian quét', 'Vị trí hồ sơ', 'Mã đơn', 'Chủ – khung trái (đơn mới)', 'Chủ – khung phải (dữ liệu cũ)', 'Số tờ', 'Số thửa', 'Kết quả', 'Số phát hành', 'Số vào sổ', 'Hành động đã làm', 'Thời gian hành động', 'Ghi chú'];
  const logRows = (log) => log.map((e, i) => [
    i + 1, e.time, e.stt ? '#' + e.stt : '', e.maDon, e.owners, e.ownersRight, e.soTo, e.soThua, e.result, e.soPhatHanh, e.soVaoSo, e.action, e.actionTime, e.note,
  ]);

  function stamp(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }

  return { cell, build, LOG_HEAD, logRows, stamp };
})();
