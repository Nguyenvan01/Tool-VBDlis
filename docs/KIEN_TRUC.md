# Kiến trúc – Bộ công cụ hỗ trợ VBDLIS (MPLIS) 3.0.0

Tài liệu cho người sửa code. Cách cài và dùng xem [../HUONG_DAN.md](../HUONG_DAN.md), kế hoạch chuyển xem [KE_HOACH.md](KE_HOACH.md), công nghệ xem [CONG_NGHE.md](CONG_NGHE.md).

**Trạng thái:** đã dựng lõi, năm công cụ `run` (Chạy tự động), `audit` (Quét và sửa lỡ duyệt GCN), `undo` (Gỡ duyệt), `noaction` (Không xử lý hết), `dvhc` (Duyệt ĐVHC 2 cấp), và Side Panel dạng thanh tab. Còn lại bước 2.5 (KE_HOACH.md).

Nguồn gộp: hai dự án cũ, nay đã vào Thùng rác macOS. Trong lúc chuyển, mã của chúng được chép vào `legacy/` để chuyển code và so sánh; kết quả của code cũ trên mọi fixture đã được **chốt** vào `test/golden/*.json`, rồi `legacy/` **đã xoá** (bước 2.5). Test vẫn so với bản cũ qua các file đã chốt (mục 9).

| Bản cũ | Bản chép trong lúc chuyển (đã xoá) | `version` | Công cụ cũ → id mới |
|---|---|---|---|
| Duyệt (`Auto duyệt 2.1.3/`) | `legacy/duyet-2.1.3/` | 2.1.3 | Chạy tự động → `run`, Quét và sửa lỡ duyệt GCN → `audit` |
| Gỡ duyệt (`Auto đơn 2.1.4 (bỏ duyệt)/`) | `legacy/go-duyet-2.2.4/` | **2.2.4** (tên thư mục ghi 2.1.4) | Gỡ duyệt → `undo` |

## 1. Nguyên tắc

- **Một** extension Manifest V3, **một** Side Panel, **một** lõi. Mỗi chức năng là một module trong `tools/<id>/`.
- Chỉ chạy trên `https://*.mplis.gov.vn/*`. Gọi thẳng `/dc/TichHopDongBoDuLieuAjax/*` bằng cookie và `__RequestVerificationToken` của phiên đang đăng nhập. Không bấm giao diện, không đọc DOM.
- **Chuyển code, không viết lại.** Hàm trùng nhau giữa hai bản cũ thì chuyển nguyên văn vào lõi. Hàm khác nhau thì chuyển vào công cụ. Test so kết quả với bản cũ (mục 9).
- Lõi không nhắc tên công cụ nào. Công cụ chỉ dùng lõi qua đối tượng `api` hẹp. Công cụ không thấy token, `listBody`, `fetch`, `chrome.storage`.
- JS thuần, không build, không dependency ([CONG_NGHE.md](CONG_NGHE.md)).

## 2. Sơ đồ thành phần

```
┌──────────────────────────── Tab MPLIS (mỗi khung / iframe một bản) ─────────────────────────────┐
│  MAIN world (chung với trang)     Isolated world (riêng của extension)                          │
│  ┌───────────────┐  postMessage  ┌──────────────────┐                                           │
│  │ core/hook.js  │──────────────▶│ core/context.js  │  token + listBody: CHỈ trong RAM          │
│  │ nhìn XHR/fetch│ 'vbdlis3:ctx' └────────┬─────────┘                                           │
│  └───────────────┘                        │ chỉ runner được đọc                                 │
│                          ┌────────────────▼──────────────────────────────┐   fetch POST          │
│                          │ core/runner.js                     (LÕI)      │──────────▶ API MPLIS  │
│                          │ post + thử lại · getList · readPages · pool   │◀──────────            │
│                          │ execute (expect/checkResponse) · Dừng · Esc   │                       │
│                          │ 1 công cụ / khung · nhận lệnh · báo tiến độ   │                       │
│                          └───▲───────────────────┬──────────────┬────────┘                       │
│                    api (hẹp) │      writeLog/save│              │ dùng                           │
│  ┌───────────────────────────┴────┐  ┌───────────▼──────┐  ┌────▼─────────────────┐              │
│  │ tools/<id>/tool.js  chiến lược │  │ core/log.js      │  │ core/model.js (thuần)│              │
│  │ tools/<id>/rules.js luật thuần │  │ nơi DUY NHẤT đọc/│  │ info, serverState,   │              │
│  │ ADXTools.register / ADXRules   │  │ ghi chrome.storage│ │ thiCong, vanHanh,    │              │
│  └────────────────────────────────┘  └────────┬─────────┘  │ checkResponse        │              │
│                                               │            └──────────────────────┘              │
└──────────────────────────▲────────────────────┼─────────────────────────────────────────────────┘
       apiStatus / apiStart│{tool} / apiStop    │ chrome.storage.local
                           │   ▲ adx:apiState   ▼ (<id>:log:*, <id>:stats, <id>:<khoá>)
┌──────────────────────────┴───┴─────────────────────────────┐   ┌───────────────────────────────┐
│ panel/ (Side Panel)                                        │   │ background.js (service worker) │
│ nạp tools/* theo manifest · thẻ chọn công cụ · chạy/dừng · │   │ bấm icon → mở Side Panel       │
│ tiến độ · thống kê · xuất CSV · khoá khi lệch phiên bản    │   │ Alt+Shift+S → apiStop mọi khung│
└────────────────────────────────────────────────────────────┘   └───────────────────────────────┘
```

## 3. Cây thư mục

```
Bộ công cụ hỗ trợ VBDLIS/   ← chọn thư mục này khi Load unpacked
  manifest.json          khai báo; khối content_scripts thứ 3 là SỔ ĐĂNG KÝ CÔNG CỤ (mục 5.3)
  config.js              ADX_VERSION + cấu hình chung (API, tốc độ, thử lại, emptyValues, csvSeparator)
  background.js          mở Side Panel, phím tắt dừng khẩn cấp
  HUONG_DAN.md           hướng dẫn sử dụng
  core/
    hook.js              (MAIN world) = api-hook.js, cờ và kiểu thông điệp đổi tên riêng bản 3
    context.js           = api-context.js
    common.js            ADX: norm, key, isEmptyValue, uniq, sleep, duration
    model.js             ADXModel: mô hình dữ liệu MPLIS dùng chung, thuần
    registry.js          ADXTools (sổ đăng ký, kiểm hợp đồng), ADXRules
    log.js               ADXLog: nhật ký theo namespace + dữ liệu riêng của công cụ
    runner.js            bộ máy chạy (mục 4, 5.4)
    csv.js               ADXCsv: BOM UTF-8, chống CSV injection, 12 cột log
  tools/
    run/rules.js         decide, planFor, gcnSignals, RULES (chép nguyên văn luật bản Duyệt 2.1.3)
    run/tool.js          Chạy tự động: runAll / runPending / sweepLeftovers; handle (audit dùng lại)
    audit/tool.js        Quét và sửa lỡ duyệt GCN (dùng luật của run) + bảng lỡ duyệt trên Side Panel
    undo/rules.js        undoFor
    undo/tool.js         Gỡ duyệt: đọc hết rồi mới gửi
    noaction/rules.js    noactionFor (bảng luật mục 5.7)
    noaction/tool.js     Không xử lý hết: đọc hết cả đợt rồi mới gửi
    dvhc/rules.js        dvhcFor, soPhatHanh (bảng luật mục 5.8)
    dvhc/tool.js         Duyệt ĐVHC 2 cấp: đọc hết cả đợt rồi mới gửi
  panel/                 panel.html, panel.css; view.js (thuần: nhóm tab, trạng thái thẻ, phím); panel.js (DOM). Không có mục cài đặt
  icons/
  test/                  *.test.mjs, lib/, fixtures/, golden/ (kết quả bản cũ đã chốt) – mục 9
  docs/
```

