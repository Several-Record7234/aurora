# Aurora — Progress

## Current State (v0.9.2, last updated 2026-04-30)

- GPU shader colour grading on POST_PROCESS layer working
- Controls: saturation, lightness, hue, opacity, crisp/dreamy
- Preset system: 4 built-in + 2 user-customizable slots
- Gradient effects, feather, invert
- **Crisp ← → Dreamy slider**: negative = unsharp mask (crisp), positive = bloom (dreamy)
- **Adaptive bloom threshold**: CPU luminance histogram (top 20% percentile), area-weighted by world-space bounds, computed per-shader on menu open — confirmed working
- Per-shader overlap detection via `getItemBounds` — multiple Aurora shaders in one scene each get an independent threshold
- **Shader colour-space fix**: blur desaturated AND lightness-corrected to match `graded` before bloom/unsharp operations — eliminates colour bleed at low saturation and disproportionate dreamy effect at non-100% Lightness
- **Plugin namespace migrated**: `aurora-0nm6.onrender.com` → `aurora.several-record.com`; backwards-compatible migration in `src/background/migrateMetadata.ts` covers all 5 item keys and 1 room key
- **CSS extracted**: `src/main.css` and `src/menu/main.css` (removed inline `<style>` blocks from both HTML files)
- **ARIA compliance pass**: full `aria-expanded`, `aria-controls`, `role="switch"`, `aria-checked`, `aria-pressed`, `aria-labelledby`, `role="dialog"` coverage across both UIs
- **What's New modal**: fully wired — `src/changelog.ts`, `src/whatsNew.ts`, `whats-new.html`; GM auto-trigger on first open after update; manual "What's New" link in How to Use section header (all users); `lastSeen` in `localStorage` under `aurora:lastSeenVersion`; layout uses `position:fixed;inset:0` for reliable iframe fill
- **Left-side chevrons**: rotating `▼` before section title in all three collapsible headers
- **Manifest description**: Option B — "Change scene mood without swapping maps…"
- **Help page**: `public/help.html` generated at build time from README.md via `scripts/build-help.js` + `marked`; in-app help icon and `manifest.json` `homepage_url` both point to `https://aurora.several-record.com/help.html`
- Scene items list, GM-only controls
- Soft undo on remove
- Help section with Discord link
- Vitest test suite: 75 tests, 6 snapshots, pre-commit hook
- Codebase review (2026-04-30): 22 of 28 recommendations completed
- Menu popover fits all controls without a scrollbar
- **Pushed to origin/main** (2026-04-30, 6 commits); Cloudflare Pages deployed

## Recent History

- **2026-04-30 (session 3):** What's New modal cosmetic fixes (icon path, font sizes, `position:fixed;inset:0` layout, `overflow-y:scroll`, consistent 360×480 dimensions). What's New link moved from paragraph to How to Use section header (right-justified, stopPropagation). Tailwind migration logged as deferred future consideration. Help page (build-help.js) implemented — all 3 phases: infrastructure, README media pass (11 images, 3 broken mixed-format entries fixed), wiring (manifest + in-app link). Crisp/Dreamy section added to README. All 6 commits pushed to origin/main.
- **2026-04-30 (session 2):** Shader bug fixed — blur lightness mismatch caused disproportionate bloom/unsharp at l≠100%; fix: `blurred *= lightness` after saturation correction. What's New modal wired end-to-end (auto-trigger + manual link). Manifest description updated to Option B. Left-side chevrons on all section headers. Snapshot updated. 75/75 tests pass.
- **2026-04-30 (session 1):** Plugin namespace migrated from Render to Cloudflare Pages URL (`aurora.several-record.com`). Backwards-compatible metadata migration added to background startup. CSS extracted from both HTML files. Full ARIA compliance pass. Codebase review items 3.2, 3.4, 4.2, 4.5 completed (22/28 total). `pluginId.test.ts` updated. `.gitignore` updated. All committed locally.
- **2026-03-31:** Added Crisp ← → Dreamy slider (bloom/unsharp mask). CPU-side luminance histogram for adaptive bloom threshold, area-weighted by world-space bounds, using `getItemBounds` for per-shader spatial overlap detection. Shader colour-space fix: desaturate blur to match graded signal. Menu vertical compaction. Test suite extended 66→75 tests. Debug logs commented out.
- **2026-03-16:** Added Vitest test suite (66 tests, 6 snapshots) covering presets, type guards, shader uniforms, and metadata keys. Pre-commit hook blocks commits on test failure.
- Merge conflict resolved in index.html
- README media pass (PNGs, GIFs, MOV)
- Info/help link correction
- Codebase review acted on (17/28 items done)

## Open Questions

- 5 remaining codebase review recommendations — prioritise or defer? (4.3 server.js ESM, 4.4 DOM patterns, 4.6 non-null assertion, 4.7 beforeunload docs, 4.8 hidden blend mode)
- POST_PROCESS layer interaction with other extensions (shared concern with faro)
- Golden Hour preset `d` value — needs empirical testing on real maps before setting non-zero

## Next Steps

- [ ] Capture Crisp/Dreamy GIF (`Aurora 9 - Crisp Dreamy slider.gif`) — in progress
- [ ] Add GIF to README on GitHub (upload asset, replace PLACEHOLDER URL), pull back locally
- [ ] Final commit: README + version tag (v0.9.2 or v1.0.0 — decision still open)
- [ ] Announcement (OBR Discord #extensions-showcase)
- [ ] Triage remaining 5 review recommendations
- [ ] Distinguish clearly from aurora.old (archived predecessor)

## Future Considerations (deferred)

- **React + Tailwind migration**: Aurora was the first project in the portfolio, predating the React + Tailwind standard adopted by all subsequent extensions. The vanilla TS + hand-coded CSS approach is unintended divergence, not a deliberate architectural choice. Migration cost: ~2–3 days (885 lines CSS, 101 CSS-var usages, 40 classList ops, 14 runtime `.style.` mutations that must stay). Defer until there is a substantive reason to open the codebase for a larger rework (e.g. new feature requiring richer UI), at which point standardising the stack should be bundled in.

## Housekeeping

- [ ] Apply standard `.claude/settings.json` baseline template (see Recommendation B in `c:\Coding\agent-permissions-audit.md`)

## Session Log

- 2026-04-30 SESSION START: codebase review triage (items 3.2, 3.4, 3.6, 4.2, 4.5) + pack-up writes
- 2026-04-30 SESSION END: namespace migrated, CSS extracted, ARIA done, 22/28 review items resolved; pack-up writes applied
- 2026-04-30 21:48 -- SESSION START: v0.9.2 push decision — version bump and announcement timing
- 2026-04-30 21:45 -- SESSION END: shader lightness fix, What's New modal wired, left-side chevrons, manifest description; 4 commits ahead, not pushed
- 2026-04-30 21:48 -- SESSION START: v0.9.2 push decision — version bump and announcement timing
- 2026-04-30 23:20 -- SESSION END: What's New modal fixes, help page (all 3 phases), Crisp/Dreamy README section, 6 commits pushed to origin/main

- 2026-04-30 23:30 -- SESSION CLOSED (hook)
- 2026-04-30 23:30 -- SESSION START: final commit — add public/images/ and scripts/, rebuild, version tag, announcement

- 2026-04-30 23:32 -- SESSION CLOSED (hook)
