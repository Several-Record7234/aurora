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
 *   saturation:    0–200  → 0.0–2.0   (multiplier; 1.0 = no change)
 *   lightness:     0–200  → 0.0–2.0   (multiplier; 1.0 = no change)
 *   hue:          -180–180 → -0.5–0.5 (divided by 360 so fract() gives 0–1 HSV hue)
 *   opacity:       0–100  → 0.0–1.0   (tint blend strength; 0 = no tint)
 *   blendMode:     0–3    → 0.0–3.0   (index into blend mode switch)
 *   coordOffset:   vec2               (pixel offset to correct for shape stroke bounds)
 *   feather:       0–100  → 0.0–1.0   (fraction of half-size for edge fade zone)
 *   invertFeather: bool   → 0.0|1.0   (0 = fade edges, 1 = fade centre)
 *   itemSize:      vec2               (attachment bounds size in local coords)
 *   shapeSize:     vec2               (actual shape visual size; differs from itemSize for hex/tri)
 *   shapeType:      0–3    → 0.0–3.0   (0=rect/image, 1=circle, 2=triangle, 3=hexagon)
 *   dreamy:        -100–100 → -1.0–1.0 (negative = unsharp/crisp, zero = pass-through, positive = bloom)
 *   bloomThreshold: 0–1    → direct    (80th-percentile luma from CPU histogram; default 0.7)
 */

/** Shape type indices for the shapeType uniform */
export const SHAPE_TYPE_RECT = 0;
export const SHAPE_TYPE_CIRCLE = 1;
export const SHAPE_TYPE_TRIANGLE = 2;
export const SHAPE_TYPE_HEXAGON = 3;
export const SHAPE_TYPE_POLYGON = 4;

/** Maximum vertex count for polygon host shaders (post-simplification). */
export const POLYGON_MAX_VERTICES = 32;

export interface ShaderGeometry {
  coordOffset: { x: number; y: number };
  itemSize: { x: number; y: number };
  shapeSize: { x: number; y: number };
  shapeType: number;
}

const DEFAULT_GEOMETRY: ShaderGeometry = {
  coordOffset: { x: 0, y: 0 },
  itemSize: { x: 1, y: 1 },
  shapeSize: { x: 1, y: 1 },
  shapeType: SHAPE_TYPE_RECT,
};

