# Aurora Codebase Review

**Date:** 1 March 2026
**Updated:** 1 March 2026
**Scope:** Stability, robustness, metadata storage, OBR webstore compliance, code hygiene
**Version reviewed:** 0.9.2

---

## Executive Summary

Aurora is a well-architected Owlbear Rodeo extension with strong fundamentals: strict TypeScript, minimal dependencies, modular file structure, a sophisticated GPU shader, and thoughtful UX touches like live preview and soft undo. The codebase is production-quality in many areas.

This review identified **28 findings** across four categories, grouped by priority. **17 have been resolved** (marked ✅ below). The remaining 11 are deferred or accepted as-is. Key remaining items for future consideration: custom domain setup (3.2), cleaning old assets (3.4), extracting inline CSS (4.2), and adding accessibility attributes (4.5).

---

## Table of Contents

1. [Stability & Robustness](#1-stability--robustness)
2. [Metadata Storage](#2-metadata-storage)
3. [OBR Webstore Compliance](#3-obr-webstore-compliance)
4. [Code Hygiene & Style](#4-code-hygiene--style)

---

## 1. Stability & Robustness

### 1.1 — ✅ Type guards don't validate numeric ranges

**Files:** `src/shared/types.ts:111-123`
**Status:** RESOLVED — Range checks added to both `isAuroraConfig()` (s: 0–200, l: 0–200, h: -180–180, o: 0–100) and `isPresets()` preset field validation.

---

### 1.2 — ✅ Preset array length not enforced to MAX_PRESET_SLOTS

**File:** `src/shared/presets.ts`
**Status:** RESOLVED — `loadPresets()` now pads short arrays to `MAX_PRESET_SLOTS` with `null` entries before returning.

---

### 1.3 — ✅ Race condition in first-access preset seeding

**File:** `src/shared/presets.ts`
**Status:** RESOLVED — Comment added documenting the idempotent race condition as harmless (all clients write identical data).

---

### 1.4 — ✅ `idsToRemove.includes()` inside a loop is O(n²)

**File:** `src/background/effectManager.ts`
**Status:** RESOLVED — `idsToRemove` changed from `string[]` to `Set<string>` with `.add()`, `.has()`, `.size` operations.

---

### 1.5 — ✅ `effectSnapshot` uses `join("|")` for cache keys

**File:** `src/background/effectManager.ts`
**Status:** RESOLVED — Switched from `.join("|")` to `JSON.stringify([...])` for unambiguous cache keys.

---

### 1.6 — ✅ `removeAuroraFromItems` doesn't validate before snapshotting

**File:** `src/menu/main.ts`
**Status:** RESOLVED — Changed `if (config)` to `if (isAuroraConfig(config))` before snapshotting to `LAST_CONFIG_KEY`.

---

### 1.7 — ✅ Background page doesn't store the effect manager cleanup function

**File:** `src/background/main.ts`
**Status:** RESOLVED — Cleanup function captured, `onReadyChange` unsub stored, `beforeunload` handler added for both.

---

### 1.8 — ✅ `onReadyChange` subscription in `main.ts` is never cleaned up

**File:** `src/main.ts`
**Status:** RESOLVED — `onReadyChange` subscription stored in `unsubSceneReady` and added to `beforeunload` cleanup.

---

### 1.9 — ✅ No user-facing error feedback

**Files:** `src/background/effectManager.ts`, `src/main.ts`, `src/menu/main.ts`
**Status:** RESOLVED — `OBR.notification.show()` calls added for: effect reconciliation failure (WARNING), preset clear/rename failures (ERROR), and preset save failure (ERROR).

---

### 1.10 — ✅ `server.js` has security vulnerabilities (dev-only)

**File:** `server.js`
**Status:** RESOLVED — Path traversal protection added (`path.resolve` + prefix check with 403 response). Error responses changed to `text/plain` to eliminate XSS.

---

## 2. Metadata Storage

### 2.1 — ✅ UI collapse state is shared across all players (design concern)

**File:** `src/main.ts`, `src/shared/keys.ts`
**Status:** RESOLVED — UI collapse state moved from room metadata to `localStorage` keyed by `aurora-uiState-{OBR.room.id}`. Now per-browser, per-room. `UI_STATE_KEY` removed from `keys.ts`.

---

### 2.2 — ✅ Room metadata 16KB limit not monitored

**File:** `src/shared/presets.ts`
**Status:** RESOLVED — Comment added to file header documenting the 16KB room metadata constraint and Aurora's current usage (~500 bytes).

---

### 2.3 — ✅ Migration uses `undefined` to delete room metadata keys

**File:** `src/background/migrateMetadata.ts`
**Status:** RESOLVED — Multi-line comment added explaining OBR's shallow merge semantics where `undefined` deletes keys.

---

### 2.4 — ✅ `LAST_CONFIG_KEY` survives item duplication

**File:** `src/menu/main.ts`
**Status:** RESOLVED — JSDoc NOTE added documenting this as intentional behaviour (duplicating a formerly-Aurora item conveniently inherits the soft-undo snapshot).

---

## 3. OBR Webstore Compliance

### 3.1 — ⏭️ CORS header configuration doesn't match hosting platform

**File:** `public/_headers`
**Status:** DEFERRED — Already configured in Render dashboard settings. The `_headers` file is a no-op on Render but harmless.

---

### 3.2 — No custom domain configured

**File:** `public/manifest.json`, `src/shared/pluginId.ts`

The plugin namespace and hosting are both `aurora-0nm6.onrender.com` — a Render-assigned subdomain. OBR's hosting documentation recommends setting up a custom domain so you can switch hosting providers without changing the namespace (which would break all existing room metadata).

**Recommendation:** Register a custom domain (e.g., `aurora-vtt.com`) and configure it as the plugin namespace. This is the single most important infrastructure change before store submission.
**Benefit:** Future-proofs the namespace; metadata keys survive hosting migrations; looks more professional for webstore listing.

---

### 3.3 — ✅ `homepage_url` points to raw GitHub README

**Files:** `public/manifest.json`, `index.html`, `README.md`
**Status:** RESOLVED — `homepage_url` updated to repo root. README moved from `public/` to project root. In-app help link changed to GitHub URL.

---

### 3.4 — Old assets and files should be cleaned up before submission

**Files:** `public/icon.old.png`, `Updating the version number.txt`

These files are development artefacts:
- `icon.old.png` — previous version of the icon, no longer referenced
- `Updating the version number.txt` — notes that duplicate what's already documented in `vite.config.ts`

**Recommendation:** Remove both files before webstore submission.
**Benefit:** Clean repository; no confusion about which icon is current.

---

### 3.5 — ✅ Icon references updated

**File:** `README.md`
**Status:** RESOLVED — PNG icon retained in `public/` for the extension manifest. README icon `src` paths updated from `icon.png` to `public/icon.png` after README moved to project root.

---

### 3.6 — `manifest.json` description could be improved

**File:** `public/manifest.json:3`

The current description ("Time-of-day Map-layer effects with 4 presets; 'Add Aurora', then adjust hue, saturation, lightness, opacity, and feathering") is functional but reads more like instructions than a store listing.

**Recommendation:** Rephrase as a store-facing description: e.g., "Real-time colour grading for map items — adjust saturation, lightness, hue, and opacity with blend modes, edge feathering, and shareable presets."
**Benefit:** More appealing store listing; clearer value proposition.

---

## 4. Code Hygiene & Style

### 4.1 — ✅ Duplicate `vite-env.d.ts` files

**File:** `vite-env.d.ts` (project root)
**Status:** RESOLVED — Root-level duplicate deleted. Only `src/vite-env.d.ts` remains (included by `tsconfig.json`).

---

### 4.2 — Large inline `<style>` blocks in HTML files

**Files:** `index.html` (~500 lines of CSS), `menu.html` (~350 lines of CSS)

Both HTML files contain extensive inline CSS. The shared `base.css` pattern is good but covers only tokens and reset. All component styles are inline.

**Recommendation:** Extract inline styles to dedicated CSS files (e.g., `src/main.css`, `src/menu/main.css`) imported via `<link>`. Vite handles CSS imports natively.
**Benefit:** Better separation of concerns; CSS is lintable, autoformatted, and easier to review in diffs. Enables CSS tooling (PostCSS, autoprefixer) if needed later.

---

### 4.3 — `server.js` uses CommonJS in an ESM project

**File:** `server.js`

The project uses `"type": "module"` in `package.json`, but `server.js` uses `require()`. Node.js allows this because `.js` files in `"type": "module"` projects can still use CommonJS if invoked directly, but it's inconsistent with the rest of the codebase.

**Recommendation:** Either convert to ESM (`import`/`export`) and rename to `server.mjs`, or remove entirely in favour of `vite dev` which provides the same functionality with better DX.
**Benefit:** Consistency; reduced maintenance burden.

---

### 4.4 — Inconsistent DOM construction patterns

**Files:** `src/main.ts` (renderPresets, buildThumb), `src/menu/main.ts` (showSaveDialog)

The UI is built with a mix of `innerHTML = ""` to clear containers, `document.createElement` chains, and string concatenation for option text. The approach works but is verbose.

**Recommendation:** Low priority. For this codebase size, the current approach is acceptable. If the UI grows, consider a lightweight templating helper or extracting common patterns (e.g., a `createSlider()` factory).
**Benefit:** Reduced boilerplate if the UI expands.

---

### 4.5 — Missing accessibility attributes

**Files:** `index.html`, `menu.html`

Custom interactive elements lack ARIA markup:
- Toggle switches (`masterToggle`, scene item toggles) have no `role="switch"` or `aria-checked`
- Slider value labels aren't linked to sliders via `aria-labelledby`
- The rename/save dialogs lack `role="dialog"` and `aria-modal`
- Collapsible sections lack `aria-expanded`

**Recommendation:** Add appropriate ARIA attributes. This may be required for OBR webstore verification.
**Benefit:** Screen reader compatibility; better keyboard navigation; potentially required for store verification.

---

### 4.6 — Non-null assertion in `updatePresetDropdown`

**File:** `src/menu/main.ts:325`

`ui!.presetSelect.appendChild(option)` uses a non-null assertion inside a `forEach` callback. The enclosing function already checks `if (!ui) return`, and the callback is synchronous, so this is safe — but TypeScript's control flow analysis doesn't narrow inside callbacks.

**Recommendation:** Capture `ui` in a local const at the top of the function (e.g., `const currentUI = ui; if (!currentUI) return;`) and use the local variable inside the callback.
**Benefit:** Eliminates the `!` assertion; idiomatic TypeScript narrowing.

---

### 4.7 — `beforeunload` is not guaranteed to fire

**Files:** `src/main.ts:619`, `src/menu/main.ts:624`

`window.addEventListener("beforeunload", ...)` is used for subscription cleanup, but this event may not fire on mobile browsers, during crashes, or when the iframe is removed by OBR. OBR's SDK likely handles this case internally.

**Recommendation:** Low priority. Document that cleanup depends on `beforeunload` and that OBR's iframe lifecycle management provides the fallback.
**Benefit:** Explicitness about cleanup guarantees.

---

### 4.8 — Blend mode dropdown is hidden but fully wired

**Files:** `menu.html:418`, `src/menu/main.ts:241-250, 380-387`

The blend mode `<select>` is hidden via `display: none` in the HTML, but the JS still populates it, listens for changes, and updates it. Dead UI code increases maintenance burden.

**Recommendation:** Either remove the hidden dropdown and its JS (presets already set blend mode automatically), or make it visible and document why it was hidden. If keeping it as a power-user feature, consider a "Show Advanced" toggle.
**Benefit:** Clearer intent; reduced code if removed; better UX if exposed.

---

## Priority Summary

### Resolved (17 of 28)

All stability/robustness items (1.1–1.10), all metadata items (2.1–2.4), and select webstore/hygiene items (3.3, 3.5, 4.1).

### Remaining (11 of 28)

| Priority | # | Findings |
|----------|---|----------|
| **High** (fix before store submission) | 2 | 3.2 custom domain, 3.4 clean old files |
| **Medium** (improve quality) | 3 | 3.6 description, 4.2 extract CSS, 4.5 accessibility |
| **Low** (polish) | 5 | 4.3 server.js ESM, 4.4 DOM patterns, 4.6 non-null assertion, 4.7 beforeunload docs, 4.8 hidden blend mode |
| **Deferred** (handled externally) | 1 | 3.1 CORS config (in Render settings) |

---

## Architecture Strengths

The review should also acknowledge what's done well, since these represent patterns worth preserving:

- **Metadata-driven sync** — All state lives in OBR metadata with subscription-based reactivity. No custom networking code.
- **Local preview pattern** — Sliders update `scene.local` effects instantly during drag, then sync to `scene.items` on release. Excellent UX.
- **Snapshot cache** — Avoids needless effect rebuilds when non-config changes fire the onChange callback.
- **Re-entrancy guard** — Queues pending reconciles without dropping the latest state.
- **Backwards compatibility** — Optional fields (`b`, `f`, `fi`) with defaults ensure older configs load correctly.
- **Soft undo** — `LAST_CONFIG_KEY` preserves settings after "Remove Aurora" so they can be restored.
- **Layer-composed z-indexing** — Elegant solution for ordering POST_PROCESS effects from different parent layers.
- **Single version source** — Vite plugin syncs `package.json` version to `manifest.json` at build time.
- **Minimal dependencies** — Only `@owlbear-rodeo/sdk` at runtime; no framework overhead.
- **Comprehensive comments** — Especially in the shader and effect manager, documenting *why* not just *what*.
