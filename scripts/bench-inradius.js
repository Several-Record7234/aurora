// Micro-benchmark for Clipper2 inradius binary search.
// Validates the assumption in progress.md Q3 that ~15 iterations of inward
// offsetting on a 24-vertex polygon completes in well under 2ms.

import { Clipper, Point64, JoinType, EndType } from "clipper2-js";

// Clipper2 uses int64 coords; scale floats by SCALE before, divide after.
const SCALE = 1000;

function makePolygon(n, radius, mode = "mild") {
  // mode: "regular"  — perfect inscribed n-gon
  //       "mild"     — ±15% radius (typical freehand)
  //       "moderate" — ±30% radius (irregular but no concavities)
  //       "wild"     — ±60% radius (star-shaped, deeply concave)
  const amp = { regular: 0, mild: 0.15, moderate: 0.30, wild: 0.60 }[mode];
  const pts = [];
  for (let i = 0; i < n; i++) {
    const theta = (i / n) * Math.PI * 2;
    const r = radius * (1 + amp * Math.sin(i * 2.7));
    pts.push(new Point64(
      Math.round(Math.cos(theta) * r * SCALE),
      Math.round(Math.sin(theta) * r * SCALE),
    ));
  }
  return pts;
}

function offsetArea(path, delta) {
  // delta is in scaled (int) units. Negative delta = inward offset.
  const solution = Clipper.InflatePaths([path], delta, JoinType.Round, EndType.Polygon);
  if (!solution || solution.length === 0) return 0;
  let total = 0;
  for (const p of solution) total += Math.abs(Clipper.area(p));
  return total;
}

function inradiusBinarySearch(path, maxRadiusWorld) {
  let lo = 0;
  let hi = maxRadiusWorld;
  const tol = 0.001;
  let iters = 0;
  while (hi - lo > tol) {
    const mid = (lo + hi) / 2;
    const area = offsetArea(path, -mid * SCALE);
    if (area > 0) lo = mid;
    else hi = mid;
    iters++;
    if (iters > 50) break;
  }
  return { inradius: lo, iters };
}

function cauchyApprox(path) {
  let area = 0;
  let perim = 0;
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    area += a.x * b.y - b.x * a.y;
    perim += Math.hypot(b.x - a.x, b.y - a.y);
  }
  area = Math.abs(area) / 2;
  return (2 * area) / perim / SCALE;
}

function centroid(path) {
  let cx = 0, cy = 0;
  for (const p of path) { cx += p.x; cy += p.y; }
  return { x: cx / path.length, y: cy / path.length };
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  const qx = ax + t * dx, qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

function pointInPolygon(px, py, path) {
  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const xi = path[i].x, yi = path[i].y;
    const xj = path[j].x, yj = path[j].y;
    const intersect = ((yi > py) !== (yj > py))
      && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function centroidToEdge(path) {
  // O(N): inradius approx = min distance from centroid to any edge segment.
  // Exact for convex polygons whose centroid is the incircle centre.
  const c = centroid(path);
  let minDist = Infinity;
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    const d = distToSegment(c.x, c.y, a.x, a.y, b.x, b.y);
    if (d < minDist) minDist = d;
  }
  return minDist / SCALE;
}

function sdfGridMax(path, gridN = 16) {
  // O(K^2 * N): sample the unsigned distance field on a regular grid over the
  // polygon's bounding box; return the max distance among interior samples.
  // Approximates the largest inscribed circle (any centre, not just centroid).
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of path) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const stepX = (maxX - minX) / gridN;
  const stepY = (maxY - minY) / gridN;
  let best = 0;
  for (let gy = 0; gy < gridN; gy++) {
    for (let gx = 0; gx < gridN; gx++) {
      const px = minX + (gx + 0.5) * stepX;
      const py = minY + (gy + 0.5) * stepY;
      if (!pointInPolygon(px, py, path)) continue;
      let minDist = Infinity;
      for (let i = 0; i < path.length; i++) {
        const a = path[i];
        const b = path[(i + 1) % path.length];
        const d = distToSegment(px, py, a.x, a.y, b.x, b.y);
        if (d < minDist) minDist = d;
      }
      if (minDist > best) best = minDist;
    }
  }
  return best / SCALE;
}

function timeFn(fn, runs = 1000) {
  for (let i = 0; i < 10; i++) fn();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < runs; i++) fn();
  const t1 = process.hrtime.bigint();
  return Number(t1 - t0) / 1e6 / runs;
}

function bench(label, n, mode) {
  const poly = makePolygon(n, 10, mode);

  // Reference: Clipper2 binary search (we treat this as ground truth)
  for (let i = 0; i < 3; i++) inradiusBinarySearch(poly, 10);
  const t0 = process.hrtime.bigint();
  const RUNS_CLIPPER = 20;
  let exactResult;
  for (let i = 0; i < RUNS_CLIPPER; i++) exactResult = inradiusBinarySearch(poly, 10);
  const exactMs = Number(process.hrtime.bigint() - t0) / 1e6 / RUNS_CLIPPER;
  const exact = exactResult.inradius;

  const cauchy = cauchyApprox(poly);
  const c2e   = centroidToEdge(poly);
  const sdf8  = sdfGridMax(poly, 8);
  const sdf16 = sdfGridMax(poly, 16);
  const sdf32 = sdfGridMax(poly, 32);

  const tCauchy = timeFn(() => cauchyApprox(poly));
  const tC2e    = timeFn(() => centroidToEdge(poly));
  const tSdf8   = timeFn(() => sdfGridMax(poly, 8),  200);
  const tSdf16  = timeFn(() => sdfGridMax(poly, 16), 200);
  const tSdf32  = timeFn(() => sdfGridMax(poly, 32), 100);

  const errPct = (v) => (((v - exact) / exact) * 100).toFixed(1).padStart(6);

  console.log(`\n${label} (N=${n}, ${mode}) — exact=${exact.toFixed(2)} in ${exactMs.toFixed(2)}ms`);
  console.log(`  cauchy   = ${cauchy.toFixed(2).padStart(5)}  err=${errPct(cauchy)}%  time=${tCauchy.toFixed(4)}ms`);
  console.log(`  c2edge   = ${c2e.toFixed(2).padStart(5)}    err=${errPct(c2e)}%  time=${tC2e.toFixed(4)}ms`);
  console.log(`  sdf-8    = ${sdf8.toFixed(2).padStart(5)}    err=${errPct(sdf8)}%  time=${tSdf8.toFixed(4)}ms`);
  console.log(`  sdf-16   = ${sdf16.toFixed(2).padStart(5)}    err=${errPct(sdf16)}%  time=${tSdf16.toFixed(4)}ms`);
  console.log(`  sdf-32   = ${sdf32.toFixed(2).padStart(5)}    err=${errPct(sdf32)}%  time=${tSdf32.toFixed(4)}ms`);
}

console.log("Clipper2 inradius binary-search benchmark");
console.log("Realistic mix of polygon shapes and sizes");
console.log("=========================================");
bench("triangle",       3,  "regular");
bench("8-gon mild",     8,  "mild");
bench("16-gon mild",    16, "mild");
bench("16-gon moderate",16, "moderate");
bench("24-gon mild",    24, "mild");
bench("24-gon moderate",24, "moderate");
bench("24-gon wild",    24, "wild");
bench("48-gon mild",    48, "mild");