export function getShaderUniforms(
  config: AuroraConfig,
  geometry: ShaderGeometry = DEFAULT_GEOMETRY,
  bloomThreshold: number = 0.7,
) {
  return [
    { name: "saturation", value: config.s / 100.0 },
    { name: "lightness", value: config.l / 100.0 },
    { name: "hue", value: config.h / 360.0 },
    { name: "opacity", value: config.o / 100.0 },
    { name: "blendMode", value: (config.b ?? 0) * 1.0 },
    { name: "coordOffset", value: geometry.coordOffset },
    { name: "feather", value: (config.f ?? 0) / 100.0 },
    { name: "invertFeather", value: (config.fi ?? false) ? 1.0 : 0.0 },
    { name: "itemSize", value: geometry.itemSize },
    { name: "shapeSize", value: geometry.shapeSize },
    { name: "shapeType", value: geometry.shapeType * 1.0 },
    { name: "dreamy", value: (config.d ?? 0) / 100.0 },
    { name: "bloomThreshold", value: bloomThreshold },
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
 *   7. Apply Dreamy/Crisp effect (bloom or unsharp mask via neighbour sampling; skipped at zero)
 *   8. Apply feather mask (fade edges or centre based on invert flag)
 *   9. Output: mix between original scene and graded result via fade
 *
 * This means Saturation and Lightness always take full effect regardless
 * of the Opacity slider. Opacity exclusively controls the strength of the
 * Hue tint overlay. When Opacity is 0 the tint is invisible, and when
 * Saturation and Lightness are both at 100% the effect is a pure pass-through.
 *
 * BLEND MODES:
 *   0 = Multiply   — darkens; good for shadows and night
 *   1 = Overlay    — contrast boost; darkens darks, lightens lights
 *   2 = Soft Light — subtle contrast; natural-looking tints
 *   3 = Color      — applies tint hue/saturation, preserves scene luminosity
 *
 * FEATHER:
 *   feather (0–1) controls the depth of the fade zone as a fraction of the
 *   shape's half-size. invertFeather flips the direction:
 *     0 = normal:  full effect at centre, fades to transparent at edges
 *     1 = inverted: transparent at centre, full effect at edges
 *   The fade shape matches the item geometry (rectangular for rects/images,
 *   elliptical for circles, triangular SDF for triangles, hexagonal SDF
 *   for hexagons).
 *
 * SHAPE TYPES:
 *   0 = Rectangle / Image — rectangular distance-to-edge
 *   1 = Circle / Ellipse  — elliptical distance-to-edge
 *   2 = Triangle           — isoceles triangle SDF (incircle-centred)
 *   3 = Hexagon            — pointy-top hex SDF (proper edge distance)
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
    uniform float feather;
    uniform float invertFeather;
    uniform vec2 itemSize;
    uniform vec2 shapeSize;
    uniform float shapeType;
    uniform float dreamy;
    uniform float bloomThreshold;

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

    vec3 blendColor(vec3 base, vec3 blend) {
      // "Color" blend: take hue and saturation from the tint,
      // but preserve the luminosity (V channel) of the base.
      vec3 blendHSV = rgb2hsv(blend);
      vec3 baseHSV = rgb2hsv(base);
      return hsv2rgb(vec3(blendHSV.x, blendHSV.y, baseHSV.z));
    }

    // ── Feather mask ──
    // Returns 0.0–1.0 representing how much of the effect to apply.
    // When invertFeather is 0: 1 at centre, fades to 0 at edges.
    // When invertFeather is 1: 0 at centre, fades to 1 at edges.
    //
    // correctedCoord originates near the top-left of the attachment for all
    // shape types. Subtracting halfSize converts it to centre-relative space
    // where (0,0) is the geometric centre of the item.

    float computeFeather(vec2 correctedCoord) {
      if (feather <= 0.0) return 1.0;

      vec2 halfSize = itemSize * 0.5;

      // Convert to centre-relative coordinates.
      // correctedCoord originates near the top-left of the attachment for all
      // shape types; subtracting halfSize shifts the origin to the geometric centre.
      vec2 centreRel = correctedCoord - halfSize;

      // Shape type selectors (branchless via step ranges)
      float isCircle   = step(0.5, shapeType) * step(shapeType, 1.5);  // type 1
      float isTriangle = step(1.5, shapeType) * step(shapeType, 2.5);  // type 2
      float isHexagon  = step(2.5, shapeType) * step(shapeType, 3.5);  // type 3

      // Normalised position: 0 at centre, 1 at edge
      float edgeNorm;

      // Circle/ellipse: elliptical distance from centre
      vec2 ellipseNorm2 = centreRel / halfSize;
      float ellipseNorm = length(ellipseNorm2);

      // Rectangle and others: rectangular distance (nearest edge)
      vec2 distFromEdge = halfSize - abs(centreRel);
      float minHalf = min(halfSize.x, halfSize.y);
      float rectNorm = 1.0 - min(distFromEdge.x, distFromEdge.y) / minHalf;

      // Triangle (isoceles, apex at top-centre of bounding box)
      // Normalised by shapeSize (the actual item.width × item.height,
      // excluding bounds excess and stroke padding) so the SDF matches
      // the visible triangle geometry.
      // tp.x is abs'd to exploit left/right symmetry; tp.y keeps sign since
      // the triangle is asymmetric vertically (apex at top, base at bottom).
      // Signed distance to each edge (positive = inside the triangle):
      //   base:   1 - y
      //   slant:  (-2|x| + y + 1) / √5   (inward normal of the slanted edge)
      // Normalised by the inradius (√5 - 1)/2 ≈ 0.618 so that 0 = incircle
      // centre (equidistant from all edges) and 1 = on the edge.
      vec2 triHalf = shapeSize * 0.5;
      vec2 tp = vec2(abs(centreRel.x) / triHalf.x, centreRel.y / triHalf.y);
      float s5 = sqrt(5.0);
      float triBase  = 1.0 - tp.y;
      float triSlant = (-2.0 * tp.x + tp.y + 1.0) / s5;
      float triNorm  = 1.0 - min(triBase, triSlant) * 2.0 / (s5 - 1.0);

      // Hexagon (pointy-top, regular): OBR draws a regular hex inscribed
      // in a circle of circumradius r, with only the top and bottom vertices
      // touching the bounding box. shapeSize carries the hex's actual visual
      // dimensions (2×inradius, 2×circumradius) computed from item.width/height,
      // excluding the bounds excess/stroke padding that inflates itemSize.
      vec2 hexHalf = shapeSize * 0.5;
      vec2 hp = abs(centreRel) / hexHalf;
      float hexNorm = max(hp.x, 0.5 * hp.x + hp.y);

      edgeNorm = mix(rectNorm, ellipseNorm, isCircle);
      edgeNorm = mix(edgeNorm, triNorm, isTriangle);
      edgeNorm = mix(edgeNorm, hexNorm, isHexagon);

      // Feather zone: from (1 - feather) to 1
      // At edgeNorm <= (1 - feather): fade = 1 (full effect)
      // At edgeNorm >= 1: fade = 0 (no effect)
      float innerEdge = 1.0 - feather;
      float fade = 1.0 - smoothstep(innerEdge, 1.0, edgeNorm);

      // Invert: flip the fade direction
      fade = mix(fade, 1.0 - fade, invertFeather);

      return fade;
    }

    // ── Dreamy / Crisp blur kernel ──
    // Samples 16 screen-space neighbours in an evenly-spaced ring at radius R.
    // Used for both bloom (dreamy > 0) and unsharp mask (dreamy < 0).
    // Only called when dreamy != 0 — the if-guard in main prevents any
    // extra scene.eval() calls when the slider is at its centre position.

    vec3 computeBlur(vec2 uv) {
      const float R = 2.0;
      vec3 acc = vec3(0.0);
      acc += scene.eval(uv + vec2( 0.000,  1.000) * R).rgb;
      acc += scene.eval(uv + vec2( 0.383,  0.924) * R).rgb;
      acc += scene.eval(uv + vec2( 0.707,  0.707) * R).rgb;
      acc += scene.eval(uv + vec2( 0.924,  0.383) * R).rgb;
      acc += scene.eval(uv + vec2( 1.000,  0.000) * R).rgb;
      acc += scene.eval(uv + vec2( 0.924, -0.383) * R).rgb;
      acc += scene.eval(uv + vec2( 0.707, -0.707) * R).rgb;
      acc += scene.eval(uv + vec2( 0.383, -0.924) * R).rgb;
      acc += scene.eval(uv + vec2( 0.000, -1.000) * R).rgb;
      acc += scene.eval(uv + vec2(-0.383, -0.924) * R).rgb;
      acc += scene.eval(uv + vec2(-0.707, -0.707) * R).rgb;
      acc += scene.eval(uv + vec2(-0.924, -0.383) * R).rgb;
      acc += scene.eval(uv + vec2(-1.000,  0.000) * R).rgb;
      acc += scene.eval(uv + vec2(-0.924,  0.383) * R).rgb;
      acc += scene.eval(uv + vec2(-0.707,  0.707) * R).rgb;
      acc += scene.eval(uv + vec2(-0.383,  0.924) * R).rgb;
      return acc / 16.0;
    }

    half4 main(vec2 coord) {
      // Corrected coordinate: shifts the origin to match the actual
      // item bounds (compensates for shape-specific origin offsets)
      vec2 corrected = coord + coordOffset;

      // Transform to screen-space pixels for scene sampling
      vec2 uv = (vec3(corrected, 1) * modelView).xy;
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
      //   0 = Multiply, 1 = Overlay, 2 = Soft Light, 3 = Color
      vec3 blended = blendMultiply(adjusted, tint);
      blended = mix(blended, blendOverlay(adjusted, tint),   step(0.5, blendMode) * step(blendMode, 1.5));
      blended = mix(blended, blendSoftLight(adjusted, tint), step(1.5, blendMode) * step(blendMode, 2.5));
      blended = mix(blended, blendColor(adjusted, tint),     step(2.5, blendMode));

      vec3 graded = mix(adjusted, blended, opacity);

      // ── 4. Dreamy / Crisp (blur-based; skipped entirely when dreamy == 0) ──
      // dreamy uniform range: -1.0 (full crisp) to +1.0 (full dreamy)
      if (dreamy != 0.0) {
        vec3 blurred = computeBlur(uv);

        // computeBlur samples scene.eval() — the raw scene — not the post-HSLO
        // signal. Apply the same saturation and lightness transforms that were
        // applied to graded so both sides of the bloom/unsharp arithmetic stay
        // in the same colour space.
        // Without saturation: low-saturation scenes bleed colour into bloom/unsharp.
        // Without lightness: darkened scenes (l<100) get disproportionate bloom
        // (blurred is brighter than graded) and excessive unsharp darkening
        // (graded-blurred is more negative than expected).
        float blurLuma = dot(blurred, vec3(0.2126, 0.7152, 0.0722));
        blurred = mix(vec3(blurLuma), blurred, saturation);
        blurred = clamp(blurred * lightness, 0.0, 1.0);

        if (dreamy > 0.0) {
          // Bloom path: extract bright regions of the blur and add back at
          // dreamy strength. Only pixels above the luminance threshold
          // contribute, giving a soft glow around bright scene areas.
          float luma = dot(blurred, vec3(0.2126, 0.7152, 0.0722));
          float brightMask = smoothstep(bloomThreshold, bloomThreshold + 0.15, luma);
          graded = clamp(graded + dreamy * brightMask * blurred, 0.0, 1.0);
        } else {
          // Unsharp mask path: dreamy is negative, so abs() gives the strength.
          // output = original + |strength| * (original - blurred)
          float strength = -dreamy;
          graded = clamp(graded + strength * (graded - blurred), 0.0, 1.0);
        }
      }

      // ── 5. Feather mask (uses corrected coord for proper origin) ──
      float fade = computeFeather(corrected);
      vec3 result = mix(color.rgb, graded, fade);

      // DEBUG: Uncomment to visualise the corrected coordinate space.
      // Red = x position (0 at left, 1 at right)
      // Green = y position (0 at top, 1 at bottom)
      // If the gradient fills the item evenly, coord correction is right.
      // vec2 dbg = corrected / itemSize;
      // return half4(half3(dbg.x, dbg.y, 0.0), 1.0);

      return half4(result, color.a);
    }
  `;
}

// ─── Polygon shader (PATH / CURVE hosts) ────────────────────────────────────

/**
 * Per-polygon shader inputs. Vertices are baked relative to bounds.center
 * (i.e. world - bounds.center). The shader evaluates the SDF at
 * `coord - polyCentre` where polyCentre = bounds.center - parent.position.
 * This compensates for OBR delivering `coord` in parent-local space
 * (= world - parent.position), so both freehand PATH/CURVE (parent at origin,
 * coord ~world scale) and primitive-derived items (parent at bounds.center,
 * coord ~local scale) end up evaluating against the same small-magnitude
 * vertex frame.
 */
export interface PolygonShaderData {
  /** Vertices in item-local frame, AABB-centred so |v| stays small for shader
   *  precision. At most POLYGON_MAX_VERTICES. */
  vertices: { x: number; y: number }[];
  /** Largest inscribed circle radius in pixels; used to normalise feather. */
  inradius: number;
  /** Distance the mask is grown past the polygon's edges so it contains the
   *  host's true outline (see maxOutsideDistance). 0 = mask is the polygon. */
  inflate: number;
  /** Item-local AABB centre. Subtracted from `coord` (also item-local) in the
   *  shader so the SDF eval point lands in the AABB-centred vert frame.
   *  Rotation-invariant — item-local doesn't change when parent rotates. */
  polyCentre: { x: number; y: number };
}

/** Format a JS number as a SkSL float literal with bounded precision. */
function flit(n: number): string {
  if (!Number.isFinite(n)) return "0.0";
  const s = n.toFixed(4);
  // SkSL float literals must contain a decimal point. `toFixed(4)` always does.
  return s;
}

/**
 * Emit the unrolled IQ exact-polygon SDF: N edge blocks, one per consecutive
 * vertex pair (j -> i) with j = (i - 1 + N) % N. SkSL forbids array
 * initializers (see progress.md Q1) so each vertex is a separate
 * `const vec2 pK` declaration and the loop is fully unrolled.
 *
 * The SDF returns: negative inside, positive outside, magnitude = pixel
 * distance to the nearest polygon edge.
 */
function emitPolygonSdf(verts: { x: number; y: number }[]): string {
  const n = verts.length;
  const consts: string[] = [];
  for (let i = 0; i < n; i++) {
    consts.push(
      `    const vec2 p${i} = vec2(${flit(verts[i].x)}, ${flit(verts[i].y)});`,
    );
  }

  const edgeBlocks: string[] = [];
  // First iteration of the IQ loop seeds d from p[0]; emit that separately.
  edgeBlocks.push(`      float d = dot(p - p0, p - p0);`);
  edgeBlocks.push(`      float s = 1.0;`);

  for (let i = 0; i < n; i++) {
    const j = (i - 1 + n) % n;
    edgeBlocks.push(`      {
        vec2 e = p${j} - p${i};
        vec2 w = p - p${i};
        float t = clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
        vec2 b = w - e * t;
        d = min(d, dot(b, b));
        bvec3 c = bvec3(p.y >= p${i}.y, p.y < p${j}.y, e.x * w.y > e.y * w.x);
        if (all(c) || all(not(c))) s = -s;
      }`);
  }

  return `${consts.join("\n")}

    float sdPolygon(vec2 p) {
${edgeBlocks.join("\n")}
      return s * sqrt(d);
    }`;
}

/**
 * Build a complete SkSL shader for a PATH/CURVE polygon host.
 *
 * Identical to getShaderCode() except:
 *   - shapeType, shapeSize, itemSize uniforms are dropped (computeFeather no
 *     longer needs them).
 *   - computeFeather is replaced with the polygon SDF version: even at
 *     feather=0 the polygon interior is hard-masked, so effect colour does
 *     not bleed outside the polygon into the rectangular ATTACHMENT bounds.
 *   - Polygon vertices and inradius are baked as SkSL constants (each vertex
 *     a separate `const vec2 pK` declaration; the SDF loop is unrolled).
 *
 * Do not call per-frame. Regenerate only when the host polygon changes;
 * the resulting string is the `sksl` field passed to buildEffect().
 */
export function getPolygonShaderCode(poly: PolygonShaderData): string {
  if (poly.vertices.length < 3) {
    throw new Error("getPolygonShaderCode requires at least 3 vertices");
  }
  if (poly.vertices.length > POLYGON_MAX_VERTICES) {
    throw new Error(
      `getPolygonShaderCode: ${poly.vertices.length} vertices exceeds max ${POLYGON_MAX_VERTICES}`,
    );
  }

  const sdfBlock = emitPolygonSdf(poly.vertices);
  const inflate = Math.max(poly.inflate, 0);
  const inradiusLit = flit(Math.max(poly.inradius, 0) + inflate);
  const inflateLit = flit(inflate);
  const polyCentreLit = `vec2(${flit(poly.polyCentre.x)}, ${flit(poly.polyCentre.y)})`;

  return `
    uniform shader scene;
    uniform mat3 modelView;
    uniform float saturation;
    uniform float lightness;
    uniform float hue;
    uniform float opacity;
    uniform float blendMode;
    uniform vec2 coordOffset;
    uniform float feather;
    uniform float invertFeather;
    uniform float dreamy;
    uniform float bloomThreshold;

    const float polyInradius = ${inradiusLit};
    const float polyInflate = ${inflateLit};
    const vec2 polyCentre = ${polyCentreLit};

${sdfBlock}

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

    vec3 blendMultiply(vec3 base, vec3 blend) {
      return base * blend;
    }

    vec3 blendOverlay(vec3 base, vec3 blend) {
      return mix(
        2.0 * base * blend,
        1.0 - 2.0 * (1.0 - base) * (1.0 - blend),
        step(0.5, base)
      );
    }

    vec3 blendSoftLight(vec3 base, vec3 blend) {
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

    vec3 blendColor(vec3 base, vec3 blend) {
      vec3 blendHSV = rgb2hsv(blend);
      vec3 baseHSV = rgb2hsv(base);
      return hsv2rgb(vec3(blendHSV.x, blendHSV.y, baseHSV.z));
    }

    // ── Polygon feather mask ──
    // Returns 0.0–1.0. At feather=0 the polygon interior is hard-masked so
    // the rectangular ATTACHMENT bounds do not bleed effect colour outside
    // the drawn polygon. At feather>0 the inward fade depth is normalised by
    // the polygon's inradius — feather=1 fills the entire interior.
    float computeFeather(vec2 localCoord) {
      // Subtracting polyInflate is an exact rounded offset of the polygon.
      float sdf = sdPolygon(localCoord) - polyInflate;
      float fade;
      if (feather <= 0.0) {
        fade = step(0.0, -sdf);
      } else {
        float depth = feather * max(polyInradius, 1.0);
        fade = 1.0 - smoothstep(-depth, 0.0, sdf);
      }
      return mix(fade, 1.0 - fade, invertFeather);
    }

    vec3 computeBlur(vec2 uv) {
      const float R = 2.0;
      vec3 acc = vec3(0.0);
      acc += scene.eval(uv + vec2( 0.000,  1.000) * R).rgb;
      acc += scene.eval(uv + vec2( 0.383,  0.924) * R).rgb;
      acc += scene.eval(uv + vec2( 0.707,  0.707) * R).rgb;
      acc += scene.eval(uv + vec2( 0.924,  0.383) * R).rgb;
      acc += scene.eval(uv + vec2( 1.000,  0.000) * R).rgb;
      acc += scene.eval(uv + vec2( 0.924, -0.383) * R).rgb;
      acc += scene.eval(uv + vec2( 0.707, -0.707) * R).rgb;
      acc += scene.eval(uv + vec2( 0.383, -0.924) * R).rgb;
      acc += scene.eval(uv + vec2( 0.000, -1.000) * R).rgb;
      acc += scene.eval(uv + vec2(-0.383, -0.924) * R).rgb;
      acc += scene.eval(uv + vec2(-0.707, -0.707) * R).rgb;
      acc += scene.eval(uv + vec2(-0.924, -0.383) * R).rgb;
      acc += scene.eval(uv + vec2(-1.000,  0.000) * R).rgb;
      acc += scene.eval(uv + vec2(-0.924,  0.383) * R).rgb;
      acc += scene.eval(uv + vec2(-0.707,  0.707) * R).rgb;
      acc += scene.eval(uv + vec2(-0.383,  0.924) * R).rgb;
      return acc / 16.0;
    }

    half4 main(vec2 coord) {
      vec2 corrected = coord + coordOffset;
      vec2 uv = (vec3(corrected, 1) * modelView).xy;
      half4 color = scene.eval(uv);

      vec3 hsv = rgb2hsv(color.rgb);
      hsv.y = clamp(hsv.y * saturation, 0.0, 1.0);
      hsv.z = clamp(hsv.z * lightness, 0.0, 1.0);
      vec3 adjusted = hsv2rgb(hsv);

      vec3 tint = hsv2rgb(vec3(fract(hue), 1.0, 1.0));

      vec3 blended = blendMultiply(adjusted, tint);
      blended = mix(blended, blendOverlay(adjusted, tint),   step(0.5, blendMode) * step(blendMode, 1.5));
      blended = mix(blended, blendSoftLight(adjusted, tint), step(1.5, blendMode) * step(blendMode, 2.5));
      blended = mix(blended, blendColor(adjusted, tint),     step(2.5, blendMode));

      vec3 graded = mix(adjusted, blended, opacity);

      if (dreamy != 0.0) {
        vec3 blurred = computeBlur(uv);
        float blurLuma = dot(blurred, vec3(0.2126, 0.7152, 0.0722));
        blurred = mix(vec3(blurLuma), blurred, saturation);
        blurred = clamp(blurred * lightness, 0.0, 1.0);

        if (dreamy > 0.0) {
          float luma = dot(blurred, vec3(0.2126, 0.7152, 0.0722));
          float brightMask = smoothstep(bloomThreshold, bloomThreshold + 0.15, luma);
          graded = clamp(graded + dreamy * brightMask * blurred, 0.0, 1.0);
        } else {
          float strength = -dreamy;
          graded = clamp(graded + strength * (graded - blurred), 0.0, 1.0);
        }
      }

      float fade = computeFeather(coord - polyCentre);
      vec3 result = mix(color.rgb, graded, fade);

      return half4(result, color.a);
    }
  `;
}

/**
 * Uniform builder for polygon-host shaders. Same as getShaderUniforms but
 * omits the three uniforms (shapeType, shapeSize, itemSize) the polygon
 * shader does not declare — passing them would cause a "no such uniform"
 * error from the OBR effect system.
 */
export function getPolygonShaderUniforms(
  config: AuroraConfig,
  coordOffset: { x: number; y: number },
  bloomThreshold: number = 0.7,
) {
  return [
    { name: "saturation", value: config.s / 100.0 },
    { name: "lightness", value: config.l / 100.0 },
    { name: "hue", value: config.h / 360.0 },
    { name: "opacity", value: config.o / 100.0 },
    { name: "blendMode", value: (config.b ?? 0) * 1.0 },
    { name: "coordOffset", value: coordOffset },
    { name: "feather", value: (config.f ?? 0) / 100.0 },
    { name: "invertFeather", value: (config.fi ?? false) ? 1.0 : 0.0 },
    { name: "dreamy", value: (config.d ?? 0) / 100.0 },
    { name: "bloomThreshold", value: bloomThreshold },
  ];
}
