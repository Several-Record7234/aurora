/**
 * Tests for pluginId and keys modules.
 *
 * These are the namespace foundation — every metadata key in Aurora
 * derives from the plugin base namespace. If these drift, metadata reads
 * silently fail and presets/config disappear for users.
 */

import { describe, it, expect } from "vitest";
import { getPluginId } from "./pluginId";
import { CONFIG_KEY, LAST_CONFIG_KEY, EFFECT_META_KEY, EFFECT_SOURCE_KEY, LUMA_KEY } from "./keys";

describe("getPluginId", () => {
  it("prefixes with the reverse-domain namespace", () => {
    expect(getPluginId("test")).toBe("com.several-record.aurora/test");
  });

  it("handles nested paths", () => {
    expect(getPluginId("a/b/c")).toBe("com.several-record.aurora/a/b/c");
  });
});

describe("metadata keys", () => {
  it("CONFIG_KEY is correct", () => {
    expect(CONFIG_KEY).toBe("com.several-record.aurora/config");
  });

  it("LAST_CONFIG_KEY is correct", () => {
    expect(LAST_CONFIG_KEY).toBe("com.several-record.aurora/lastConfig");
  });

  it("EFFECT_META_KEY is correct", () => {
    expect(EFFECT_META_KEY).toBe("com.several-record.aurora/isEffect");
  });

  it("EFFECT_SOURCE_KEY is correct", () => {
    expect(EFFECT_SOURCE_KEY).toBe("com.several-record.aurora/sourceItemId");
  });

  it("LUMA_KEY is correct", () => {
    expect(LUMA_KEY).toBe("com.several-record.aurora/luma");
  });

  it("all keys are unique", () => {
    const keys = [CONFIG_KEY, LAST_CONFIG_KEY, EFFECT_META_KEY, EFFECT_SOURCE_KEY, LUMA_KEY];
    expect(new Set(keys).size).toBe(keys.length);
  });
});
