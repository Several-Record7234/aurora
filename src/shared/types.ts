// ── HSLO Values ───────────────────────────────────────────────────

/**
 * Core colour-grading parameters shared by config and presets.
 *
 * Field order: S, L, H, O — matching the UI grouping:
 *   "Map Area FX"  → Saturation, Lightness  (applied at full strength)
 *   "Tint Overlay"  → Hue, Opacity           (hue tint blended at opacity strength)
 */
export interface HSLOValues {
  s: number; // Saturation: 0 to 200 (100 = no change)
  l: number; // Lightness: 0 to 200 (100 = no change)
  h: number; // Hue (tint colour): -180 to 180 (degrees on colour wheel)
  o: number; // Opacity (tint strength): 0 to 100
}

// ── Per-Item Config (stored in item.metadata) ─────────────────────

/** Stored under getPluginId("config") on each map-layer item */
export interface AuroraConfig extends HSLOValues {
  e: boolean; // Enabled (allows toggling without losing values)
}

export const DEFAULT_CONFIG: AuroraConfig = {
  s: 100,
  l: 100,
  h: 0,
  o: 0,
  e: true,
};

// ── Presets (stored in room metadata) ─────────────────────────────

export interface Preset extends HSLOValues {
  n: string; // Name
}

export type Presets = Array<Preset | null>;

export const EMPTY_PRESETS: Presets = Array(6).fill(null);
export const MAX_NAME_LENGTH = 16;

/**
 * Starter presets, written to room metadata the first time presets are
 * loaded in a room that has never used Aurora before. Slots 5–6 are
 * left empty so users have room to save their own immediately.
 */
export const DEFAULT_PRESETS: Presets = [
  { n: "Midnight",    s: 25,  l: 30, h: -99,  o: 9  },
  { n: "Golden Hour", s: 120, l: 80, h: 30,   o: 10 },
  { n: "Pre-Dawn",    s: 100, l: 50, h: -150, o: 8  },
  { n: "Blood Moon",  s: 20,  l: 40, h: 0,    o: 14 },
  null,
  null,
];

// ── Type Guards ───────────────────────────────────────────────────

export function isAuroraConfig(val: unknown): val is AuroraConfig {
  if (val === null || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.s === "number" &&
    typeof obj.l === "number" &&
    typeof obj.h === "number" &&
    typeof obj.o === "number" &&
    typeof obj.e === "boolean"
  );
}

export function isPresets(val: unknown): val is Presets {
  return Array.isArray(val);
}
