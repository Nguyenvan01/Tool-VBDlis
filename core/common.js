/* Hàm dùng chung cho content script và Side Panel. Nhãn kết quả (RESULT) nằm ở log.results của từng công cụ. */
const ADX = {
  norm(s) {
    return String(s ?? '')
      .normalize('NFC')
      .replace(/[   ​﻿]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },
  key(s) {
    return ADX.norm(s).toLowerCase();
  },
  isEmptyValue(v) {
    if (v == null) return true;
    const k = ADX.key(v);
    return ADX_CONFIG.emptyValues.some((x) => ADX.key(x) === k);
  },
  uniq(arr) {
    return [...new Set(arr.filter(Boolean))];
  },
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  duration(ms) {
    const s = Math.round(ms / 1000);
    return s >= 60 ? `${Math.floor(s / 60)} phút ${s % 60} giây` : `${s} giây`;
  },
};
