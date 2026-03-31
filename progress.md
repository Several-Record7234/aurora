# Aurora — Progress

## Current State (v0.9.2, last updated 2026-03-31)

- GPU shader colour grading on POST_PROCESS layer working
- Controls: saturation, lightness, hue, opacity
- Preset system: 4 built-in + 2 user-customizable slots
- Gradient effects, feather, invert
- **Crisp ← → Dreamy slider**: negative = unsharp mask (crisp), positive = bloom (dreamy)
- **Adaptive bloom threshold**: CPU luminance histogram (top 20% percentile), area-weighted by world-space bounds, computed per-shader on menu open — confirmed working
- Per-shader overlap detection via `getItemBounds` — multiple Aurora shaders in one scene each get an independent threshold
- **Shader colour-space fix**: blur is desaturated to match `graded` before bloom/unsharp operations, eliminating colour bleed at low saturation and chroma over-amplification at high unsharp values
- Scene items list, GM-only controls
- Soft undo on remove
- Help section with Discord link
- Vitest test suite: 66 tests, 6 snapshots, pre-commit hook
- Codebase review (2026-03-01): 17 of 28 recommendations completed
- Menu popover fits all controls without a scrollbar

## Recent History

- **2026-03-31:** Added Crisp ← → Dreamy slider (bloom/unsharp mask). CPU-side luminance histogram for adaptive bloom threshold, area-weighted by world-space bounds, using `getItemBounds` for per-shader spatial overlap detection. Shader colour-space fix: desaturate blur to match graded signal, eliminating colour bleed and unsharp over-saturation. Menu vertical compaction to fit without scrollbar.
- **2026-03-16:** Added Vitest test suite (66 tests, 6 snapshots) covering presets, type guards, shader uniforms, and metadata keys. Pre-commit hook blocks commits on test failure.
- Merge conflict resolved in index.html
- README media pass (PNGs, GIFs, MOV)
- Info/help link correction
- Codebase review acted on (17/28 items done)

## Open Questions

- 11 remaining codebase review recommendations — prioritise or defer?
- POST_PROCESS layer interaction with other extensions (shared concern with faro)
- Golden Hour preset `d` value — needs empirical testing on real maps before setting non-zero
- Vitest snapshots need updating (`npx vitest run -u`) after bloomThreshold added as 13th shader uniform

## Next Steps

- [ ] Remove all `// DEBUG:` console.log statements before release
- [ ] Run `npx vitest run -u` to update snapshots (bloomThreshold is now 13th uniform)
- [ ] Triage remaining 11 review recommendations
- [ ] Decide whether v0.9.2 → v1.0.0 promotion is warranted
- [ ] Distinguish clearly from aurora.old (archived predecessor)
- [ ] Consider adding visual regression screenshots per preset (manual checklist or automated)
