# Aurora — Owlbear Rodeo Extension

Time-of-day lighting via GPU shader (SkSL colour grading) on the POST_PROCESS layer. Controls for saturation, lightness, hue, and opacity with a preset system.

## Project Inception

- **Intent**: Time-of-day lighting for VTT maps via GPU colour grading, so GMs can shift scene mood (dawn, dusk, night, storm) without swapping map images
- **Constraints**: Must use POST_PROCESS layer (only layer that applies shader effects scene-wide); no React (performance-sensitive shader path); must coexist with other POST_PROCESS extensions
- **Acceptance**: GM adjusts sliders → scene colour grading updates in real time for all players → presets save/load per scene → no visible performance degradation
- **Decomposition**: Single-agent, single phase — core functionality complete at v0.9.2. Remaining: 11 codebase review items to triage, 1.0 readiness assessment.

## Shared OBR extension skill

Available at `../owlbear-rodeo-extensions-SKILL.md`

## Security & Resilience Rules

- Always validate metadata values on READ, not just on WRITE — external sources can inject unexpected data
- All `parseInt()` / `parseFloat()` results must be checked with `isNaN()` before use
- String values from external sources (metadata, URL params) must be length-bounded on read
- Every `OBR.onReady()` entry point must have a timeout fallback with a user-visible error message
- Never store secrets, API keys, or tokens in frontend source — use environment variables and server-side proxies
- All user-facing errors must show a notification — never fail silently for operations the user initiated
- Set Content-Security-Policy headers on all deployed sites, even those running in iframes
- Preset/config validators must reject or sanitize, never pass through unvalidated data to shaders or DOM
- Test the "first load after idle" path — cold starts and SDK initialization failures are real user scenarios

## Project-Specific Constraints

- No React or Tailwind — minimal vanilla TS for performance (shader-heavy workload)
- SkSL shaders for colour grading (not standard GLSL — OBR uses Skia's shading language)
- POST_PROCESS layer usage means potential interaction with other extensions on the same layer (e.g. dynamic-fog-plus)
- Preset system: 4 built-in + 2 user-customizable slots stored in scene metadata