## 4. Ranh giới lõi và công cụ

| Việc | Lõi | Công cụ |
|---|---|---|
| Lấy token, đợt bàn giao | `core/hook.js`, `core/context.js` | – |
| Dựng body đọc danh sách (`listBody` chụp lúc bắt đầu + `start`, `length`, `requestQueries.trangThai`) | `runner.getList` | chỉ truyền `trangThai` |
| Gửi HTTP, thử lại, timeout, nhận ra hết phiên | `runner.post` / `postOnce` | – |
| Đọc trước, trang trả thiếu, đóng generator | `runner.readPages` / `readItems` | chọn `size`, `ahead` |
| Gửi lệnh cho một đơn, kiểm `expect`, ghi log lỗi, dừng | `runner.execute` | dựng `plan.reqs` bằng `ADXModel.thiCong` / `vanHanh` |
| Gửi song song, dừng khi lỗi đầu tiên | `runner.pool` | chọn `limit` |
| Dừng (nút, Esc, Alt+Shift+S) | `runner` + `background.js` | đọc `api.state.stopping` |
| Đơn nào làm gì | – | `rules.js` (thuần) |
| Thứ tự đọc / ghi, đếm | – | `tool.js` → `run(api)` |
| Nhật ký, thống kê, dữ liệu riêng | `core/log.js` | khai báo `log`, ghi qua `api` |
| Giao diện | `panel/` (khung chung) | mô tả: nhãn, câu xác nhận, `progress`, `counters`, `note`, `report` |

Chiều phụ thuộc: `tools/*` → `core/*`. `test/core.test.mjs` quét mã nguồn (đã bỏ chú thích) để giữ luật này.

## 5. Hợp đồng của một module công cụ

### 5.1. `tools/<id>/rules.js`: luật thuần

```js
ADXRules.undo = (() => { …; return { undoFor }; })();   // chỉ gán ADXRules.<id>
```

- Không I/O: không `chrome`, `fetch`, `document`, `window`, `setTimeout`, `Date`. Chỉ dùng `ADX`, `ADXModel`.
- Lệnh chỉ dựng bằng `ADXModel.thiCong` / `ADXModel.vanHanh`, **không viết body mới**. Hai hàm này luôn gắn `expect`.

### 5.2. `tools/<id>/tool.js`: đăng ký

```js
ADXTools.register({
  id: 'undo',                 // /^[a-z]+$/: chữ thường, một từ. Là tiền tố khoá lưu trữ và giá trị `tool` trong tin nhắn
  name: 'Gỡ duyệt',           // tiêu đề thẻ công cụ (và "Đang chạy: <name>")
  tab: 'Gỡ duyệt',            // (tuỳ chọn) nhãn tab; công cụ cùng nhãn chung một tab (run + audit = "Duyệt đơn"). Không có thì dùng name
  readBeforeWrite: true,      // lõi CHẶN lệnh ghi khi chưa sang step 'write', chặn đọc khi đã sang (bất biến 5)
  config: {},                 // (tuỳ chọn) tham số riêng, cố định; công cụ đọc qua api.toolConfig

  // Nhật ký: object = công cụ này có nhật ký riêng "<id>:log:*";
  //          chuỗi = ghi chung nhật ký của công cụ đã đăng ký trước (VD audit: log: 'run', như bản cũ)
  log: {
    title: 'Thống kê bỏ duyệt',   // tiêu đề thẻ thống kê
    file: 'bo-duyet',             // tên file CSV: bo-duyet_YYYYMMDD-HHmm.csv
    results: {                    // chữ lưu ở cột Kết quả → ô thống kê. BẮT BUỘC có "unknown" (KIỂM TRA TAY)
      undo:    { text: 'ĐÃ GỠ DUYỆT',  label: 'Đã gỡ duyệt',  cls: 'ok' },
      unknown: { text: 'KIỂM TRA TAY', label: 'Kiểm tra tay', cls: 'warn' },
    },
  },

  counts: () => ({ undo: 0, skip: 0, unknown: 0 }),  // bộ đếm của một lần chạy
  async run(api) { … return 'câu kết quả'; },        // chiến lược đọc / ghi (mục 5.4)
  summary(state) { return 'câu kết quả khi bị Dừng'; },

  panel: {
    start: 'Gỡ duyệt', style: 'warn',      // nút chạy: 'go' (xanh) | 'warn' (vàng)
    icon: 'i-refresh',                     // (tuỳ chọn) icon nút chạy, mặc định 'i-play' (symbol trong panel.html)
    confirm: 'GỠ DUYỆT TẤT CẢ …?',         // câu hỏi xác nhận trước khi chạy
    progress: (s) => ({ text, pct }),      // thuần, từ stateObj
    counters: (s) => [{ label, value, cls }],  // [] = không có ô số
    note: (s) => '',                       // (tuỳ chọn)
    manual: (s) => 0,                      // (tuỳ chọn) số đơn cần kiểm tra tay → nhãn "Cần kiểm tra"; mặc định counts.unknown (audit: audit.manual)
    // (tuỳ chọn) báo cáo riêng lưu ở "<id>:<key>" (audit: bảng lỡ duyệt). ui do Side Panel đưa vào:
    // { running, h(tag, cls, text), button(cls, icon, label), boxes(el, items), csv: ADXCsv, download(name, blob) }
    report: { key, render(el, data, ui) },
  },
});
```

`register` **ném lỗi ngay lúc nạp** nếu: `id` sai dạng hoặc trùng; thiếu `name`, `counts`, `run`, `summary`, `panel`, `panel.start`, `panel.confirm`, `panel.progress`, `panel.counters`; `log` là object mà thiếu `title`, `file`, `results.unknown`; `log` là chuỗi mà chưa có công cụ sở hữu nhật ký đó.

