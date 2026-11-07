/**
 * Aurora — pure polygon helpers (no Clipper2 dependency).
 *
 * Split out from polygonGeometry.ts so the action popover (main.ts) can
 * derive thumbnail vertices without dragging the ~70 KB Clipper2 chunk
 * into its bundle. polygonGeometry.ts re-exports these for callers that
 * also need the Clipper-backed helpers.
 *
 * Functions here are SDK-runtime-free (type-only imports) so the module is
 * testable in plain Node Vitest.
 */

import type { BoundingBox, Vector2, PathCommand } from "@owlbear-rodeo/sdk";

// PATH command type discriminators — values match the SDK's `Command` enum.
// Inlined to keep this module free of SDK runtime imports.
const CMD_MOVE = 0;
const CMD_LINE = 1;
const CMD_QUAD = 2;
const CMD_CONIC = 3;
const CMD_CUBIC = 4;
const CMD_CLOSE = 5;

/**
 * Flatten an OBR PATH command list to a polyline of item-local vertices.
 *
 * Crucially: vertices stay in the item's own coordinate frame — no rotation,
 * scale, or position is applied. OBR delivers the shader's `coord` parameter
 * in the same item-local frame (rotated parent-local IS item-local for an
 * attached effect), so leaving verts untransformed makes the SDF rotation-
 * invariant. Applying parent.rotation here would have the verts move under
 * rotation while `coord` did not, producing a huge mis-alignment as the
 * polygon's distance from world origin grows.
 *
 * Quadratic, conic and cubic Béziers are subdivided to ~10 px chord tolerance
 * (negligible at map scale). CLOSE commands are dropped; the polygon is
 * treated as implicitly closed by callers.
 */
export function extractPathVertices(commands: PathCommand[]): Vector2[] {
  const pts: Vector2[] = [];
  let cx = 0;
  let cy = 0;
  const T = (x: number, y: number) => ({ x, y });
  const TOL = 10;

  function subdivCubic(
    x0: number, y0: number,
    x1: number, y1: number,
    x2: number, y2: number,
    x3: number, y3: number,
    depth = 0,
  ): void {
    const dx = x3 - x0;
    const dy = y3 - y0;
    const d =
      Math.abs((x1 - x3) * dy - (y1 - y3) * dx) +
      Math.abs((x2 - x3) * dy - (y2 - y3) * dx);
    if (d < TOL || depth > 8) {
      pts.push(T(x3, y3));
      return;
    }
    const mx = (x0 + 3 * x1 + 3 * x2 + x3) / 8;
    const my = (y0 + 3 * y1 + 3 * y2 + y3) / 8;
    const l1x = (x0 + x1) / 2;
    const l1y = (y0 + y1) / 2;
    const l2x = (x0 + 2 * x1 + x2) / 4;
    const l2y = (y0 + 2 * y1 + y2) / 4;
    const r2x = (x1 + 2 * x2 + x3) / 4;
    const r2y = (y1 + 2 * y2 + y3) / 4;
    const r1x = (x2 + x3) / 2;
    const r1y = (y2 + y3) / 2;
    subdivCubic(x0, y0, l1x, l1y, l2x, l2y, mx, my, depth + 1);
    subdivCubic(mx, my, r2x, r2y, r1x, r1y, x3, y3, depth + 1);
  }

  for (const cmd of commands) {
    switch (cmd[0]) {
      case CMD_MOVE:
      case CMD_LINE: {
        cx = cmd[1];
        cy = cmd[2];
        pts.push(T(cx, cy));
        break;
      }
      case CMD_QUAD: {
        const [, qx, qy, ex, ey] = cmd;
        const c1x = cx + (2 / 3) * (qx - cx);
        const c1y = cy + (2 / 3) * (qy - cy);
        const c2x = ex + (2 / 3) * (qx - ex);
        const c2y = ey + (2 / 3) * (qy - ey);
        subdivCubic(cx, cy, c1x, c1y, c2x, c2y, ex, ey);
        cx = ex;
        cy = ey;
        break;
      }
      case CMD_CONIC: {
        const [, p1x, p1y, p2x, p2y, w] = cmd;
        const lambda = (2 * w) / (1 + w);
        const c1x = cx + lambda * (p1x - cx);
        const c1y = cy + lambda * (p1y - cy);
        const c2x = p2x + lambda * (p1x - p2x);
        const c2y = p2y + lambda * (p1y - p2y);
        subdivCubic(cx, cy, c1x, c1y, c2x, c2y, p2x, p2y);
        cx = p2x;
        cy = p2y;
        break;
      }
      case CMD_CUBIC: {
        const [, c1x, c1y, c2x, c2y, ex, ey] = cmd;
        subdivCubic(cx, cy, c1x, c1y, c2x, c2y, ex, ey);
        cx = ex;
        cy = ey;
        break;
      }
      case CMD_CLOSE:
        break;
    }
  }
  return pts;
}

