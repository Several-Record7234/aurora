# Aurora — Progress

## Current State (v0.9.2, last updated 2026-03-16)

- GPU shader colour grading on POST_PROCESS layer working
- Controls: saturation, lightness, hue, opacity
- Preset system: 4 built-in + 2 user-customizable slots
- Gradient effects, feather, invert
- Scene items list, GM-only controls
- Soft undo on remove
- Help section with Discord link
- Vitest test suite: 66 tests, 6 snapshots, pre-commit hook
- Codebase review (2026-03-01): 17 of 28 recommendations completed

## Recent History

- **2026-03-16:** Added Vitest test suite (66 tests, 6 snapshots) covering presets, type guards, shader uniforms, and metadata keys. Pre-commit hook blocks commits on test failure.
- Merge conflict resolved in index.html
- README media pass (PNGs, GIFs, MOV)
- Info/help link correction
- Codebase review acted on (17/28 items done)

## Open Questions

- 11 remaining codebase review recommendations — prioritise or defer?
- POST_PROCESS layer interaction with other extensions (shared concern with faro)

## Next Steps

- [ ] Triage remaining 11 review recommendations
- [ ] Decide whether v0.9.2 → v1.0.0 promotion is warranted
- [ ] Distinguish clearly from aurora.old (archived predecessor)
- [ ] Consider adding visual regression screenshots per preset (manual checklist or automated)