### 5.3. Đăng ký: một dòng trong `manifest.json`

```json
"js": [
  "config.js", "core/common.js", "core/model.js", "core/registry.js", "core/log.js",
  "tools/run/rules.js", "tools/run/tool.js",
  "tools/audit/tool.js",
  "tools/undo/rules.js", "tools/undo/tool.js",
  "tools/noaction/rules.js", "tools/noaction/tool.js",
  "tools/dvhc/rules.js", "tools/dvhc/tool.js",
  "core/runner.js"
]
```

Công cụ không có luật riêng (VD `audit` dùng luật của `run`) thì dòng đăng ký chỉ có `tool.js`.

- **Thêm công cụ** = tạo `tools/<id>/` và thêm **một dòng** `"tools/<id>/rules.js", "tools/<id>/tool.js",` vào trước `core/runner.js`. Không sửa `core/`, không sửa `panel/`.
- Side Panel đọc cùng danh sách (`chrome.runtime.getManifest().content_scripts` → các file `tools/…`) và nạp lần lượt. Thẻ trên Side Panel theo đúng thứ tự trong manifest.
- Công cụ dùng luật / nhật ký của công cụ khác thì đặt sau công cụ đó.
- File `tools/*` chạy ở cả trang lẫn Side Panel, nên lúc nạp chỉ được gán `ADXRules` / gọi `register`.

### 5.4. `api`: những gì lõi đưa cho `run(api)`

| Thành phần | Ý nghĩa |
|---|---|
| `api.state` | Trạng thái lần chạy, gửi cho Side Panel. Lõi đặt sẵn `tool, running, stopping, t0, msg, step, scope, phase, pos, total, counts = counts()`. Công cụ tự thêm trường riêng (VD undo: `before, wDone, wTotal, dup`) |
| `api.config` | `ADX_CONFIG.api` (chỉ đọc) |
| `api.limits` | `{ read, write }`: số lần đọc / số đơn gửi song song mà công cụ được dùng. Công cụ `readBeforeWrite` (hai bước không chồng nhau): `phasedReadAhead` / `phasedWriteConcurrency` (3 / 6). Công cụ khác: `readAhead` / `writeConcurrency` (3 + 3) |
| `api.toolConfig` | `config` của công cụ |
| `api.dot` | Mã đợt bàn giao đang chạy (không phải `listBody`) |
| `api.getList(trangThai, start, length)` | Đọc một trang. `canStop = true`. Bộ lọc: `'-1'` tất cả, `'0'` chưa xử lý, `'1'` / `'2'` **đoán** là đã xử lý / đã đồng bộ |
| `api.readPages(trangThai, size, ahead, firstPage?)`, `api.readItems(…)` | Đọc trước, trả đúng thứ tự (nguyên văn bản cũ) |
| `api.pool(items, limit, fn)` | Lỗi đầu tiên hoặc Dừng → không nhận việc mới, chờ việc dở, rồi ném lỗi |
| `api.execute({ d, plan, stt, result, note, decision })` | Gửi lần lượt `plan.reqs`, `canStop = false`. Mục 5.5 |
| `api.writeLog(d, stt, fields)` | Ghi log đơn không gửi lệnh (VD KIỂM TRA TAY) |
| `api.save(key, value)` | Lưu dữ liệu riêng vào `<id>:<key>` |
| `api.broadcast(force?)`, `api.log(msg)`, `api.now()` | Báo tiến độ, in Console `[Duyệt đơn]`, giờ hiện tại |

`d` là kết quả `ADXModel.info(v)`: `{maDon, goi, owners, ownersRight, gcn, vhIds}`.

Hàm thuần dùng chung (`ADXModel`): `ownerNames`, `info`, `serverState`, `STATE_LABEL`, `stateLabel`, `rawState`, `vhActions`, `historyIds`, `thiCong(goi, action, label, trangThai = 1)`, `vanHanh(goi, ids, action, trangThai, label)`, `checkResponse`, `totalOf`, `itemsOf`. `ADX.duration(ms)` cho câu kết quả.

### 5.5. `execute`: gửi lệnh cho một đơn

1. Từ chối **trước khi gửi** nếu công cụ có `readBeforeWrite` mà `state.step !== 'write'`, hoặc có lệnh thiếu `expect`.
2. Gửi lần lượt từng lệnh. Lỗi tạm thời thì thử lại. Phản hồi được kiểm bằng `checkResponse(resp, expect)`.
3. Đúng hết thì ghi log `{ result, note, action: plan.label, actionTime }`.
4. Một lệnh sai thì **không gửi lệnh sau**, ghi log rồi ném lỗi, làm dừng cả lần chạy. Không rollback. Mục log ghi:
   - `result` = `KIỂM TRA TAY` (chữ `results.unknown.text`), ở **mọi** công cụ (quyết định H1). Thống kê đếm đơn này vào nhóm Kiểm tra tay;
   - `note` = `Quyết định ban đầu: <decision> · đã làm: …; HỎNG: …; chưa làm: …`. `decision` mặc định là `result` + `(note)`. Ví dụ Gỡ duyệt truyền `decision = plan.label`;
   - `action` = `LỖI – <đã làm / HỎNG / chưa làm> (<lý do>)`, như bản cũ.

### 5.6. Công cụ đã có và sẽ có

Thứ tự thẻ trên Side Panel = thứ tự trong manifest.

| | `undo` | `noaction` | `run` | `audit` |
|---|---|---|---|---|
| Tab / tên thẻ | Gỡ duyệt / Gỡ duyệt | Không xử lý hết / Không xử lý hết | **Duyệt đơn** / Chạy tự động | **Duyệt đơn** / Quét và sửa lỡ duyệt GCN |
| Luật | `ADXRules.undo.undoFor` | `ADXRules.noaction.noactionFor` (mục 5.7) | `ADXRules.run.decide`, `planFor` | `decide`, `planFor({fixApproved})` của `run` + điều kiện "lỡ duyệt" |
| Đơn kết thúc ở | `pending` (chưa xử lý) | `noaction` (đã Không xử lý) | `approved` / `noaction` | `noaction` (đơn lỡ duyệt) |
| `readBeforeWrite` | **true** | **true** | false (vừa đọc vừa gửi trong `runAll`, như cũ) | false (đọc trước trong lúc sửa tuần tự, như cũ) |
| Chiến lược | `readDone` (lọc `'1'`, chỉ tin khi đếm khớp) → không khớp: `readPlan('-1')` → `pool(todo)` | đọc hết `'-1'` → `pool(todo)`. Trùng mã gói tin: đếm `dup`, cảnh báo | lọc `'0'` → `runAll` / `runPending` / `sweepLeftovers` | `readPages` → sửa tuần tự |
| `log` | riêng: `undo:*`, file `bo-duyet` | riêng: `noaction:*`, file `khong-xu-ly-het` | riêng: `run:*`, file `duyet-don` | `'run'` (ghi chung với `run`, như bản cũ) |
| `log.results` | `undo` ĐÃ GỠ DUYỆT, `unknown` | `change` ĐÃ KHÔNG XỬ LÝ, `unknown` | `approve`, `reject`, `unknown` | (của `run`) |
| Dữ liệu riêng | – | – | – | `audit:last` (= `adxAudit` cũ), `panel.report` |
| `config` riêng | – | – | `fullScanRatio` 0,5, `maxPasses` 3 (trong `tool.js`); cờ luật `RULES.rejectIfLeftEmpty`, `RULES.keepUndone` (trong `rules.js`, cạnh `decide`) | `auditPageSize`, `uiPageSize` |
| Dùng chung | – | – | đăng ký kèm `handle(api, v, stt, onlyFix)`: quyết định + gửi lệnh cho một đơn | gọi `ADXTools.get('run').handle(…, true)` |