const CURVE_SAMPLES_PER_SPAN = 8;

/**
 * Tessellate an OBR CURVE (cardinal spline) to a closed polygon of world-space
 * vertices. `tension === 0` => control points returned verbatim after the
 * item transform. `tension > 0` => evaluate a Catmull-Rom-style cardinal
 * spline with CURVE_SAMPLES_PER_SPAN interior samples per span.
 *
 * Callers must only invoke this for closed curves (style.closed === true);
 * open curves have no enclosed area.
 */
export function tessellatePathCurve(
  points: Vector2[],
  tension: number,
): Vector2[] {
  const n = points.length;
  if (n < 3) return [];

  if (tension <= 0) {
    return points.map((p) => ({ x: p.x, y: p.y }));
  }

  const s = 0.5 * tension;
  const out: Vector2[] = [];

  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];

    out.push({ x: p1.x, y: p1.y });
    for (let k = 1; k < CURVE_SAMPLES_PER_SPAN; k++) {
      const u = k / CURVE_SAMPLES_PER_SPAN;
      const u2 = u * u;
      const u3 = u2 * u;
      const b0 = -s * u3 + 2 * s * u2 - s * u;
      const b1 = (2 - s) * u3 + (s - 3) * u2 + 1;
      const b2 = (s - 2) * u3 + (3 - 2 * s) * u2 + s * u;
      const b3 = s * u3 - s * u2;
      out.push({
        x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x,
        y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y,
      });
    }
  }
  return out;
}

/**
 * Translate polygon vertices so their AABB is centred on the origin. Used to
 * keep shader vertex magnitudes small and precision tight for the SDF.
 *
 * Both input verts and the returned shader-local frame live in item-local
 * coords. The caller passes the verts' AABB centre (also item-local) as
 * polyCentre to the shader, which subtracts it from `coord` before SDF eval.
 * Because item-local is rotation-invariant, the whole pipeline now works
 * under any parent.rotation without needing a rotation matrix in the shader.
 */
export function recentre(
  verts: Vector2[],
  centre: Vector2,
): Vector2[] {
  return verts.map((v) => ({
    x: v.x - centre.x,
    y: v.y - centre.y,
  }));
}

/** Compute the item-local AABB centre of a vertex list. */
export function aabbCentre(verts: Vector2[]): Vector2 {
  if (verts.length === 0) return { x: 0, y: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of verts) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/**
 * 32-bit FNV-1a hash of a vertex list. Quantises to 0.1 px so cosmetic
 * floating-point jitter from item transforms does not invalidate the cache.
 * Returned as an unsigned 32-bit integer encoded as an 8-char hex string.
 */
export function hashVertices(verts: Vector2[]): string {
  let h = 0x811c9dc5;
  for (const v of verts) {
    const qx = Math.round(v.x * 10);
    const qy = Math.round(v.y * 10);
    h ^= qx & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (qx >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (qx >>> 16) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (qx >>> 24) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= qy & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (qy >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (qy >>> 16) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (qy >>> 24) & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Shader `coordOffset` that registers a PATH/CURVE host's `scene.eval()`
 * samples with the map beneath it. The effect must be positioned at the
 * world bounds centre.
 *
 *   coordOffset = bounds.halfSize + 2 * (item.position - bounds.center) + excess
 *
 * Flicker's empirical PATH formula (c:\Coding\Flicker\progress.md, "PATH
 * Light Geometry — Solved"). Confirmed for CURVE on canvas 2026-11-07: the
 * previous `bounds.center - item.position` sampled ~3x the shape's distance
 * from the world origin away, and this formula predicted the reported
 * displacement to within 46 units. Flicker fitted it with `item.position` near
 * (0,0); the `2 *` term was then confirmed on canvas by dragging a CURVE
 * several thousand units from where it was drawn, alongside a freehand PATH
 * and a trimmed/joined PATH (position != bounds centre). Rotation untested.
 */
export function polygonCoordOffset(
  bounds: Pick<BoundingBox, "min" | "max">,
  position: Vector2,
  excess: number,
): Vector2 {
  const centre = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
  };
  return {
    x: (bounds.max.x - bounds.min.x) / 2 + 2 * (position.x - centre.x) + excess,
    y: (bounds.max.y - bounds.min.y) / 2 + 2 * (position.y - centre.y) + excess,
  };
}
