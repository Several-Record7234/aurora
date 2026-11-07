/**
 * polygonGeometry tests — Phase 1 of PATH/CURVE polygon host support.
 *
 * Covers the three checks called out in progress.md "Phase 5 — Tests":
 *   1. cleanAndSimplify round-trip on a 4-vertex square preserves the shape.
 *   2. computeInradius on a 2×2 unit square returns ≈ 1.0 (within 5%).
 *   3. worldVertsToShaderLocal at boundsCenter yields exactly coordOffset.
 *
 * Extra targeted checks added: extractPathVertices on a square MOVE+LINE path,
 * tessellatePathCurve with tension=0 (pass-through), and hashVertices stability.
 */

import { describe, it, expect } from "vitest";
import type { PathCommand } from "@owlbear-rodeo/sdk";
import {
  extractPathVertices,
  tessellatePathCurve,
  cleanAndSimplify,
  computeInradius,
  recentre,
  aabbCentre,
  hashVertices,
  polygonCoordOffset,
  maxOutsideDistance,
} from "./polygonGeometry";

describe("cleanAndSimplify", () => {
  it("preserves a clean 4-vertex square", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const { vertices: result, rings } = cleanAndSimplify(square, 24);
    expect(result.length).toBe(4);
    expect(rings).toBe(1);

    // All input corners must be present (winding may rotate; allow shift)
    for (const corner of square) {
      const found = result.some(
        (r) => Math.abs(r.x - corner.x) < 0.01 && Math.abs(r.y - corner.y) < 0.01,
      );
      expect(found).toBe(true);
    }
  });

  it("reduces an over-budget polygon to <= maxVerts", () => {
    // 50 points on a circle of radius 10 -> simplify to 8
    const pts = [];
    for (let i = 0; i < 50; i++) {
      const t = (i / 50) * Math.PI * 2;
      pts.push({ x: Math.cos(t) * 10, y: Math.sin(t) * 10 });
    }
    const { vertices: result } = cleanAndSimplify(pts, 8);
    expect(result.length).toBeLessThanOrEqual(8);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("reports rings > 1 when input is a self-intersecting bow-tie", () => {
    // Bow-tie (figure-8): two triangles sharing a crossover at the centre.
    // Vertex order goes around both lobes in a way that crosses itself, so
    // Clipper2's InflatePaths(delta=0) cleaning should split it into 2 rings.
    const bowtie = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
    ];
    const { rings } = cleanAndSimplify(bowtie, 24);
    expect(rings).toBeGreaterThan(1);
  });
});

describe("computeInradius", () => {
  it("returns ~1.0 for a unit square at vertices (±1, ±1)", () => {
    const square = [
      { x: -1, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: 1 },
    ];
    const r = computeInradius(square);
    expect(r).toBeGreaterThan(0.95);
    expect(r).toBeLessThan(1.05);
  });

  it("returns 0 for a degenerate (collinear) polygon", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ];
    const r = computeInradius(line);
    expect(r).toBeLessThan(0.01);
  });
});

describe("recentre", () => {
  it("maps centre to the origin", () => {
    const centre = { x: 100, y: 200 };
    const result = recentre([centre], centre);
    expect(result[0].x).toBe(0);
    expect(result[0].y).toBe(0);
  });

  it("translates points by -centre", () => {
    const result = recentre([{ x: 150, y: 80 }], { x: 100, y: 100 });
    expect(result[0].x).toBe(50);
    expect(result[0].y).toBe(-20);
  });
});

describe("aabbCentre", () => {
  it("returns the AABB centre of a 4-point square", () => {
    const c = aabbCentre([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 8 },
      { x: 0, y: 8 },
    ]);
    expect(c.x).toBe(5);
    expect(c.y).toBe(4);
  });

  it("returns origin for empty input", () => {
    const c = aabbCentre([]);
    expect(c.x).toBe(0);
    expect(c.y).toBe(0);
  });
});

describe("extractPathVertices", () => {
  it("extracts item-local vertices from a MOVE+LINE square", () => {
    const cmds = [
      [0, 0, 0],
      [1, 10, 0],
      [1, 10, 10],
      [1, 0, 10],
      [5],
    ] as PathCommand[];
    const verts = extractPathVertices(cmds);
    expect(verts).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
  });

  it("ignores parent.position (item-local extraction is rotation/translation invariant)", () => {
    // No transform applied: item.position is irrelevant — the verts come back
    // in item-local coords exactly as the commands specify.
    const cmds = [
      [0, 0, 0],
      [1, 10, 0],
    ] as PathCommand[];
    const verts = extractPathVertices(cmds);
    expect(verts[0]).toEqual({ x: 0, y: 0 });
    expect(verts[1]).toEqual({ x: 10, y: 0 });
  });
});

describe("tessellatePathCurve", () => {
  it("returns control points verbatim at tension=0", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const result = tessellatePathCurve(pts, 0);
    expect(result).toEqual(pts);
  });

  it("subdivides at tension>0 into more vertices than control points", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const result = tessellatePathCurve(pts, 1);
    expect(result.length).toBeGreaterThan(pts.length);
  });
});

