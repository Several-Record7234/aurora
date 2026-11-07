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
- **v0.9.2 shipped**: tagged and pushed (8 commits total); Cloudflare Pages deployed; What's New serif font fixed (7a94ea3); dreamy/crisp correction coverage documented in CLAUDE.md

## Recent History

- **2026-05-25:** v0.9.2 final commit + tag pushed. Serif font bug fixed in What's New modal (`font-family: sans-serif` on `<body>` mapped to serif on Windows — replaced with full system-font stack). Dreamy/crisp correction coverage analysed and documented in CLAUDE.md: lightness correction is exact; saturation is a good approximation (minor divergence at 0% and >100%); hue+opacity not corrected (known limitation at high Multiply opacity).
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

- [ ] Triage remaining 5 review recommendations (4.3 server.js ESM, 4.4 DOM patterns, 4.6 non-null assertion, 4.7 beforeunload docs, 4.8 hidden blend mode)
- [ ] Distinguish clearly from aurora.old (archived predecessor)
- [ ] PATH/CURVE polygon host support — see Feature section below

## Feature: PATH/CURVE Polygon Host Support

### Intent
Allow any OBR PATH or CURVE item (freehand-drawn polygons, OBR drawing tool shapes) to be used as an Aurora shader host, with the feather control correctly tracking the polygon boundary rather than a rectangular or elliptical approximation. Currently only IMAGE and SHAPE (rect/circle/triangle/hex) items are supported.

### Prior art — do not re-research
- **Flicker** (`c:\Coding\Flicker\src\background\effectManager.ts`) has fully solved the ATTACHMENT position/coordOffset geometry for PATH items. Copy `getPathShaderGeometry` verbatim. The critical facts are documented in `c:\Coding\Flicker\progress.md` under "PATH Light Geometry — Solved (2026-04-20)".
- The formula handles all three OBR PATH regimes: freehand polygons (`parent.position = (0,0)`), primitive-derived paths (`parent.position = bounds.center`), and Trim-of-positioned-primitive (position differs from both). The general form is:
  ```
  effect.position  = bounds.center
  coordOffset.x    = halfW + 2*(parent.position.x - bounds.center.x) + SHAPE_BOUNDS_EXCESS
  coordOffset.y    = halfH + 2*(parent.position.y - bounds.center.y) + SHAPE_BOUNDS_EXCESS
  ```
- Flicker also confirms the formula works identically for SHAPE and CURVE items (see comment at `effectManager.ts:244`).
- **Murmur** (`c:\Coding\Murmur\src\emitter\useSoundZoneRing.ts`) already uses `clipper2-ts` (`inflatePaths`, `JoinType`, `EndType`). Copy the dependency version from `c:\Coding\Murmur\package.json` and use the same API.

### Architecture

**Feather mask approach: dynamic SKSL code generation with vertices baked as constants**

OBR's Uniform system accepts only `number | Vector2 | Vector3 | Matrix` — no arrays or textures. The solution is to generate the SKSL shader string dynamically per polygon item with the N vertex positions embedded as SKSL `const vec2` array constants. Each PATH/CURVE item gets its own shader string; the rest of the shader body (colour grading, dreamy/crisp, blend modes) is identical to the existing `getShaderCode()` — only `computeFeather()` is replaced.

**Polygon SDF in the shader**

Use the Inigo Quilez exact polygon SDF (negative inside, positive outside, magnitude = px distance to nearest edge):

```glsl
// N and poly[] are baked as constants in the generated shader string
float sdPolygon(vec2 p) {
    float d = dot(p - poly[0], p - poly[0]);
    float s = 1.0;
    for (int i = 0, j = N - 1; i < N; j = i, i++) {
        vec2 e = poly[j] - poly[i];
        vec2 w = p - poly[i];
        float t = clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
        d = min(d, dot(w - e * t, w - e * t));
        bvec3 c = bvec3(p.y >= poly[i].y, p.y < poly[j].y, e.x * w.y > e.y * w.x);
        if (all(c) || all(not(c))) s *= -1.0;
    }
    return s * sqrt(d);
}

float computeFeather(vec2 correctedCoord) {
    if (feather <= 0.0) return step(0.0, -sdPolygon(correctedCoord));
    float sdf = sdPolygon(correctedCoord);
    float depth = feather * max(polyInradius, 1.0);  // polyInradius also baked as const
    float fade = 1.0 - smoothstep(-depth, 0.0, sdf);
    return mix(fade, 1.0 - fade, invertFeather);
}
```

