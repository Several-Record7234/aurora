/**
 * Shader uniform tests.
 *
 * Tests getShaderUniforms conversion logic — the bridge between
 * UI-facing config values and GPU-facing float uniforms.
 */

import { describe, it, expect } from "vitest";
import {
  getShaderUniforms,
  getShaderCode,
  SHAPE_TYPE_RECT,
  SHAPE_TYPE_CIRCLE,
  SHAPE_TYPE_TRIANGLE,
  SHAPE_TYPE_HEXAGON,
  type ShaderGeometry,
} from "./shader";
import { DEFAULT_CONFIG, type AuroraConfig } from "./types";

// ── getShaderUniforms ───────────────────────────────────────────────

describe("getShaderUniforms", () => {
  it("returns 13 uniforms", () => {
    const uniforms = getShaderUniforms(DEFAULT_CONFIG);
    expect(uniforms).toHaveLength(13);
  });

  it("returns all expected uniform names", () => {
    const names = getShaderUniforms(DEFAULT_CONFIG).map((u) => u.name);
    expect(names).toEqual([
      "saturation",
      "lightness",
      "hue",
      "opacity",
      "blendMode",
      "coordOffset",
      "feather",
      "invertFeather",
      "itemSize",
      "shapeSize",
      "shapeType",
      "dreamy",
      "bloomThreshold",
    ]);
  });

  describe("value conversions", () => {
    it("normalises saturation: 0–200 → 0.0–2.0", () => {
      const at0 = getShaderUniforms({ ...DEFAULT_CONFIG, s: 0 });
      const at100 = getShaderUniforms({ ...DEFAULT_CONFIG, s: 100 });
      const at200 = getShaderUniforms({ ...DEFAULT_CONFIG, s: 200 });

      expect(at0.find((u) => u.name === "saturation")!.value).toBeCloseTo(0.0);
      expect(at100.find((u) => u.name === "saturation")!.value).toBeCloseTo(1.0);
      expect(at200.find((u) => u.name === "saturation")!.value).toBeCloseTo(2.0);
    });

    it("normalises lightness: 0–200 → 0.0–2.0", () => {
      const at0 = getShaderUniforms({ ...DEFAULT_CONFIG, l: 0 });
      const at200 = getShaderUniforms({ ...DEFAULT_CONFIG, l: 200 });

      expect(at0.find((u) => u.name === "lightness")!.value).toBeCloseTo(0.0);
      expect(at200.find((u) => u.name === "lightness")!.value).toBeCloseTo(2.0);
    });

    it("normalises hue: -180–180 → -0.5–0.5", () => {
      const atNeg180 = getShaderUniforms({ ...DEFAULT_CONFIG, h: -180 });
      const at0 = getShaderUniforms({ ...DEFAULT_CONFIG, h: 0 });
      const at180 = getShaderUniforms({ ...DEFAULT_CONFIG, h: 180 });

      expect(atNeg180.find((u) => u.name === "hue")!.value).toBeCloseTo(-0.5);
      expect(at0.find((u) => u.name === "hue")!.value).toBeCloseTo(0.0);
      expect(at180.find((u) => u.name === "hue")!.value).toBeCloseTo(0.5);
    });

    it("normalises opacity: 0–100 → 0.0–1.0", () => {
      const at0 = getShaderUniforms({ ...DEFAULT_CONFIG, o: 0 });
      const at50 = getShaderUniforms({ ...DEFAULT_CONFIG, o: 50 });
      const at100 = getShaderUniforms({ ...DEFAULT_CONFIG, o: 100 });

      expect(at0.find((u) => u.name === "opacity")!.value).toBeCloseTo(0.0);
      expect(at50.find((u) => u.name === "opacity")!.value).toBeCloseTo(0.5);
      expect(at100.find((u) => u.name === "opacity")!.value).toBeCloseTo(1.0);
    });

    it("passes blendMode as float", () => {
      for (const b of [0, 1, 2, 3] as const) {
        const uniforms = getShaderUniforms({ ...DEFAULT_CONFIG, b });
        const blendMode = uniforms.find((u) => u.name === "blendMode")!.value;
        expect(blendMode).toBe(b * 1.0);
        expect(typeof blendMode).toBe("number");
      }
    });

    it("normalises feather: 0–100 → 0.0–1.0", () => {
      const at0 = getShaderUniforms({ ...DEFAULT_CONFIG, f: 0 });
      const at100 = getShaderUniforms({ ...DEFAULT_CONFIG, f: 100 });

      expect(at0.find((u) => u.name === "feather")!.value).toBeCloseTo(0.0);
      expect(at100.find((u) => u.name === "feather")!.value).toBeCloseTo(1.0);
    });

    it("converts invertFeather boolean to 0.0 or 1.0", () => {
      const off = getShaderUniforms({ ...DEFAULT_CONFIG, fi: false });
      const on = getShaderUniforms({ ...DEFAULT_CONFIG, fi: true });

      expect(off.find((u) => u.name === "invertFeather")!.value).toBe(0.0);
      expect(on.find((u) => u.name === "invertFeather")!.value).toBe(1.0);
    });

    it("normalises dreamy: -100–100 → -1.0–1.0", () => {
      const atNeg100 = getShaderUniforms({ ...DEFAULT_CONFIG, d: -100 });
      const at0     = getShaderUniforms({ ...DEFAULT_CONFIG, d: 0 });
      const at100   = getShaderUniforms({ ...DEFAULT_CONFIG, d: 100 });

      expect(atNeg100.find((u) => u.name === "dreamy")!.value).toBeCloseTo(-1.0);
      expect(at0.find((u) => u.name === "dreamy")!.value).toBeCloseTo(0.0);
      expect(at100.find((u) => u.name === "dreamy")!.value).toBeCloseTo(1.0);
    });

    it("passes bloomThreshold through unchanged", () => {
      const defaultThreshold = getShaderUniforms(DEFAULT_CONFIG);
      expect(defaultThreshold.find((u) => u.name === "bloomThreshold")!.value).toBeCloseTo(0.7);

      const customThreshold = getShaderUniforms(DEFAULT_CONFIG, undefined, 0.55);
      expect(customThreshold.find((u) => u.name === "bloomThreshold")!.value).toBeCloseTo(0.55);
    });
  });

  describe("optional field defaults", () => {
    const minimal: AuroraConfig = { s: 100, l: 100, h: 0, o: 0, e: true };

    it("defaults blendMode to 0 when b is undefined", () => {
      const uniforms = getShaderUniforms(minimal);
      expect(uniforms.find((u) => u.name === "blendMode")!.value).toBe(0.0);
    });

    it("defaults feather to 0 when f is undefined", () => {
      const uniforms = getShaderUniforms(minimal);
      expect(uniforms.find((u) => u.name === "feather")!.value).toBe(0.0);
    });

    it("defaults invertFeather to 0 when fi is undefined", () => {
      const uniforms = getShaderUniforms(minimal);
      expect(uniforms.find((u) => u.name === "invertFeather")!.value).toBe(0.0);
    });

    it("defaults dreamy to 0 when d is undefined", () => {
      const uniforms = getShaderUniforms(minimal);
      expect(uniforms.find((u) => u.name === "dreamy")!.value).toBe(0.0);
    });

    it("defaults bloomThreshold to 0.7 when not provided", () => {
      const uniforms = getShaderUniforms(minimal);
      expect(uniforms.find((u) => u.name === "bloomThreshold")!.value).toBeCloseTo(0.7);
    });
  });

  describe("geometry parameter", () => {
    it("uses default geometry when not provided", () => {
      const uniforms = getShaderUniforms(DEFAULT_CONFIG);
      expect(uniforms.find((u) => u.name === "coordOffset")!.value).toEqual({ x: 0, y: 0 });
      expect(uniforms.find((u) => u.name === "itemSize")!.value).toEqual({ x: 1, y: 1 });
      expect(uniforms.find((u) => u.name === "shapeSize")!.value).toEqual({ x: 1, y: 1 });
      expect(uniforms.find((u) => u.name === "shapeType")!.value).toBe(0.0);
    });

    it("passes custom geometry through", () => {
      const geometry: ShaderGeometry = {
        coordOffset: { x: 10, y: 20 },
        itemSize: { x: 500, y: 300 },
        shapeSize: { x: 480, y: 280 },
        shapeType: SHAPE_TYPE_CIRCLE,
      };
      const uniforms = getShaderUniforms(DEFAULT_CONFIG, geometry);
      expect(uniforms.find((u) => u.name === "coordOffset")!.value).toEqual({ x: 10, y: 20 });
      expect(uniforms.find((u) => u.name === "itemSize")!.value).toEqual({ x: 500, y: 300 });
      expect(uniforms.find((u) => u.name === "shapeSize")!.value).toEqual({ x: 480, y: 280 });
      expect(uniforms.find((u) => u.name === "shapeType")!.value).toBe(1.0);
    });

    it("converts all shape types to float", () => {
      for (const shapeType of [SHAPE_TYPE_RECT, SHAPE_TYPE_CIRCLE, SHAPE_TYPE_TRIANGLE, SHAPE_TYPE_HEXAGON]) {
        const geometry: ShaderGeometry = {
          coordOffset: { x: 0, y: 0 },
          itemSize: { x: 1, y: 1 },
          shapeSize: { x: 1, y: 1 },
          shapeType,
        };
        const uniforms = getShaderUniforms(DEFAULT_CONFIG, geometry);
        const value = uniforms.find((u) => u.name === "shapeType")!.value;
        expect(value).toBe(shapeType * 1.0);
        expect(typeof value).toBe("number");
      }
    });
  });
});