### 5.7. Luật "Không xử lý hết" (`noactionFor`)

Xét theo thứ tự, khớp dòng nào thì dừng ở dòng đó. Lệnh chỉ dựng bằng `ADXModel` (không có body mới).

| # | Điều kiện | Kết quả | Lệnh, theo thứ tự |
|---|---|---|---|
| 1 | Thiếu `goiTinDongBoNId` | unknown | – |
| 2 | Mã bản ghi khung phải ≠ `tinhHinhDangKyVanHanhIds` (không kể thứ tự) | unknown | – |
| 3 | `serverState = other` | unknown | – |
| 4 | Khung phải có bản ghi action `3` | change | `vanHanh(goi, vhIds, -1, 0)` (một lệnh cho mọi bản ghi) → `thiCong(goi, 0)` |
| 5 | `pending` (kể cả khung trái `-1`) | change | `thiCong(goi, 0)` |
| 6 | `approved`, khung phải không có action `3` | change | `thiCong(goi, 0)` |
| 7 | `noaction` | skip | – |

- Dòng 6 đã kiểm với `planFor({fixApproved})` của bản Duyệt 2.1.3: khung phải trống thì bản cũ cũng đi thẳng `approved` → Không xử lý (test chạy hàm cũ). **Khác bản cũ có chủ đích:** khung phải có bản ghi nhưng không có action 3 thì bản cũ Bỏ duyệt khung phải trước, còn công cụ này chỉ gửi Không xử lý (đúng bảng luật).
- Dòng 4 hỏng ở lệnh thứ hai: khung phải đã `-1`, đơn về `pending`. Lần chạy sau đơn rơi vào dòng 5, chỉ gửi Không xử lý.
- Chạy lại sau khi xong: mọi đơn là skip hoặc unknown, không gửi gì (lệnh idempotent).

### 5.8. Luật "Duyệt ĐVHC 2 cấp" (`dvhcFor`)

Công cụ `dvhc`: tab / tên thẻ *ĐVHC 2 cấp* / *Duyệt ĐVHC 2 cấp*; `readBeforeWrite: true`, chiến lược như `noaction` (đọc hết `'-1'` → `pool(todo)`, trùng mã gói tin đếm `dup`); log riêng `dvhc:*`, file `duyet-dvhc`; `log.results`: `approve` ĐƯỢC DUYỆT, `reject` KHÔNG DUYỆT, `unknown` KIỂM TRA TAY. Xét theo thứ tự, lệnh chỉ dựng bằng `ADXModel`.

| # | Điều kiện | Kết quả | Lệnh, theo thứ tự |
|---|---|---|---|
| 1 | Thiếu `goiTinDongBoNId` hoặc mã đơn | unknown | – |
| 2 | Mã bản ghi khung phải ≠ `tinhHinhDangKyVanHanhIds` | unknown | – |
| 3 | `serverState ≠ pending` | skip | – |
| 4 | Khung trái `-1` (đã bị Bỏ duyệt) | unknown | – |
| 5 | Tập số phát hành hai khung bằng nhau (khác rỗng) **và** tập tên chủ bằng nhau | approve | `thiCong(goi, 1)` → `vanHanh(goi, vhIds, 3, 1)` (nếu khung phải có bản ghi) |
| 6 | Còn lại | reject | `thiCong(goi, 0)` |

- Số phát hành: mọi khoá `soPhatHanh` (không phân biệt hoa / thường của tên khoá) ở bất kỳ độ sâu nào của khung (≤ 14), bỏ giá trị rỗng (`emptyValues`), bỏ khoảng trắng, viết hoa. Khung phải thực tế nằm ở `ListGiayChungNhan[].soPhatHanh`; **khung trái chưa ghi lại được tên trường thật** nên dò cả cây.
- Tên chủ: `ADXModel.info` → `owners` / `ownersRight` (đã `ADX.norm`: gộp khoảng trắng, NFC, **giữ hoa / thường**), so như tập.
- Hỏng ở lệnh thứ hai: khung trái đã `1`, đơn `approved` → lần sau bị skip. Kiểm tra tay đơn đó (log ghi KIỂM TRA TAY, đã làm / HỎNG).
- Đơn không có mã đơn vẫn được xử lý và đếm, nhưng không ghi được nhật ký (nhật ký lấy mã đơn làm khoá, như bản cũ).

## 6. Giao thức thông điệp

| Hướng | Kênh | Nội dung |
|---|---|---|
| hook → context | `window.postMessage` (cùng origin, `ev.source === window`) | `{type:'vbdlis3:ctx', token, listUrl, listBody}`. Bản cũ dùng `'adx:ctx'` và cờ `__adxHookLoaded`; bản 3 dùng `'vbdlis3:ctx'` và cờ `window.__vbdlis3HookLoaded`, để không lẫn với extension cũ còn bật trên cùng trang (H2a) |
| Side Panel → mọi khung | `chrome.tabs.sendMessage` theo `frameId` | `{cmd:'apiStatus'}` → `stateObj()` |
| Side Panel → một khung | như trên | `{cmd:'apiStart', tool:'<id>'}` → `{...stateObj(), error}`. `error` rỗng nghĩa là đã bắt đầu |
| Side Panel / background → mọi khung | như trên | `{cmd:'apiStop'}`: dừng **việc đang chạy**, không cần `tool` |
| content → runtime | `chrome.runtime.sendMessage`, tối đa 1 lần / 300 ms (trừ `force`) | `{type:'adx:apiState', state}`. `state.tool` = công cụ đang / vừa chạy |
| storage → Side Panel | `storage.onChanged` | `<id>:stats`, `<id>:<khoá báo cáo>` |