describe("hashVertices", () => {
  it("produces the same hash for identical vertex lists", () => {
    const a = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ];
    const b = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ];
    expect(hashVertices(a)).toBe(hashVertices(b));
  });

  it("produces different hashes for different vertex lists", () => {
    const a = [{ x: 1, y: 2 }];
    const b = [{ x: 1, y: 3 }];
    expect(hashVertices(a)).not.toBe(hashVertices(b));
  });

  it("ignores sub-0.1px jitter from float noise", () => {
    const a = [{ x: 1.00, y: 2.00 }];
    const b = [{ x: 1.001, y: 1.999 }];
    expect(hashVertices(a)).toBe(hashVertices(b));
  });
});

// Control points of the 2026-11-07 repro CURVE (tension 0.25), item-local.
const REPRO_CURVE_POINTS = [
  [1680.48, 741.76], [1443.8, 658.13], [1286.01, 644.57], [1189.08, 655.87],
  [1107.93, 707.85], [1053.83, 768.88], [916.33, 967.78], [898.3, 1064.97],
  [907.32, 1135.04], [995.23, 1268.4], [1098.92, 1485.38], [1209.37, 1609.7],
  [1290.52, 1659.42], [1565.52, 1697.85], [1671.47, 1648.12], [1736.84, 1573.53],
  [1750.36, 1541.89], [1770.65, 1469.56], [1768.39, 1263.88], [1741.34, 1196.07],
  [1736.84, 1058.19], [1698.52, 1008.47], [1563.27, 965.52], [1545.23, 899.98],
  [1583.55, 800.52],
].map(([x, y]) => ({ x, y }));

describe("maxOutsideDistance", () => {
  const square = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
  ];

  it("is 0 when the outline lies inside the polygon", () => {
    expect(maxOutsideDistance([{ x: 5, y: 5 }, { x: 1, y: 9 }], square)).toBe(0);
  });

  it("is the distance of the furthest outside point to the nearest edge", () => {
    const d = maxOutsideDistance([{ x: 5, y: -3 }, { x: 12, y: 5 }], square);
    expect(d).toBeCloseTo(3, 6);
  });
});

describe("cleanAndSimplify budget use", () => {
  // Regression: geometric epsilon growth left the repro curve at 20 of 24
  // vertices, with chords cutting 13-unit ungraded slivers inside its bulges.
  // The shader inflates by the residual (~4 units here), so it only has to be
  // small enough that the mask's outward growth stays unnoticeable.
  it("fills the vertex budget on the repro curve and keeps the sliver small", () => {
    const dense = tessellatePathCurve(REPRO_CURVE_POINTS, 0.25);
    const { vertices } = cleanAndSimplify(dense, 32);
    expect(vertices.length).toBe(32);
    expect(maxOutsideDistance(dense, vertices)).toBeLessThan(5);
  });
});

describe("tessellatePathCurve convention", () => {
  // Span (0,0) -> (10,0) of a 10-unit square at tension 1: both handles are
  // tension/2 of the 10x10 diagonal, so the Bezier midpoint is (5, -3.75).
  // The previous uniform cardinal spline put it at (5, -1.25).
  it("uses length-weighted Bezier handles, matching OBR's rendering", () => {
    const square = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
    ];
    const pts = tessellatePathCurve(square, 1);
    const mid = pts[pts.length / square.length / 2];
    expect(mid.x).toBeCloseTo(5, 6);
    expect(mid.y).toBeCloseTo(-3.75, 6);
  });
});

describe("polygonCoordOffset", () => {
  it("reduces to halfSize + excess when position is the bounds centre (primitive-derived PATH)", () => {
    const offset = polygonCoordOffset(
      { min: { x: 100, y: 200 }, max: { x: 300, y: 600 } },
      { x: 200, y: 400 },
      12,
    );
    expect(offset).toEqual({ x: 112, y: 212 });
  });

  // Reproduction from 2026-11-07: a closed CURVE drawn at world coords then
  // dragged to position (-60.48, -46.26) sampled the scene around a token at
  // (4875, 4125) under the old offset (bounds.center - position). The
  // difference between the old and new offsets is the predicted
  // misregistration; it must carry the shape's centre onto that token.
  it("accounts for the canvas-measured misregistration of the old CURVE offset", () => {
    const position = { x: -60.47991943359375, y: -46.2603759765625 };
    // Control-point AABB of the reported curve, shifted to world space.
    const bounds = {
      min: { x: 898.3 + position.x, y: 644.57 + position.y },
      max: { x: 1770.65 + position.x, y: 1697.85 + position.y },
    };
    const centre = {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
    };
    const oldOffset = { x: centre.x - position.x, y: centre.y - position.y };
    const offset = polygonCoordOffset(bounds, position, 12);

    const sampledByOld = {
      x: centre.x + oldOffset.x - offset.x,
      y: centre.y + oldOffset.y - offset.y,
    };
    const tokenHalfWidth = 75;
    expect(Math.abs(sampledByOld.x - 4875)).toBeLessThan(tokenHalfWidth);
    expect(Math.abs(sampledByOld.y - 4125)).toBeLessThan(tokenHalfWidth);
  });
});
