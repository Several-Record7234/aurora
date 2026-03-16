/**
 * Type guard tests for isAuroraConfig and isPresets.
 *
 * These guards validate metadata read from OBR — they're the boundary
 * between trusted internal code and untrusted external data. Getting
 * them wrong means silent corruption or runtime crashes.
 */

import { describe, it, expect } from "vitest";
import {
  isAuroraConfig,
  isPresets,
  DEFAULT_CONFIG,
  DEFAULT_PRESETS,
  MAX_PRESET_SLOTS,
  BLEND_MODES,
} from "./types";

// ── isAuroraConfig ──────────────────────────────────────────────────

describe("isAuroraConfig", () => {
  it("accepts DEFAULT_CONFIG", () => {
    expect(isAuroraConfig(DEFAULT_CONFIG)).toBe(true);
  });

  it("accepts minimal valid config (no optional fields)", () => {
    expect(isAuroraConfig({ s: 100, l: 100, h: 0, o: 0, e: true })).toBe(true);
  });

  it("accepts config with all optional fields", () => {
    expect(isAuroraConfig({ s: 100, l: 100, h: 0, o: 0, e: true, b: 2, f: 50, fi: true })).toBe(true);
  });

  it("accepts boundary values", () => {
    expect(isAuroraConfig({ s: 0, l: 0, h: -180, o: 0, e: false })).toBe(true);
    expect(isAuroraConfig({ s: 200, l: 200, h: 180, o: 100, e: true })).toBe(true);
  });

  it("rejects null", () => {
    expect(isAuroraConfig(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isAuroraConfig(undefined)).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isAuroraConfig(42)).toBe(false);
    expect(isAuroraConfig("config")).toBe(false);
    expect(isAuroraConfig(true)).toBe(false);
  });

  it("rejects empty object", () => {
    expect(isAuroraConfig({})).toBe(false);
  });

  it("rejects missing required fields", () => {
    expect(isAuroraConfig({ s: 100, l: 100, h: 0, o: 0 })).toBe(false); // missing e
    expect(isAuroraConfig({ s: 100, l: 100, h: 0, e: true })).toBe(false); // missing o
    expect(isAuroraConfig({ s: 100, l: 100, o: 0, e: true })).toBe(false); // missing h
  });

  it("rejects out-of-range saturation", () => {
    expect(isAuroraConfig({ s: -1, l: 100, h: 0, o: 0, e: true })).toBe(false);
    expect(isAuroraConfig({ s: 201, l: 100, h: 0, o: 0, e: true })).toBe(false);
  });

  it("rejects out-of-range lightness", () => {
    expect(isAuroraConfig({ s: 100, l: -1, h: 0, o: 0, e: true })).toBe(false);
    expect(isAuroraConfig({ s: 100, l: 201, h: 0, o: 0, e: true })).toBe(false);
  });

  it("rejects out-of-range hue", () => {
    expect(isAuroraConfig({ s: 100, l: 100, h: -181, o: 0, e: true })).toBe(false);
    expect(isAuroraConfig({ s: 100, l: 100, h: 181, o: 0, e: true })).toBe(false);
  });

  it("rejects out-of-range opacity", () => {
    expect(isAuroraConfig({ s: 100, l: 100, h: 0, o: -1, e: true })).toBe(false);
    expect(isAuroraConfig({ s: 100, l: 100, h: 0, o: 101, e: true })).toBe(false);
  });

  it("rejects wrong type for enabled", () => {
    expect(isAuroraConfig({ s: 100, l: 100, h: 0, o: 0, e: 1 })).toBe(false);
    expect(isAuroraConfig({ s: 100, l: 100, h: 0, o: 0, e: "true" })).toBe(false);
  });
});

// ── isPresets ────────────────────────────────────────────────────────

describe("isPresets", () => {
  it("accepts DEFAULT_PRESETS", () => {
    // DEFAULT_PRESETS is frozen; isPresets expects a mutable array check
    expect(isPresets([...DEFAULT_PRESETS])).toBe(true);
  });

  it("accepts array of all nulls", () => {
    expect(isPresets([null, null, null])).toBe(true);
  });

  it("accepts single valid preset", () => {
    expect(isPresets([{ n: "Test", s: 100, l: 100, h: 0, o: 50 }])).toBe(true);
  });

  it("accepts mix of presets and nulls", () => {
    expect(isPresets([{ n: "A", s: 50, l: 50, h: 10, o: 20 }, null, null])).toBe(true);
  });

  it("rejects empty array", () => {
    expect(isPresets([])).toBe(false);
  });

  it("rejects array exceeding MAX_PRESET_SLOTS", () => {
    const tooMany = Array(MAX_PRESET_SLOTS + 1).fill(null);
    expect(isPresets(tooMany)).toBe(false);
  });

  it("rejects non-array", () => {
    expect(isPresets(null)).toBe(false);
    expect(isPresets(undefined)).toBe(false);
    expect(isPresets({})).toBe(false);
    expect(isPresets("presets")).toBe(false);
  });

  it("rejects array with invalid preset object", () => {
    expect(isPresets([{ n: "Bad", s: "not a number", l: 100, h: 0, o: 50 }])).toBe(false);
  });

  it("rejects preset missing name", () => {
    expect(isPresets([{ s: 100, l: 100, h: 0, o: 50 }])).toBe(false);
  });

  it("rejects preset with out-of-range values", () => {
    expect(isPresets([{ n: "Bad", s: 300, l: 100, h: 0, o: 50 }])).toBe(false);
    expect(isPresets([{ n: "Bad", s: 100, l: 100, h: -200, o: 50 }])).toBe(false);
  });
});

// ── BLEND_MODES ─────────────────────────────────────────────────────

describe("BLEND_MODES", () => {
  it("has exactly 4 modes", () => {
    expect(BLEND_MODES).toHaveLength(4);
  });

  it("values are sequential 0-3", () => {
    expect(BLEND_MODES.map((m) => m.value)).toEqual([0, 1, 2, 3]);
  });

  it("every mode has a label", () => {
    for (const mode of BLEND_MODES) {
      expect(mode.label).toBeTruthy();
    }
  });
});
