/**
 * Preset snapshot tests.
 *
 * Captures the expected shader uniform output for every built-in preset.
 * If a preset's values or the uniform mapping changes, these snapshots
 * will break — forcing a conscious review before the change ships.
 */

import { describe, it, expect } from "vitest";
import { DEFAULT_PRESETS, DEFAULT_CONFIG, type AuroraConfig } from "./types";
import { getShaderUniforms } from "./shader";

/** Convert a Preset to an AuroraConfig so it can be fed to getShaderUniforms */
function presetToConfig(preset: NonNullable<(typeof DEFAULT_PRESETS)[number]>): AuroraConfig {
  return {
    s: preset.s,
    l: preset.l,
    h: preset.h,
    o: preset.o,
    e: true,
    b: preset.b,
    f: preset.f,
    fi: preset.fi,
  };
}

describe("DEFAULT_PRESETS → shader uniforms", () => {
  const presets = DEFAULT_PRESETS.filter((p): p is NonNullable<typeof p> => p !== null);

  it("has exactly 4 built-in presets", () => {
    expect(presets).toHaveLength(4);
  });

  it.each(presets.map((p) => [p.n, p] as const))("%s produces stable uniforms", (_name, preset) => {
    const config = presetToConfig(preset);
    const uniforms = getShaderUniforms(config);
    expect(uniforms).toMatchSnapshot();
  });

  it("DEFAULT_CONFIG (identity) produces stable uniforms", () => {
    const uniforms = getShaderUniforms(DEFAULT_CONFIG);
    expect(uniforms).toMatchSnapshot();
  });
});

describe("DEFAULT_PRESETS structure", () => {
  it("has 6 slots total (4 presets + 2 empty)", () => {
    expect(DEFAULT_PRESETS).toHaveLength(6);
    expect(DEFAULT_PRESETS[4]).toBeNull();
    expect(DEFAULT_PRESETS[5]).toBeNull();
  });

  it("every preset has all required fields", () => {
    for (const preset of DEFAULT_PRESETS) {
      if (preset === null) continue;
      expect(preset).toEqual(
        expect.objectContaining({
          n: expect.any(String),
          s: expect.any(Number),
          l: expect.any(Number),
          h: expect.any(Number),
          o: expect.any(Number),
          b: expect.any(Number),
          f: expect.any(Number),
          fi: expect.any(Boolean),
        })
      );
    }
  });

  it("preset names are unique", () => {
    const names = DEFAULT_PRESETS.filter((p) => p !== null).map((p) => p!.n);
    expect(new Set(names).size).toBe(names.length);
  });

  it("preset values are within valid ranges", () => {
    for (const preset of DEFAULT_PRESETS) {
      if (preset === null) continue;
      expect(preset.s).toBeGreaterThanOrEqual(0);
      expect(preset.s).toBeLessThanOrEqual(200);
      expect(preset.l).toBeGreaterThanOrEqual(0);
      expect(preset.l).toBeLessThanOrEqual(200);
      expect(preset.h).toBeGreaterThanOrEqual(-180);
      expect(preset.h).toBeLessThanOrEqual(180);
      expect(preset.o).toBeGreaterThanOrEqual(0);
      expect(preset.o).toBeLessThanOrEqual(100);
      expect(preset.b).toBeGreaterThanOrEqual(0);
      expect(preset.b).toBeLessThanOrEqual(3);
    }
  });
});