`stateObj()` = `{ frame, version, hasCtx, dot, seenAt, tool, running, stopping, t0, msg, step, scope, phase, pos, total, counts, …trường riêng của công cụ }` (bản sao JSON).

`apiStart` bị từ chối (trả `error`, không gửi gì) khi: đang chạy, bất kể công cụ nào (`'Đang chạy rồi'`); `tool` không có trong sổ; `readAhead + writeConcurrency > 6` hoặc `phasedReadAhead` / `phasedWriteConcurrency` > 6; chưa có danh sách đơn hoặc token.

## 7. Lưu trữ (`chrome.storage.local`)

Quy ước: **tiền tố khoá = id công cụ**. `<id>:log:<mã đơn>` và `<id>:stats` cho nhật ký; `<id>:<khoá>` cho dữ liệu riêng.

| Khoá | Khoá cũ (không chuyển, phương án A) | Ai ghi | Ai đọc |
|---|---|---|---|
| `undo:log:<mã đơn>` | `adxUndo:<mã đơn>` | `undo` | Side Panel khi xuất CSV |
| `undo:stats` | `adxUndoStats` | `core/log.js` | Side Panel (`onChanged`) |
| `noaction:log:<mã đơn>` | – (công cụ mới) | `noaction` | Side Panel khi xuất CSV |
| `noaction:stats` | – | `core/log.js` | Side Panel |
| `dvhc:log:<mã đơn>`, `dvhc:stats`, `dvhc:job` | – (công cụ mới) | `dvhc`, `core/log.js`, `core/runner.js` | Side Panel |
| `run:log:<mã đơn>` | `adxLog:<mã đơn>` | `run`, `audit` | Side Panel khi xuất CSV |
| `run:stats` | `adxLogStats` | `core/log.js` | Side Panel |
| `<id>:job` | – (mới) | `core/runner.js` khi lần chạy kết thúc (ghi đè lần trước của cùng công cụ) | Side Panel: nút "Tải log lần chạy" |
| `audit:last` | `adxAudit` | `audit` qua `api.save` (sau mỗi trang có thay đổi và một lần cuối) | Side Panel (bảng lỡ duyệt, `onChanged`) |

- **Token và `listBody` không bao giờ được lưu.** Chỉ `core/context.js` giữ, chỉ `core/runner.js` đọc. `api` không có hai thứ này.
- **Điểm ghi nhật ký duy nhất:** `ADXLog.write(ns, batch)` trong `core/log.js`. Sau này gắn thêm nơi gửi (VD Postgres) ở đây, không sửa công cụ (H9).
- Một mục nhật ký: `{ key, maDon, seq, time, stt, owners, ownersRight, soTo, soThua, soPhatHanh, soVaoSo, result, note, action, actionTime }`. `soTo` / `soThua` (mới, `ADXModel.landOf`): số tờ / số thửa các thửa của khung trái, nhiều thửa nối " | " cùng thứ tự.
- **Log từng lần chạy** `<id>:job` = `{ tool, name, dot, start, end, endedAt, msg, entries[] }`: các mục nhật ký của riêng lần chạy đó (cùng dạng như trên), giữ trong RAM lúc chạy, lưu một lần khi xong.
- `<id>:stats` = `{ total, <mỗi khoá của log.results>, next }`.
- Ghi theo lô như cũ: gom theo mã đơn, 1,5 giây mới ghi, nối chuỗi Promise, cuối lần chạy luôn ghi nốt.
- CSV nhật ký (tổng và từng lần chạy): 12 cột của hai bản cũ + **Số tờ, Số thửa** sau hai cột Chủ (`ADXCsv.LOG_HEAD`, 14 cột). Có BOM UTF-8. Ô bắt đầu bằng `= + - @` được thêm `'` phía trước.

## 8. Side Panel

**Thanh tab** (`<nav role="tablist">` trong phần đầu trang, dính trên cùng khi cuộn):

- Tab dựng từ sổ đăng ký, theo thứ tự trong manifest: công cụ cùng `tab` thì chung một tab. Hiện có bốn tab: **Duyệt đơn** (`run` + `audit`), **Gỡ duyệt**, **Không xử lý hết**, **ĐVHC 2 cấp**. Nhãn dài xuống tối đa 2 dòng. Thêm công cụ thì tab tự xuất hiện, không sửa HTML.
- Các tab chia đều chiều ngang. Tab đang chọn có gạch chân và chữ đậm màu chính (`aria-selected="true"`). Cỡ chữ co theo bề rộng (`clamp(11.5px, 3.75vw, 13px)`), để ở 320px ba nhãn vẫn nằm trên một hàng; nếu vẫn hẹp quá thì nhãn bị cắt "…", không xuống dòng, không cuộn ngang.
- `role="tab"` / `role="tabpanel"` / `aria-controls` / `aria-labelledby`. Phím ← → (vòng), Home, End chuyển tab và đưa focus theo. Chỉ tab đang chọn nhận Tab (`tabIndex` 0, các tab khác -1).
- Mở Side Panel: chọn tab của công cụ đang chạy nếu có, nếu không thì chọn tab đầu tiên (Duyệt đơn).

**Mỗi tab một vùng nội dung** (`tabpanel`): thẻ của từng công cụ (tiêu đề, nút chạy, nút Dừng, dòng trạng thái, tiến độ, ô số, báo cáo riêng), sau đó là thẻ thống kê của từng nhật ký trong tab (xuất CSV, xoá log). `run` và `audit` ghi chung nhật ký nên tab Duyệt đơn chỉ có một thẻ "Thống kê duyệt". Tiến độ chỉ hiện ở thẻ của công cụ vừa / đang chạy.

**Khi một công cụ đang chạy** (quyết định H7, sửa ở bước 2.4): vẫn **cho chuyển tab** để xem. Nút chạy của **mọi** công cụ bị khoá; thẻ của công cụ khác hiện dòng "Đang chạy: <tên>". Tab của công cụ đang chạy có chấm xanh, kèm chữ "(đang chạy)" cho trình đọc màn hình. **Nút Dừng ở thẻ nào cũng bấm được** và dừng công cụ đang chạy. Bất biến 11 vẫn giữ: Side Panel khoá nút, và lõi từ chối `apiStart` thứ hai.

Nút chạy còn bị khoá khi chưa có danh sách đơn, hoặc khi lệch phiên bản. Thông báo trạng thái giữ nguyên như bản cũ: "Extension chưa chạy trên tab này – tải lại trang (F5).", cảnh báo code cũ, "Chưa thấy danh sách đơn…", câu kết quả, lỗi.

**Nhãn trạng thái** ở đầu thẻ công cụ (view.js `cardView` → `badge`), chỉ hiện khi dữ liệu có thật, cùng thứ tự ưu tiên với dòng trạng thái:

| Nhãn | Khi |
|---|---|
| Đang chạy | công cụ này đang chạy |
| Hoàn thành | lần chạy gần nhất của công cụ này "Xong", không có đơn cần kiểm tra tay |
| Cần kiểm tra | "Xong" nhưng `panel.manual(s)` > 0 |
| Lỗi | lần chạy gần nhất "Lỗi: …", hoặc bấm chạy bị từ chối (trừ lý do "Chưa…") |
| Chưa sẵn sàng | trang chưa có extension, chưa có danh sách đơn, lệch phiên bản, hoặc bấm chạy bị từ chối vì "Chưa…" |
| (không có) | sẵn sàng; hoặc công cụ khác đang chạy (thẻ đã có dòng "Đang chạy: …") |

**Lỗi lệnh ghi**: câu lỗi chuẩn của lõi ("Lỗi: Đơn X: đã làm…; HỎNG…; chưa làm… – lý do. Đã dừng, kiểm tra tay đơn này.") được `view.js splitError` tách thành mã đơn · các bước · lý do · việc cần làm, hiện thành khối riêng (không bỏ chữ nào; câu khác mẫu hiện nguyên văn).

**Giao diện** ("Technical Control Center"): toàn bộ ở `panel/panel.css`, biến thiết kế ở `:root` (màu cyan cho tương tác, xanh / vàng / đỏ chỉ cho trạng thái nghiệp vụ; font Inter / JetBrains Mono nếu máy có, không tải từ mạng). Ô số tự xếp theo số ô (4 ô → 2×2, Side Panel ≥ 400px thì 4 cột). Bảng lỡ duyệt cuộn ngang trong khung riêng. Tôn trọng `prefers-reduced-motion`. Bản xem trước tĩnh: `docs/wireframe.html`.

Phần quyết định hiển thị nằm ở `panel/view.js` (thuần): `groupTabs`, `cardView`, `nextTab`, `splitError`. `panel/panel.js` chỉ dựng DOM và áp kết quả. Không có mục cài đặt.

## 9. Bất biến an toàn: nằm ở đâu, test nào giữ

Chạy test: `node --test test/*.test.mjs` (Node ≥ 20, xem CONG_NGHE.md).

**Cách test nạp code:** chọn `node:vm` (không dùng `module.exports`). File của extension là script cổ điển, nên test nạp lần lượt vào **cùng một** ngữ cảnh `vm`, giống hệt Chrome nạp content script. File không phải sửa gì, nên hành vi trong trình duyệt giữ nguyên. Trong lúc chuyển, cách này cũng nạp được code cũ (`legacy/`, nay đã xoá) để so sánh và chốt kết quả.

**Kết quả bản cũ đã chốt** (`test/lib/golden.mjs`, `test/golden/<file test>.json`): mọi chỗ test cần kết quả của code cũ đều gọi `legacy(file, tình huống, hàm chạy code cũ)`.
- Còn `legacy/` (lúc chuyển): chạy code cũ. Nếu tình huống đã chốt thì kết quả phải trùng bản đã chốt; chưa chốt thì ghi vào. Muốn chốt lại có chủ đích: `GOLDEN=update node --test test/*.test.mjs`.
- **Hiện tại** (`legacy/` đã xoá): chỉ đọc bản đã chốt. **Fixture hoặc kịch bản mới không có kết quả cũ để so**: test báo lỗi "Không có kết quả bản cũ đã chốt…". Từ lúc đó, tình huống mới phải viết điều kiện kiểm trực tiếp (như `noaction.test.mjs`), không gọi `legacy(...)`.
- Dữ liệu chốt chỉ là fixture tên giả; không chứa token (có kiểm).

| # | Bất biến | Nơi giữ | Test |
|---|---|---|---|
| 1 | Token, `listBody` chỉ ở RAM | `core/context.js` (giữ), `core/runner.js` (đọc duy nhất), `core/log.js` (nơi duy nhất đọc/ghi storage) | `core`: ranh giới `chrome.storage`, `ADXApiContext`, `listBody`. `undo`: storage không chứa token / `listBody`, mọi request mang token |
| 2 | Lệnh ghi có `expect`; sai thì dừng, log KIỂM TRA TAY kèm đã làm / HỎNG / chưa làm; không rollback | `core/model.js` (`thiCong`/`vanHanh` + `checkResponse`), `core/runner.js` (`execute`) | `golden`: `checkResponse` = bản cũ, mọi lệnh có `expect`. `undo`: hỏng ở lệnh 1 / lệnh 2. `core`: lệnh thiếu `expect` không được gửi |
| 3 | Chỉ thử lại lỗi tạm thời; lệnh idempotent | `core/runner.js` (`post`/`postOnce`); `core/model.js` chỉ dựng lệnh đặt về trạng thái cố định | `undo`: HTTP 500 thì gửi lại y nguyên; `success:false` / không phải JSON thì không gửi lại |
| 4 | Dừng: huỷ ngay lần đọc, để lệnh ghi đang gửi chạy xong | `core/runner.js` (`getList` `canStop = true`; `execute` `canStop = false`; `stopCtl`; `pool`) | `undo`: Dừng lúc đọc / lúc ghi |
| 5 | Gỡ duyệt (và Không xử lý hết) đọc hết rồi mới gửi | `tools/undo/tool.js`, `tools/noaction/tool.js` + cờ `readBeforeWrite` trong `core/runner.js` | `undo`, `noaction`: lần đọc cuối trước lần ghi đầu; cờ bật. `core`: công cụ thử gửi sớm thì bị chặn |
| 6 | Khung phải nhiều bản ghi: một lệnh `VanHanh` | `ADXModel.vanHanh` | `golden`: 3 bản ghi → 1 lệnh |
| 7 | Không lúc nào quá 6 kết nối tới máy chủ: `readAhead + writeConcurrency ≤ 6` (công cụ đọc–ghi chồng nhau); công cụ đọc hết rồi mới gửi thì mỗi bước ≤ 6 | `config.js` (3 + 3; hai bước: 3 / 6), `core/runner.js` (cấp `api.limits` theo `readBeforeWrite`, từ chối `apiStart` khi vượt; chặn đọc–ghi chồng nhau ở công cụ hai bước) | `core`: cấu hình. `undo`: sửa thành 4 + 3 hoặc 7 thì không chạy; đo kết nối đồng thời trên máy chủ giả: Gỡ duyệt / Không xử lý hết đạt 3 đọc rồi 6 gửi, không lúc nào quá 6, không chồng nhau; Chạy tự động ≤ 3 + 3 |
| 8 | Bộ lọc `'1'`/`'2'` chỉ tin khi đếm khớp (bộ lọc `'0'` của `run` cũng phải qua kiểm) | `tools/undo/tool.js` (`readDone`, `readPlan`); `tools/run/tool.js` (`filterOk`, lỗi `mismatch`) | `undo`: máy chủ bỏ qua bộ lọc; bộ lọc đếm đúng nhưng lẫn đơn chưa xử lý. `run`: bộ lọc `'0'` hỏng; đúng đơn nhưng sai thứ tự |
| 9 | Khoá nút chạy khi lệch phiên bản | `config.js` `ADX_VERSION` = `manifest.json`; `core/runner.js` báo `version`; `panel/panel.js` `oldCode()` | `core`: `ADX_VERSION === manifest.version` |
| 10 | Alt+Shift+S, Esc, chống CSV injection | `manifest.json` + `background.js`; `core/runner.js` (Esc); `core/csv.js` | `core`: background gửi `apiStop` tới mọi khung; CSV = `toCsv` bản cũ |
| 11 | Mỗi tab một công cụ chạy | `core/runner.js` (một `state.running` cho mọi công cụ); `panel/view.js` (đang chạy thì khoá nút chạy của mọi công cụ) | `undo`: `apiStart` lần hai bị từ chối. `noaction`: Gỡ duyệt đang chạy thì Không xử lý hết bị từ chối. `panel`: đang chạy thì nút chạy ở mọi thẻ khác bị khoá, Dừng bấm được |

