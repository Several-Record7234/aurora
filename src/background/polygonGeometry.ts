/**
 * Aurora — Clipper2-backed polygon helpers for PATH/CURVE shader hosts.
 *
 * Cleans polygons (offset=0 pass for winding/self-intersections), simplifies
 * to a vertex budget via Ramer-Douglas-Peucker, and binary-searches the
 * inradius (largest inscribed circle radius) used to normalise feather.
 *
 * Inradius is ~12 ms at N=24 — DO NOT call per-frame. Cache results by a
 * vertex hash (see hashVertices). See progress.md Q3 resolution.
 *
 * Pure (Clipper-free) helpers — extractPathVertices, tessellatePathCurve,
 * worldVertsToShaderLocal, hashVertices — live in polygonExtract.ts and are
 * re-exported here for convenience. The split keeps Clipper2 (~70 KB) out of
 * the popover bundle, which only needs the pure extraction helpers.
 */

import type { Vector2 } from "@owlbear-rodeo/sdk";
import {
  Clipper,
  Point64,
  type Path64,
  JoinType,
  EndType,
  FillRule,
} from "clipper2-js";

export {
  extractPathVertices,
  tessellatePathCurve,
  recentre,
  aabbCentre,
  hashVertices,
  polygonCoordOffset,
} from "./polygonExtract";

// Clipper2 operates on int64 coords; multiply floats by SCALE on input and
// divide on output. 1000 gives sub-pixel precision at map scale and stays
// well within int64 bounds.
const CLIPPER_SCALE = 1000;

/** Signed shoelace area in Path64 units. Positive ⇒ CCW in math convention
 *  (Y-up); negative ⇒ CW. Used to normalise winding for the IQ polygon SDF,
 *  which returns negative inside only when given CCW vertices in its own
 *  coordinate frame. The shader runs in OBR screen-space (Y-down), so the
 *  required convention there is the opposite: negative signed area in
 *  Path64 (Y-down) coords ⇒ inside returns negative from sdPolygon. */
function path64SignedArea(path: Path64): number {
  let a = 0;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    a += (path[j].x + path[i].x) * (path[j].y - path[i].y);
  }
  return a / 2;
}

function vertsToPath64(verts: Vector2[]): Path64 {
  return verts.map(
    (v) =>
      new Point64(
        Math.round(v.x * CLIPPER_SCALE),
        Math.round(v.y * CLIPPER_SCALE),
      ),
  );
}

function path64ToVerts(path: Path64): Vector2[] {
  return path.map((p) => ({
    x: p.x / CLIPPER_SCALE,
    y: p.y / CLIPPER_SCALE,
  }));
}

/**
 * Clean polygon winding/self-intersections and reduce vertex count to
 * `maxVerts` via Ramer-Douglas-Peucker.
 *
 * 1. `Clipper.InflatePaths` with delta = 0 normalises winding and removes
 *    self-intersections. Required: OBR freehand strokes can be dirty.
 * 2. If still over budget, run RDP with progressively larger epsilon until
 *    the vertex count fits (or 20 iterations elapse — safety bound).
 *
 * Returns the original vertices on Clipper degenerate result, so callers
 * never get an empty polygon from a non-degenerate input.
 */
export interface SimplifyResult {
  /** Cleaned, simplified, winding-normalised vertices. Always ≤ maxVerts. */
  vertices: Vector2[];
  /** Number of distinct closed rings Clipper2 produced from the input.
   *  > 1 means the input self-intersected and only the largest ring was kept. */
  rings: number;
}

