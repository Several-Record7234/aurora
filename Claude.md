# Aurora — Owlbear Rodeo Extension

Time-of-day lighting via GPU shader (SkSL colour grading) on the POST_PROCESS layer. Controls for saturation, lightness, hue, and opacity with a preset system.

## Project Inception

- **Intent**: Time-of-day lighting for VTT maps via GPU colour grading, so GMs can shift scene mood (dawn, dusk, night, storm) without swapping map images
- **Constraints**: Must use POST_PROCESS layer (only layer that applies shader effects scene-wide); no React (performance-sensitive shader path); must coexist with other POST_PROCESS extensions
- **Acceptance**: GM adjusts sliders → scene colour grading updates in real time for all players → presets save/load per scene → no visible performance degradation
- **Decomposition**: Single-agent, single phase — core functionality complete at v0.9.2. Remaining: 11 codebase review items to triage, 1.0 readiness assessment.

## Shared OBR extension skill

Available at `../owlbear-rodeo-extensions-SKILL.md`

## Project-Specific Constraints

- No React or Tailwind — minimal vanilla TS for performance (shader-heavy workload)
- SkSL shaders for colour grading (not standard GLSL — OBR uses Skia's shading language)
- POST_PROCESS layer usage means potential interaction with other extensions on the same layer (e.g. dynamic-fog-plus)
- Preset system: 4 built-in + 2 user-customizable slots stored in scene metadata