Test so với bản cũ (`test/golden/`): `golden` (luật dùng chung, `undoFor`), `run` (`decide`, `planFor`, `gcnSignals`, kể cả khi tắt cờ luật), `undo` và `run` (cả lần chạy trên máy chủ giả: tập lệnh ghi, dữ liệu máy chủ, trạng thái, nhật ký, thống kê, câu kết quả), `core` / `run` (CSV, tiến độ Side Panel). Fixture: `test/fixtures/*.json`, tên người giả.

`audit`: cả lần quét = `auditFix` cũ (lệnh, dữ liệu, kết quả đã lưu, nhật ký); CSV bảng lỡ duyệt giống từng byte nút "Xuất CSV" cũ. `panel`: chạy `panel.js` thật trên DOM giả (`test/lib/fake-dom.mjs`) để kiểm tab, ARIA, phím, khoá nút, thông báo, thống kê, bảng lỡ duyệt. **Bố cục, màu, bề rộng 320px không test được tự động**: kiểm bằng mắt theo KE_HOACH.md mục 2.4.

Kịch bản của `run` trên máy chủ giả: đợt mới (đọc cả đợt), máy chủ đổi thứ tự sau mỗi lệnh ghi, đọc chậm hơn ghi (có đơn bị sót, "xử lý nốt" làm hết), còn ít đơn chưa xử lý (`runPending`), bộ lọc `'0'` hỏng hoặc sai thứ tự, có đơn bị đổi về "chưa xử lý" lúc đếm lại (chạy thêm lượt), trang trả thiếu, lỗi 503, lệnh hỏng (H1), chạy lần hai.

## 10. Mô hình dữ liệu API (dùng dựng fixture)

Một đơn là một phần tử trong `value[]` của `KiemTraDuLieuChuyenDoi`: `{success, value[], recordsTotal}`.

| Trường | Ý nghĩa |
|---|---|
| `goiTinDongBoNId` | Mã gói tin, là khoá khi gửi lệnh |
| `trangThaiGoiTinDongBo` | `0` chưa xử lý, `1` đã xử lý, `2` (đoán) đã đồng bộ |
| `ThongTinDangKyThiCong` | Khung trái: `TinhHinhDangKy.maDon`, `ChuSoHuu`, `TaiSan`, `ActionProcessSyncData` |
| `ThongTinDangKyVanHanh[]` | Khung phải: `TinhHinhDangKy.tinhHinhDangKyId`, `ListGiayChungNhan`, `ChuSoHuu`, `ActionProcessSyncData` |
| `tinhHinhDangKyVanHanhIds` | Mã bản ghi khung phải |

`serverState`: `trangThai 0` → `pending`; `1` + khung trái `1` → `approved`; `1` + khung trái `0` → `noaction`; còn lại → `other`.

Phản hồi lệnh ghi: `{success: true, value: {trangThai, actionProcessSyncDataThiCong, actionProcessSyncDataVanHanh: '<chuỗi JSON {"ListProcessSyncData":[{tinhHinhDangKyId, actionProcessSyncData}]}>'}}`.

| Thao tác | Endpoint | Hàm dựng | `expect` |
|---|---|---|---|
| Thêm vào dữ liệu vận hành | `UpdateStatusGoiTinDongBoThiCong` | `thiCong(goi, 1, label)` | `{trangThai:1, thiCong:1}` |
| Không xử lý | `…ThiCong` | `thiCong(goi, 0, label)` | `{trangThai:1, thiCong:0}` |
| Bỏ duyệt khung trái | `…ThiCong` | `thiCong(goi, -1, label, 0)` | `{trangThai:0, thiCong:-1}` |
| Cập nhật lịch sử | `UpdateStatusGoiTinDongBoVanHanh` | `vanHanh(goi, ids, 3, 1, label)` | `{trangThai:1, vanHanh:{ids, action:3}}` |
| Bỏ duyệt khung phải | `…VanHanh` | `vanHanh(goi, ids, -1, 0, label)` | `{trangThai:0, vanHanh:{ids, action:-1}}` |

## 11. Cần sửa ở đâu khi…

