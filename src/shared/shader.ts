/**
 * Aurora – SkSL shader source and uniform helpers.
 *
 * Contains the colour-grading shader that runs as a POST_PROCESS
 * ATTACHMENT effect on MAP-layer items, plus a helper to convert the
 * UI-facing HSLO values into the uniform float array the shader expects.
 *
 * PROCESSING PIPELINE (see getShaderCode for full detail):
 *   1. Sample the scene pixel at the correct screen-space coordinate
 *   2. Adjust saturation (HSV S channel multiplier)
 *   3. Adjust lightness  (HSV V channel multiplier)
 *   4. Generate a flat tint from the Hue slider value
 *   5. Blend the tint at Opacity strength
 *   6. Output with original alpha preserved
 */

import type { HSLOValues } from "./types";

/**
 * Build the uniform array from HSLO values.
 *
 * UNIFORM MAPPING:
 *   saturation: 0–200 → 0.0–2.0  (multiplier; 1.0 = no change)
 *   lightness:  0–200 → 0.0–2.0  (multiplier; 1.0 = no change)
 *   hue:       -180–180 → -0.5–0.5  (divided by 360 so fract() gives 0–1 HSV hue)
 *   opacity:    0–100 → 0.0–1.0  (tint blend strength; 0 = no tint)
 */
export function getShaderUniforms(values: HSLOValues) {
  return [
    { name: "saturation", value: values.s / 100.0 },
    { name: "lightness", value: values.l / 100.0 },
    { name: "hue", value: values.h / 360.0 },
    { name: "opacity", value: values.o / 100.0 },
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
 *   5. Blend the tint over the adjusted pixel at Opacity strength
 *   6. Output with original alpha (opacity does NOT fade the whole effect)
 *
 * This means Saturation and Lightness always take full effect regardless
 * of the Opacity slider. Opacity exclusively controls the strength of the
 * Hue tint overlay. When Opacity is 0 the tint is invisible, and when
 * Saturation and Lightness are both at 100% the effect is a pure pass-through.
 *
 * COORDINATE NOTES (see also effectManager.ts):
 *   - Uses `modelView` (not `view`) for ATTACHMENT effects — combines the
 *     item's model transform with the viewport transform in one matrix.
 *   - Multiplication is row-vector × matrix (Skia row-major convention).
 */
export function getShaderCode(): string {
  return `
    uniform shader scene;
    uniform mat3 modelView;
    uniform float saturation;
    uniform float lightness;
    uniform float hue;
    uniform float opacity;

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

    half4 main(vec2 coord) {
      // Transform from item-local coords to screen-space pixels
      vec2 uv = (vec3(coord, 1) * modelView).xy;
      half4 color = scene.eval(uv);

      // ── 1. Saturation adjustment (full strength) ──
      vec3 hsv = rgb2hsv(color.rgb);
      hsv.y = clamp(hsv.y * saturation, 0.0, 1.0);

      // ── 2. Lightness adjustment (full strength) ──
      hsv.z = clamp(hsv.z * lightness, 0.0, 1.0);

      vec3 adjusted = hsv2rgb(hsv);

      // ── 3. Hue tint overlay (blended at opacity strength) ──
      // Generate a fully saturated, fully bright colour from the hue angle.
      // fract() wraps the -0.5..0.5 range into 0..1 for the HSV colour wheel.
      // Slider 0° → red, 60° → yellow, 120° → green, 180° → cyan, etc.
      vec3 tint = hsv2rgb(vec3(fract(hue), 1.0, 1.0));
      vec3 final = mix(adjusted, tint, opacity);

      return half4(final, color.a);
    }
  `;
}