**Clipper2 roles (CPU side, runs once per geometry change):**

1. **Polygon cleaning**: `inflatePaths([verts], 0, JoinType.Miter, EndType.Polygon)` normalises winding and removes self-intersections. Required because OBR freehand-drawn paths can be dirty. Guarantees the SDF winding test is correct.
2. **Inradius computation**: Binary-search with `inflatePaths([verts], -r, ...)` to find the maximum inset distance before the polygon degenerates (empty result). This value (`polyInradius`) normalises the feather control: `feather=1.0` means the fade zone covers the full interior from boundary to incircle centre. Without it, feather behaviour is inconsistent across small vs large polygon hosts.

**Vertex limit: 24 (post-simplification)**

OBR freehand paths can have hundreds of vertices. Before the Clipper2 pass, reduce to ≤ 24 using Douglas-Peucker (`simplify-js` is already available transitively — check `node_modules` before adding as an explicit dep). If not available, implement a simple Ramer-Douglas-Peucker pass (20–30 lines). For CURVE items (Catmull-Rom splines), tessellate each spline span to ~8 line segments first, then simplify.

**Vertex coordinate space**

The polygon SDF runs in the shader's `correctedCoord` space (i.e. `coord + coordOffset`). All vertices extracted from the item must be transformed to this space before being baked into the shader. The transform is:

```
correctedV.x = vertex_world.x - bounds.center.x + coordOffset.x
correctedV.y = vertex_world.y - bounds.center.y + coordOffset.y
```

This follows from the Flicker geometry: for PATH ATTACHMENT effects `coord = world - parent.position` approximately, and `correctedCoord = coord + coordOffset`.

### Implementation phases

**Phase 0 — Dependency**
Add `clipper2-ts` to `package.json`. Copy version from `c:\Coding\Murmur\package.json`.

**Phase 1 — `src/background/polygonGeometry.ts` (new file, pure functions)**

```typescript
// Extract world-space vertices from an OBR PATH item's commands array.
// OBR command format: [type, x, y] where type 0=MoveTo, 1=LineTo, 5=Close.
function extractPathVertices(commands: number[][]): Vector2[]

// Catmull-Rom tessellation for CURVE items (~8 segments per span).
// item.points is the array of control points; item.tension is the spline tension.
function tessellatePathCurve(points: Vector2[], tension: number): Vector2[]

// 1. Clipper2 offset=0 pass to clean winding/self-intersections.
// 2. simplify-js Douglas-Peucker to reduce to ≤ maxVerts.
function cleanAndSimplify(verts: Vector2[], maxVerts: number): Vector2[]

// Binary search: max R such that inflatePaths(verts, -R, ...) is non-empty.
// Falls back to 0 for degenerate polygons.
function computeInradius(verts: Vector2[]): number

// Transform world-space vertices to shader correctedCoord space.
function worldVertsToShaderLocal(
  verts: Vector2[],
  boundsCenter: Vector2,
  coordOffset: Vector2,
): Vector2[]
```

**Phase 2 — `src/shared/shader.ts` additions**

```typescript
export const SHAPE_TYPE_POLYGON = 4;

export interface PolygonShaderData {
  vertices: Vector2[];   // in shader correctedCoord space, max 24
  inradius: number;      // px, for feather normalisation
}

// Returns a complete SKSL shader string with vertices and inradius baked as
// constants, and computeFeather() replaced with the polygon SDF version.
// All other shader behaviour (colour grading, dreamy, blend modes) is identical
// to getShaderCode(). Do not change getShaderCode() — it stays as-is for IMAGE
// and SHAPE hosts.
export function getPolygonShaderCode(poly: PolygonShaderData): string
```

The `shapeType`, `shapeSize`, and `itemSize` uniforms can be omitted from the polygon shader (they are only used by `computeFeather`, which is replaced). All other uniforms remain.

