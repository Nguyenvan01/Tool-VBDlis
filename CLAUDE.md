# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Chrome Manifest V3 extension (Side Panel) that batch-processes land-registration applications ("đơn") on MPLIS (`https://*.mplis.gov.vn/*`) by calling the site's own AJAX API (`/dc/TichHopDongBoDuLieuAjax/*`) with the logged-in user's cookie and `__RequestVerificationToken`. It never clicks the UI or reads the DOM. Plain JavaScript: **no build step, no dependencies, no npm**. Docs, comments, UI strings and log text are in Vietnamese — keep new text in Vietnamese.

## Commands

Requires Node.js ≥ 20, nothing to install.

```bash
node --test --test-timeout=60000 test/*.test.mjs          # all tests
node --test --test-timeout=60000 test/undo.test.mjs       # one file
node --test --test-name-pattern="<substring>" test/run.test.mjs   # one test
```

Tests run against a fake MPLIS server (`test/lib/fake-mplis.mjs`) and a fake DOM (`test/lib/fake-dom.mjs`); they never hit mplis.gov.vn. To try the real extension: `chrome://extensions` → Load unpacked → this folder; after any code change, ⟳ the extension and F5 the MPLIS page.

**Version bump:** `ADX_VERSION` in `config.js` must equal `"version"` in `manifest.json` — the Side Panel uses it to detect a stale extension/page and locks the run buttons on mismatch.

## Architecture

Detailed design lives in `docs/KIEN_TRUC.md` (read section 5 for the tool contract, 9 for safety invariants, 10 for the API data model, 11 for "where to change X").

- **Content scripts are classic scripts sharing one global scope**, loaded in the order listed in `manifest.json`. There are no imports; modules communicate via globals (`ADX_CONFIG`, `ADX`, `ADXRules`, `ADXTools`, …). Load order matters.
- **`core/hook.js`** runs in the page's MAIN world, observes (never modifies) XHR/fetch to capture the token, the open batch (`dotBanGiaoNId`) and the list request body, and `postMessage`s them to **`core/context.js`** (isolated world), which keeps them **in memory only** — never persist the token.
- **`core/runner.js`** is the core: POST + retry, list paging, concurrency pool, `execute` (send a write and verify the server response against `expect`), stop/Esc handling, one tool per frame, messaging with the panel. It must be the **last** content script.
- **`core/model.js`** is pure: field extraction, `serverState`, request builders `thiCong` (left pane) / `vanHanh` (right pane), `checkResponse`.
- **`core/log.js`** is the only place that touches `chrome.storage.local` (keys `<id>:log:*`, `<id>:stats`, …). `core/csv.js` exports CSV with injection guarding.
- **Tools** live in `tools/<id>/`: `rules.js` = pure decision logic assigned to `ADXRules.<id>` (no I/O); `tool.js` = `ADXTools.register({...})` with `run(api)`, `counts`, `summary`, `panel`, `log`. Tools only use the narrow `api` object from the runner — they never see the token, `fetch`, or `chrome.storage`. The core never names a specific tool. `tools/*` files are also loaded by the Side Panel, so at load time they may only assign `ADXRules` / call `register`.
- **Adding a tool:** create `tools/<id>/rules.js` + `tool.js`, add one line to the third `content_scripts` block in `manifest.json` (before `core/runner.js`; order = tab order), write `test/<id>.test.mjs`, and document rules in `docs/KIEN_TRUC.md` and `HUONG_DAN.md`. `id` must be a single lowercase word.
- `panel/` is the Side Panel (`panel.js` + plain `view.js`); `background.js` opens it and handles the Alt+Shift+S emergency stop.

## Safety invariants (enforced by tests — don't break them)

- Every write carries an `expect`; a mismatched server response stops the whole run and marks the item **KIỂM TRA TAY**. No automatic rollback.
- Never more than **6** concurrent connections: `readAhead + writeConcurrency ≤ 6` for overlapped tools (`run`, `audit`); each of `phasedReadAhead` / `phasedWriteConcurrency` ≤ 6 for phased tools. The runner refuses to start otherwise.
- Phased tools (`undo`, `noaction`, `dvhc`) **read the whole list before writing** (`readBeforeWrite`), because writes reorder the server's list.
- All writes set an item to a fixed state, so retries are idempotent.

## Tests and golden files

The code was ported from two legacy extensions (Duyệt 2.1.3, Gỡ duyệt 2.2.4). Their outputs on every fixture are frozen in `test/golden/*.json`; `legacy/` has been deleted, so goldens can no longer be regenerated (`GOLDEN=update` only works if `legacy/` exists). Intentional behavior changes (e.g. the `RULES.historyByLand` flag in `tools/run/rules.js`, `syncWhenDone`) are tested with the flag turned off when comparing against goldens. If you intentionally change request bodies/action codes in `core/model.js`, update `expect` too and hand-edit the affected golden JSON.

Fixtures (`test/fixtures/*.json`) use fake names. Real CSV logs contain real people's names — `*.csv` is gitignored; never commit them.
