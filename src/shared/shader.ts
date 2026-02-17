/**
 * Aurora – SkSL shader source and uniform helpers.
 *
 * Contains the colour-grading shader that runs as a POST_PROCESS
 * ATTACHMENT effect on MAP-layer items, plus a helper to convert the
 * UI-facing config values into the uniform float array the shader expects.
 *
 * PROCESSING PIPELINE (see getShaderCode for full detail):
 *   1. Sample the scene pixel at the correct screen-space coordinate
 *      (applying coordOffset to compensate for stroke-based bounds on shapes)
 *   2. Adjust saturation (HSV S channel multiplier)
 *   3. Adjust lightness  (HSV V channel multiplier)
 *   4. Generate a flat tint from the Hue slider value
 *   5. Blend the tint using the selected blend mode at Opacity strength
 *   6. Output with original alpha preserved
 */

import type { AuroraConfig } from "./types";

/**
 * Build the uniform array from Aurora config values.
 *
 * UNIFORM MAPPING:
 *   saturation:  0–200  → 0.0–2.0   (multiplier; 1.0 = no change)
 *   lightness:   0–200  → 0.0–2.0   (multiplier; 1.0 = no change)
 *   hue:        -180–180 → -0.5–0.5 (divided by 360 so fract() gives 0–1 HSV hue)
 *   opacity:     0–100  → 0.0–1.0   (tint blend strength; 0 = no tint)
 *   blendMode:   0–4    → 0.0–4.0   (index into blend mode switch)
 *   coordOffset: vec2                (pixel offset to correct for shape stroke bounds)
 */
export function getShaderUniforms(config: AuroraConfig, coordOffset: { x: number; y: number } = { x: 0, y: 0 }) {
  return [
    { name: "saturation", value: config.s / 100.0 },
    { name: "lightness", value: config.l / 100.0 },
    { name: "hue", value: config.h / 360.0 },
    { name: "opacity", value: config.o / 100.0 },
    { name: "blendMode", value: (config.b ?? 0) * 1.0 },
    { name: "coordOffset", value: coordOffset },
  ];
}

/**
 * SkSL shader source for Aurora colour grading.
 *
 * PROCESSING PIPELINE:
 *   1. Sample the scene pixel at the correct screen-space coordinate
 *   2. Adjust SATURATION at full strength (multiplier in HSV space)
 *   3. Adjust LIGHTNESS at full strength (multiplier in HSV space)
 *   4. Generate a flat tint colour from the Hue slider value
 *   5. Blend the tint over the adjusted pixel using the selected blend mode
 *   6. Mix the blended result at Opacity strength
 *   7. Output with original alpha (opacity does NOT fade the whole effect)
 *
 * This means Saturation and Lightness always take full effect regardless
 * of the Opacity slider. Opacity exclusively controls the strength of the
 * Hue tint overlay. When Opacity is 0 the tint is invisible, and when
 * Saturation and Lightness are both at 100% the effect is a pure pass-through.
 *
 * BLEND MODES:
 *   0 = Normal    — flat replacement (original behaviour)
 *   1 = Multiply  — darkens; good for shadows and night
 *   2 = Screen    — lightens; good for glows and ethereal effects
 *   3 = Overlay   — contrast boost; darkens darks, lightens lights
 *   4 = Soft Light — subtle contrast; natural-looking tints
 *
 * COORDINATE NOTES (see also effectManager.ts):
 *   - Uses `modelView` (not `view`) for ATTACHMENT effects — combines the
 *     item's model transform with the viewport transform in one matrix.
 *   - Multiplication is row-vector × matrix (Skia row-major convention).
 *   - coordOffset compensates for shapes whose ATTACHMENT bounds include
 *     stroke width, shifting the effect's local origin relative to the
 *     scene content beneath.
 */
export function getShaderCode(): string {
  return `
    uniform shader scene;
    uniform mat3 modelView;
    uniform float saturation;
    uniform float lightness;
    uniform float hue;
    uniform float opacity;
    uniform float blendMode;
    uniform vec2 coordOffset;

    vec3 rgb2hsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
    }

    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    // ── Blend mode functions ──
    // Each takes the adjusted scene colour (base) and the tint colour (blend)

    vec3 blendMultiply(vec3 base, vec3 blend) {
      return base * blend;
    }

    vec3 blendScreen(vec3 base, vec3 blend) {
      return 1.0 - (1.0 - base) * (1.0 - blend);
    }

    vec3 blendOverlay(vec3 base, vec3 blend) {
      return mix(
        2.0 * base * blend,
        1.0 - 2.0 * (1.0 - base) * (1.0 - blend),
        step(0.5, base)
      );
    }

    vec3 blendSoftLight(vec3 base, vec3 blend) {
      // W3C compositing formula for Soft Light
      vec3 d = mix(
        sqrt(base),
        ((16.0 * base - 12.0) * base + 4.0) * base,
        step(0.25, base)
      );
      return mix(
        base - (1.0 - 2.0 * blend) * base * (1.0 - base),
        base + (2.0 * blend - 1.0) * (d - base),
        step(0.5, blend)
      );
    }

    half4 main(vec2 coord) {
      // Apply coordinate offset to compensate for shape stroke bounds,
      // then transform from item-local coords to screen-space pixels
      vec2 uv = (vec3(coord + coordOffset, 1) * modelView).xy;
      half4 color = scene.eval(uv);

      // ── 1. Saturation adjustment (full strength) ──
      vec3 hsv = rgb2hsv(color.rgb);
      hsv.y = clamp(hsv.y * saturation, 0.0, 1.0);

      // ── 2. Lightness adjustment (full strength) ──
      hsv.z = clamp(hsv.z * lightness, 0.0, 1.0);

      vec3 adjusted = hsv2rgb(hsv);

      // ── 3. Hue tint with blend mode (blended at opacity strength) ──
      vec3 tint = hsv2rgb(vec3(fract(hue), 1.0, 1.0));

      // Select blend mode (using step comparisons since SkSL int uniforms
      // can be unreliable; float comparison is robust across GPU backends)
      vec3 blended = tint; // mode 0: Normal (flat replacement)
      blended = mix(blended, blendMultiply(adjusted, tint),  step(0.5, blendMode) * step(blendMode, 1.5));
      blended = mix(blended, blendScreen(adjusted, tint),    step(1.5, blendMode) * step(blendMode, 2.5));
      blended = mix(blended, blendOverlay(adjusted, tint),   step(2.5, blendMode) * step(blendMode, 3.5));
      blended = mix(blended, blendSoftLight(adjusted, tint), step(3.5, blendMode));

      vec3 final = mix(adjusted, blended, opacity);

      return half4(final, color.a);
    }
  `;
}