**Phase 3 — `src/background/effectManager.ts` changes**

3a. Add `isPath` import from OBR SDK. Use `item.type === "CURVE"` for CURVE detection (no `isCurve` guard exists in the OBR SDK — confirmed by Flicker's context menu code which uses string comparison).

3b. In `getShaderGeometry`: add PATH/CURVE branch before the IMAGE fallback, using the Flicker formula above. Return type needs a `boundsCenter` field added so the caller can compute vertex transforms.

3c. In `buildAuroraEffect`: for PATH/CURVE items, set `effect.position(bounds.center)` rather than `parent.position`. **This is the key change from the existing IMAGE/SHAPE path** — all other items use `parent.position`. Compute `polyData` (extract, clean, inradius, transform vertices), then set `effect.sksl = getPolygonShaderCode(polyData)`.

3d. In `effectSnapshot`: for PATH/CURVE items, include a geometry fingerprint in the snapshot so that edits to the drawn polygon trigger an effect rebuild:
```typescript
const commandsFingerprint = isPath(item)
  ? JSON.stringify(item.commands)
  : item.type === "CURVE" ? JSON.stringify((item as any).points) : "";
```
Add `commandsFingerprint` to the JSON.stringify array in `effectSnapshot`.

**Phase 4 — `src/main.ts` (UI)**

4a. Extend the item filter to include PATH and CURVE items alongside IMAGE and SHAPE.

4b. In the thumbnail rendering block: add a `"POLY"` thumbType case. A small SVG built from the first few polygon vertices works well — the existing SHAPE thumbnail code already renders SVG polygons at lines ~437–443 and can be reused/adapted.

4c. No new controls. Feather, invert feather, saturation, lightness, hue, opacity, dreamy all work without change. The polygon SDF handles feathering natively.

**Phase 5 — Tests**

Add `src/background/polygonGeometry.test.ts`:
- `cleanAndSimplify`: round-trip on a clean 4-vertex square returns 4 vertices with correct winding.
- `computeInradius`: unit square (side 2, vertices at ±1) returns inradius ≈ 1.0 (within 5%).
- `worldVertsToShaderLocal`: a vertex at `boundsCenter` produces `coordOffset` exactly.

Extend `src/shared/shader.test.ts`:
- Add one snapshot test for `getPolygonShaderCode` with a simple triangle (3 vertices) to catch regressions in the code generator.

### Open questions — verify before or during implementation

1. **SKSL constant array syntax** — *RESOLVED 2026-05-25: rejected*. Empirical test in OBR returned SkSL errors: `construction of array type 'vec2[3]' is not supported` and `initializers are not permitted on arrays (or structs containing arrays)`. Skia's SkSL allows array *declarations* but forbids both the `T[N](...)` constructor and any inline array initializer. **Decision**: use the fallback as the primary path — the shader generator emits N individual `const vec2 p0 = vec2(...); ... const vec2 pN-1 = vec2(...);` declarations and a fully unrolled SDF body (one edge-block per emitted vertex pair, no `for` loop, no array indexing). At N_max=24 the unrolled SDF adds ~150 lines to the generated shader source; well within budget.

2. **CURVE item structure** — *RESOLVED 2026-05-25*. Verified against `node_modules/@owlbear-rodeo/sdk/lib/types/items/Curve.d.ts`:
   - `item.points: Vector2[]` — control points, top-level on the Curve.
   - `item.style.tension: number` — **nested under `style`**, not top-level. Brief had this wrong.
   - `item.style.closed?: boolean` — also under `style`, **optional**. Absent ⇒ open curve.
   - `item.type: "CURVE"`; type guard `isCurve(item)` exported from the same module.
   - PATH (verified same time): `item.commands: PathCommand[]`, `item.fillRule: string`; `type: "PATH"`, type guard `isPath`. Brief's command schema was correct.

   **Implications for tessellation**:
   - Only `style.closed === true` curves are polygon-hostable; open curves have no enclosed area and should be rejected at the host-validation step with a user-visible "curve must be closed" notification.
   - `style.tension > 0` requires spline evaluation (Catmull–Rom or similar) to produce the true rendered boundary; `tension === 0` ⇒ use control points as polygon vertices directly. Decide max samples-per-segment in phase 2 (suggest 8 for tension < 1, scale up for sharper tension).
   - Path `fillRule` (`"nonzero"` vs `"evenodd"`) governs interior tests for self-intersecting paths. Clipper2's cleaning step normalises to a single fill rule, so we can ignore the source `fillRule` post-cleaning.

3. **Clipper2 inradius search cost** — *RESOLVED 2026-05-25: revised approach*. Micro-benchmark (`scripts/bench-inradius.js`, Node 24, `clipper2-js@1.2.4`) measured the actual cost at ~12 ms for N=24 polygons (super-linear scaling: 1 ms at N=8, 5 ms at N=16, 12 ms at N=24, 44 ms at N=48). Brief's <2 ms estimate was ~6× optimistic. Two fast approximations were also evaluated against Clipper2 ground truth:
   - **Cauchy `2 × Area / Perimeter`**: 0.0002 ms, but 1–21% off on convex polygons and 30–72% off on concave — unsafe as a drop-in.
   - **Centroid-to-nearest-edge**: 0.0003 ms, 6–15% off convex / 30–60% off concave — also unsafe.
   - SDF grid sampling at 16×16: ~0.05 ms but still 8–20%+ error.

   **Decision**: **cache the exact Clipper2 inradius**, do not compute per-frame. Inradius only changes when polygon vertices change (item creation, manual reshape) — a rare event. Slider drags don't move vertices, so cached lookup is free on every render. Implementation:
   - Key the cache by a hash of the vertex list (FNV-1a or similar over flattened `[x0,y0,x1,y1,...]`).
   - Store cached value in item metadata (`dev.aurora.cachedInradius`) keyed by vertex-hash; falls back to recompute if hash mismatches.
   - One-time ~12 ms hit on geometry change is barely perceptible and unblocks all subsequent frames.

   **Reject** the Cauchy fallback path from the original brief — error magnitudes confirm it would produce visibly wrong feathering. Clipper2 remains required for polygon cleaning regardless, so keeping it on the dependency list costs nothing extra. **Promote `clipper2-js` from devDependency to dependency** during phase 1 implementation (currently installed as dev for this benchmark).

4. **PATH command coordinate frame** — *RESOLVED 2026-05-25 from docs, no live test needed*. Confirmed in `c:\Coding\owlbear-rodeo-extensions-SKILL-patterns.md`:
   - **Freehand PATH**: `item.position = (0,0)`, commands in world space.
   - **Primitive-derived PATH**: `item.position = bounds.center` (or elsewhere), commands in local space relative to `item.position`.
   - **CURVE**: always world-space coords with `item.position = (0,0)` (same convention as freehand PATH); no primitive-derived regime exists.

   **Key simplification vs. brief**: the doc provides a ready-made `transformPoint(p, position, rotation, scale)` helper (no canvas context required) and a `flattenPathToPolyline(commands, position, rotation, scale)` function that subdivides Béziers to ~10px tolerance and returns world-space vertices directly. Because `transformPoint` translates by `position` (zero for freehand → no-op), **the same code path handles both regimes** — there is no need for branching in `worldVertsToShaderLocal`. Copy both helpers from the skill doc verbatim. Flicker's `getPathShaderGeometry` formula (for the shader-local `coordOffset`) is still required separately; the two helpers operate at different stages (world-space vertex extraction vs. shader-local position offset).

   **Caught while resolving**: skill doc has an inconsistency — types section shows `PathCommand` as object-form (`{type: "M", x, y}`) but the `flattenPathToPolyline` helper takes tuple-form `number[][]`. The **SDK source (`Path.d.ts`) confirms tuple-form is correct** (`[Command.MOVE, x, y]` with a `Command` enum). Use the tuple form; report the skill doc bug separately.

### Scope estimate
~330 lines net new code across 3 modified files and 2 new files. All changes are additive — existing IMAGE and SHAPE host paths are untouched.

### Implementation Status (2026-05-25 — Phases 0–4 complete)

All five phases implemented across one session:
- **P0:** `clipper2-js@^1.2.4` promoted from devDependency to runtime dependency in `package.json`.
- **P1:** `src/background/polygonGeometry.ts` (Clipper2-backed: `cleanAndSimplify`, `computeInradius`) and `src/background/polygonExtract.ts` (pure helpers: `extractPathVertices`, `tessellatePathCurve`, `worldVertsToShaderLocal`, `hashVertices`). 13 unit tests in `polygonGeometry.test.ts`.
- **P2:** `getPolygonShaderCode`, `getPolygonShaderUniforms`, `POLYGON_MAX_VERTICES=24`, `SHAPE_TYPE_POLYGON=4`, `PolygonShaderData` in `src/shared/shader.ts`. Unrolled SDF (one `const vec2 pK` per vertex, N unrolled edge blocks — no array initializers, per Q1). 12 shader tests + triangle snapshot.
- **P3:** `effectManager.ts` — `isPolygonHost` helper, `getPolygonShaderGeometry` (Flicker formula + cached inradius), polygon branch in `buildAuroraEffect` (effect.position = bounds.center, scale = (1,1)), geometry fingerprint in `effectSnapshot`, inradius cache keyed by `hashVertices(shaderLocalVerts)` cleared with snapshotCache. `buildAuroraEffect` return type widened to `Effect | null`; reconcile filters nulls.
- **P4:** `main.ts` POLY thumbtype with inline-SVG polygon (cheap polyline, no Clipper); `createAuroraMenu.ts` onClick validates closed-curve requirement and shows a WARNING notification for rejected open curves.
- **Module split:** `polygonExtract.ts` (pure) vs `polygonGeometry.ts` (Clipper2) — keeps popover bundle at 13 KB instead of pulling in the 70 KB Clipper chunk. Bundle audit confirms: popover loads `polygonExtract-*.js  1.93 kB`; background still ships full Clipper (77 KB / gzip 22 KB).

All gates green: 101/101 tests, `npm run build` clean. Aurora version remains 0.9.2 — bump to 0.9.3 happens at the start of the verification session once functionality is confirmed in-app.

### Outstanding — to verify before tagging 0.9.3
- [ ] **Browser smoke pass (GM)**: draw a freehand polygon on MAP layer → context-menu "Add Aurora" → effect renders inside polygon only (no rectangular bleed past polygon edges) → adjust feather slider → fade respects polygon boundary → Invert Feather flips correctly. Use `/run` skill or in-app testing.
- [ ] **Closed CURVE smoke pass**: drawing-tool closed curve → Add Aurora → renders correctly with tessellated boundary.
- [ ] **Open CURVE rejection**: open curve → Add Aurora → no metadata applied + WARNING notification shown.
- [ ] **Geometry fingerprint correctness**: reshape an active polygon host → effect rebuilds (verify by adjusting feather and confirming new boundary).
- [ ] **Cold-cache inradius cost**: first reconcile after adding polygon Aurora should show one ~12 ms blip per new polygon; subsequent reconciles should be free (cache hit).
- [ ] **Rotated PATH/CURVE behaviour**: rotate a polygon host with active Aurora — known limitation: shader-local verts are baked in world frame minus bounds.center, while effect.rotation = parent.rotation. At rotation=0 (common case) this is exact; at other rotations there will be a visible angular offset between the rendered shape and the feather boundary. If visible, refine `worldVertsToShaderLocal` to also inverse-rotate by parent.rotation (small change — multiply by R^-1 around bounds.center before applying coordOffset).
- [ ] **Visual fidelity vs. CURVE tension**: cardinal-spline tessellation in `tessellatePathCurve` uses tension/2 as the cardinal `s` parameter — verify against OBR's actual curve rendering. If the tessellated polygon visibly diverges from the rendered curve, adjust the basis formulas in `polygonExtract.ts:158-180`.
- [ ] **README + What's New**: add PATH/CURVE polygon hosts to README features section, draft a "What's New 0.9.3" entry in `src/changelog.ts`.
- [ ] **Help-page CSP fix - code fixed & committed 2026-11-07; two external checks remain**: `scripts/build-help.js` now emits the help page's behaviour as `public/help.js` (referenced via `<script src="help.js" defer>`) instead of an inline `<script>` block, so it survives the `_headers` CSP's `script-src 'self'` (no `unsafe-inline`) instead of being silently blocked — aurora has a blocking CSP and this bug was live in production. Open `dist/help.html` in a browser and confirm the code-block Copy buttons work, the sidebar scroll-spy highlights the current section while scrolling, and the mobile sidebar toggle opens/closes. This proves the extraction preserved behaviour — it structurally CANNOT prove the CSP fix itself, since `_headers` is applied by Cloudflare Pages only; that half is only observable on the deployed page.

---

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

- 2026-04-30 23:30 -- SESSION START: final commit — add public/images/ and scripts/, rebuild, version tag, announcement
- 2026-04-30 23:34 -- SESSION END: committed all session 3 changes, tagged v0.9.2, pushed to origin/main

- 2026-05-25 15:02 -- SESSION START: Research PATH/CURVE polygon host support for Aurora; write implementation brief
- 2026-05-25 15:02 -- SESSION END: Implementation brief written to progress.md (Feature: PATH/CURVE Polygon Host Support section); no code changes

- 2026-05-25 -- SESSION START: final v0.9.2 commit, serif font fix, dreamy/crisp analysis
- 2026-05-25 -- SESSION END: v0.9.2 shipped; serif font fixed; correction analysis in CLAUDE.md; pack up

- 2026-05-25 -- SESSION START: resolve four open questions for PATH/CURVE polygon host brief
- 2026-05-25 -- SESSION END: Q1–Q4 all resolved (SkSL array-init rejected → unrolled-const path; Curve fields verified; Clipper2 ~12ms not <2ms → cache by vertex-hash; PATH coordinate frame solved by skill doc helpers). Skill doc PathCommand fixed (object→tuple form, added CONIC, added fillRule on Path root). bench-inradius.js kept. clipper2-js installed as devDependency, promote to dependency in phase 1.

- 2026-05-25 16:27 -- SESSION START: PATH/CURVE polygon host — Phase 1 implementation (polygonGeometry.ts)

- 2026-05-25 17:30 -- SESSION END: PATH/CURVE polygon host Phases 0–4 complete (deps, polygon geometry + extract split, polygon shader, effectManager wiring, popover/menu UI). 101/101 tests pass; build clean. Browser verification + 0.9.3 version bump deferred to next session — see Outstanding list in Feature section.

- 2026-05-25 18:00 -- SESSION START: PATH/CURVE polygon host — outstanding verification + 0.9.3 prep

- 2026-07-15 11:10 -- SESSION START: triage working tree; stage & push ready work (times recovered from session transcript)

- 2026-07-15 11:22 -- SESSION END: split into three commits (polygon host v0.9.3 feature; What's New font fix; ignore-rule housekeeping, untrack Claude.md + track progress.md); tested and pushed to origin/main.

- 2026-08-13 16:22 -- SESSION START: evaluate + execute metadata namespace change to best-practice reverse-domain (times recovered from session transcript)

- 2026-08-13 17:49 -- SESSION END: migrated PLUGIN_BASE to com.several-record.aurora (v0.9.4) with auto-migration from the two legacy URL namespaces; retired com.aurora-vtt.aurora era; retro-tagged v0.9.3 + tagged v0.9.4; fixed manifest version-injection (dead generateBundle -> closeBundle, matching Forms); wrote portfolio-audit prompt for the dead-generateBundle pattern. Pushed to origin/main.

- 2026-11-07 12:34 -- SESSION START: pack up; verify the staged help-page CSP fix (times recovered from session transcript)

- 2026-11-07 12:45 -- SESSION END: verified + committed the help-page CSP fix (inline <script> -> gitignored public/help.js via build-help.js; <script src defer>); build green, 104 tests, help.js 2467B = portfolio standard; pushed. Outstanding: human browser check + deployed-CSP confirmation (CF-only). NB log gap: the CORS 'any origin' (2872f22) and store.md (15b4baf) commits were made in a different session, so their times are not in this transcript.

