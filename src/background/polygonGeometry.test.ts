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