export function cleanAndSimplify(
  verts: Vector2[],
  maxVerts: number,
): SimplifyResult {
  if (verts.length < 3) return { vertices: verts.slice(), rings: 0 };

  const subject = vertsToPath64(verts);

  // Ring count via Union(EvenOdd) — InflatePaths with delta=0 always collapses
  // to a single ring (largest lobe), so it can't tell us the input self-
  // intersected. Union(EvenOdd) splits a self-intersecting input into its
  // constituent simple polygons, exposing the rings count for the caller to
  // surface a "polygon self-intersects" warning. Used for detection only —
  // InflatePaths still does the actual cleaning below (Union emits duplicate
  // adjacent points that we'd then have to strip).
  const unionPaths = Clipper.Union([subject], [], FillRule.EvenOdd);
  const rings = unionPaths?.length ?? 0;

  let working: Path64 = subject;
  const cleanedPaths = Clipper.InflatePaths(
    [subject],
    0,
    JoinType.Miter,
    EndType.Polygon,
  );
  if (cleanedPaths && cleanedPaths.length > 0) {
    let best = cleanedPaths[0];
    let bestArea = Math.abs(Clipper.area(best));
    for (let i = 1; i < cleanedPaths.length; i++) {
      const a = Math.abs(Clipper.area(cleanedPaths[i]));
      if (a > bestArea) {
        best = cleanedPaths[i];
        bestArea = a;
      }
    }
    if (best.length >= 3) working = best;
  }

  if (working.length <= maxVerts) {
    return { vertices: path64ToVerts(normaliseWinding(working)), rings };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of working) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const diam = Math.hypot(maxX - minX, maxY - minY) || CLIPPER_SCALE;
  let eps = diam * 0.001;

  let current: Path64 = working;
  for (let iter = 0; iter < 30 && current.length > maxVerts; iter++) {
    const next = Clipper.ramerDouglasPeucker(current, eps);
    if (next && next.length >= 3) current = next;
    eps *= 1.6;
  }

  // Hard guarantee: if RDP can't satisfy the budget (e.g. a near-circular spline
  // where every vertex is meaningful), uniformly decimate the working polygon.
  // The shader gate at POLYGON_MAX_VERTICES is non-negotiable; visual fidelity
  // at this point is a soft preference.
  if (current.length > maxVerts) {
    const decimated: Path64 = [];
    const stride = current.length / maxVerts;
    for (let i = 0; i < maxVerts; i++) {
      decimated.push(current[Math.floor(i * stride)]);
    }
    current = decimated;
  }

  if (current.length < 3) current = working;
  return { vertices: path64ToVerts(normaliseWinding(current)), rings };
}

/** Force a known winding so the IQ polygon SDF in shader.ts returns negative
 *  inside. Empirically the SDF expects positive signed area in the same
 *  coordinate frame the vertices live in (OBR screen-space, Y-down). Reverse
 *  if sign is wrong. */
function normaliseWinding(path: Path64): Path64 {
  if (path.length < 3) return path;
  if (path64SignedArea(path) < 0) {
    return path.slice().reverse();
  }
  return path;
}

/**
 * Compute the maximum inset distance `R` such that inflate(-R) still produces
 * a non-empty polygon. This is the largest inscribed-circle radius and is
 * used to normalise the feather control so its behaviour is independent of
 * polygon scale.
 *
 * Cost is ~12 ms at N=24 — DO NOT call per-frame. Cache by a vertex-hash
 * (see progress.md Q3 resolution).
 *
 * Returns 0 for degenerate (zero-area) polygons.
 */
export function computeInradius(verts: Vector2[]): number {
  if (verts.length < 3) return 0;
  const path = vertsToPath64(verts);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of path) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const halfSpan = Math.max(maxX - minX, maxY - minY) / 2;
  if (halfSpan <= 0) return 0;

  let lo = 0;
  let hi = halfSpan;
  const tol = CLIPPER_SCALE * 0.001;
  for (let i = 0; i < 50 && hi - lo > tol; i++) {
    const mid = (lo + hi) / 2;
    const result = Clipper.InflatePaths(
      [path],
      -mid,
      JoinType.Round,
      EndType.Polygon,
    );
    let area = 0;
    if (result) {
      for (const ring of result) area += Math.abs(Clipper.area(ring));
    }
    if (area > 0) lo = mid;
    else hi = mid;
  }
  return lo / CLIPPER_SCALE;
}