// ── getShaderCode ───────────────────────────────────────────────────

describe("getShaderCode", () => {
  const code = getShaderCode();

  it("returns a non-empty string", () => {
    expect(code.length).toBeGreaterThan(0);
  });

  it("declares all expected uniforms", () => {
    const expectedUniforms = [
      "uniform shader scene",
      "uniform mat3 modelView",
      "uniform float saturation",
      "uniform float lightness",
      "uniform float hue",
      "uniform float opacity",
      "uniform float blendMode",
      "uniform vec2 coordOffset",
      "uniform float feather",
      "uniform float invertFeather",
      "uniform vec2 itemSize",
      "uniform vec2 shapeSize",
      "uniform float shapeType",
      "uniform float dreamy",
      "uniform float bloomThreshold",
    ];
    for (const uniform of expectedUniforms) {
      expect(code).toContain(uniform);
    }
  });

  it("contains all blend mode functions", () => {
    expect(code).toContain("blendMultiply");
    expect(code).toContain("blendOverlay");
    expect(code).toContain("blendSoftLight");
    expect(code).toContain("blendColor");
  });

  it("contains colour-space conversion functions", () => {
    expect(code).toContain("rgb2hsv");
    expect(code).toContain("hsv2rgb");
  });

  it("contains feather computation", () => {
    expect(code).toContain("computeFeather");
  });

  it("contains main function", () => {
    expect(code).toContain("half4 main(vec2 coord)");
  });

  it("shader code is stable (snapshot)", () => {
    expect(code).toMatchSnapshot();
  });
});