| Tình huống | Sửa ở |
|---|---|
| Trang đổi đường dẫn / tên API | `config.js` → `api.base`, `list`, `thiCong`, `vanHanh`; đổi tên API danh sách thì sửa thêm `LIST_RE` trong `core/hook.js` |
| Trang đổi body / mã action của lệnh | `thiCong` / `vanHanh` trong `core/model.js`, **sửa cả `expect`**, chạy lại test. Test so với bản cũ sẽ hỏng – đây là thay đổi có chủ đích: sửa điều kiện kiểm hoặc sửa tay `test/golden/*.json` cho khớp (khi đã xoá `legacy/` thì không chốt lại tự động được) |
| Trang đổi mã trạng thái | `serverState`, `checkResponse` trong `core/model.js` |
| Đổi luật đơn nào cần gỡ | `undoFor` trong `tools/undo/rules.js` |
| Đổi luật Không xử lý hết | `noactionFor` trong `tools/noaction/rules.js`, bảng mục 5.7, `test/noaction.test.mjs` |
| Đổi luật Duyệt ĐVHC 2 cấp | `dvhcFor` trong `tools/dvhc/rules.js`, bảng mục 5.8, `test/dvhc.test.mjs` |
| Đổi luật duyệt / dấu hiệu GCN / tên trường số tờ, số thửa | Khác bản cũ có chủ đích (22/10/2026): khung phải có số tờ / số thửa thì so theo từng bản ghi (bản ghi trùng = mọi thửa của nó có ở khung trái). Cờ `RULES.historyByLand` (mặc định true; false = như bản cũ, test so bản cũ chạy với false). Đơn vẫn duyệt (Thêm vào); bản ghi không có số tờ / số thửa coi là không trùng; chỉ một phần / không bản ghi nào trùng → `decide` trả thêm `lsIds` (có thể rỗng), `planFor` chỉ Cập nhật lịch sử các mã đó (vẫn MỘT lệnh; rỗng → không gửi lệnh khung phải). Ghi chú log của đơn duyệt = các lý do sau lý do đầu (`recs` / `match` trong `decide`, test `test/run-to-thua.test.mjs`). `tools/run/rules.js` (`decide`, `GCN_KEY`, `GCN_VALUES`, `GCN_IGNORE`, `TO_KEY`, `THUA_KEY`); cờ bật / tắt: `RULES` cùng file. Test `run` sẽ báo khác bản cũ: cập nhật có chủ đích |
| Đổi cách chạy của Chạy tự động (tỉ lệ đọc cả đợt, số lượt) | `config` trong `tools/run/tool.js` (`fullScanRatio`, `maxPasses`) |
| Đổi điều kiện "lỡ duyệt", cỡ trang quét | `run()` và `CONFIG` trong `tools/audit/tool.js` |
| Tốc độ, thử lại, timeout | `config.js` → `api`: `readAhead` + `writeConcurrency` ≤ 6 (Chạy tự động, Quét và sửa); `phasedReadAhead`, `phasedWriteConcurrency` mỗi số ≤ 6 (Gỡ duyệt, Không xử lý hết). Đổi xong xem dòng "Tốc độ: …" |
| Cột CSV nhật ký | `ADXCsv.LOG_HEAD` / `logRows` trong `core/csv.js` (chung mọi công cụ) |
| Cột CSV bảng lỡ duyệt | `CSV_HEAD`, `csvRows` trong `tools/audit/tool.js` |
| Thêm / đổi nhãn tab, gộp công cụ chung một tab | `tab` trong phần đăng ký của công cụ (`tools/<id>/tool.js`) |
| Đổi cách hiện tab / thẻ / khoá nút | `panel/view.js` (quyết định), `panel/panel.js` (DOM), `panel/panel.css` (kiểu); test `test/panel.test.mjs` |
| Thêm công cụ mới | `tools/<id>/rules.js` + `tool.js`, một dòng `manifest.json` (mục 5.3); tab tự xuất hiện; mục trong file này và `HUONG_DAN.md`, file `test/<id>.test.mjs` |
| Ra bản mới | `version` ở `manifest.json` **và** `ADX_VERSION` ở `config.js` |

## 12. Ánh xạ file cũ → file mới

| Bản Duyệt 2.1.3 | Bản Gỡ 2.2.4 | Bản 3 |
|---|---|---|
| `manifest.json` | `manifest.json` | `manifest.json` (một bản, `version` 3.0.0) |
| `config.js` | `config.js` | `config.js` (phần chung) + `config` của `tools/run`, `tools/audit` |
| `common.js` → `ADX` | `common.js` → `ADX` | `core/common.js` (`RESULT` chuyển thành `log.results` của từng công cụ) |
| `common.js` → `ADXLog` | `common.js` → `ADXUndoLog` | `core/log.js` → `ADXLog` theo namespace (bỏ `migrate` mảng `adxLog` rất cũ) |
| `background.js` | `background.js` | `background.js` (bỏ dọn khoá cũ, H2) |
| `content/api-hook.js` | giống hệt | `core/hook.js` (đổi cờ / kiểu thông điệp, H2a) |
| `content/api-context.js` | giống hệt | `core/context.js` (đổi kiểu thông điệp) |
| `api-rules.js`: `ownerNames`, `serverState`, `STATE_LABEL`, `stateLabel`, `rawState`, `historyIds`, `thiCong`, `vanHanh`, `checkResponse` | cùng các hàm + `info` | `core/model.js` |
| `api-rules.js`: `decide`, `planFor`, `gcnSignals`, `landProblems`, `nonEmpty`, `sameIds`, `anyList`; `config.js` → `rules` | – | `tools/run/rules.js` (sinh bằng cách cắt nguyên văn các dòng của file cũ) |
| – | `api-rules.js`: `undoFor` | `tools/undo/rules.js` |
| `api-run.js`: `postOnce`, `post`, `getList`, `readPages`, `readItems`, `pool`, `writeLog`, `flushLog`, dừng, `broadcast`, `stateObj`, `perf`, `session`, `start`, `onMessage`, Esc | giống hệt (trừ `readPages` không có `firstPage`) | `core/runner.js` |
| `api-run.js`: `handle` (phần gửi lệnh) | `handle` | `core/runner.js` → `execute` |
| `api-run.js`: `run`, `runAll`, `runPending`, `sweepLeftovers`, `processOne`, `handle` (phần quyết định), `summary` (nhánh run); `config.js` → `fullScanRatio`, `maxPasses` | – | `tools/run/tool.js` |
| `api-run.js`: `auditFix`, `summary` (nhánh audit); `config.js` → `auditPageSize`, `uiPageSize` | – | `tools/audit/tool.js` |
| – | `api-run.js`: `readPlan`, `readDone`, `undoAll`, `tagOf`, `summary` | `tools/undo/tool.js` |
| `popup/popup.js`: `sendAll`, `sendFrame`, `pickApi`, `oldCode`, `download`, nút Dừng | giống hệt | `panel/panel.js` |
| `popup/popup.js`: `renderRun` | `renderRun` | `panel.progress` / `counters` / `note` của từng công cụ |
| `popup/popup.js`: `renderAudit`, `resultOf`, `RESULT_TEXT`, `btnAuditCsv` | – | `panel.report` (`render`, `CSV_HEAD`, `csvRows`) trong `tools/audit/tool.js` |
| `popup/popup.js`: `renderApi` | `renderApi` | `panel/view.js` `cardView` (quyết định) + `panel/panel.js` `renderApi` (DOM) |
| `popup/popup.js`: `toCsv`, `stamp` | `toCsv`, `stamp` | `core/csv.js` |
| `popup/popup.html`, `popup.css` | `popup/popup.html`, `popup.css` | `panel/panel.html`, `panel.css` (CSS bản Duyệt, bỏ khối không dùng, thêm thẻ chọn công cụ) |
| `icons/` | `icons/` (giống hệt) | `icons/` |
| `lo-duyet-gcn_*.csv` | giống hệt | **không chép** (có họ tên người thật). Bản gốc còn trong Thùng rác |
