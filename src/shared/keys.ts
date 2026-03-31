/**
 * Aurora – centralised metadata key declarations.
 *
 * All OBR metadata keys used across Aurora are defined here as a single
 * source of truth. Import from this module instead of calling getPluginId()
 * inline in each file.
 */

import { getPluginId } from "./pluginId";

/** Per-item Aurora config (stored on scene items) */
export const CONFIG_KEY = getPluginId("config");

/** Snapshot of config before "Remove Aurora" (soft undo) */
export const LAST_CONFIG_KEY = getPluginId("lastConfig");

/** Tag on local effects so we can identify Aurora effects */
export const EFFECT_META_KEY = getPluginId("isEffect");

/** Links a local effect back to its source scene item */
export const EFFECT_SOURCE_KEY = getPluginId("sourceItemId");

/** CPU-computed bloom luminance threshold (per-item, written by menu on open) */
export const LUMA_KEY = getPluginId("luma");

// UI collapse states have moved to localStorage (per-player, per-room)
// and no longer use room metadata. See src/main.ts for the implementation.
