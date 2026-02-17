/**
 * Aurora – preset persistence helpers.
 *
 * Presets are stored in Owlbear Rodeo room metadata so they are shared
 * across all players in the room and persist across sessions. On first
 * access in a room that has never used Aurora, a set of starter presets
 * is seeded into metadata; after that, user edits take precedence.
 *
 * Every function here reads or writes through OBR.room.getMetadata /
 * setMetadata, which automatically syncs to all connected clients.
 */

import OBR from "@owlbear-rodeo/sdk";
import { getPluginId } from "./pluginId";
import { Presets, DEFAULT_PRESETS, isPresets, HSLOValues, MAX_NAME_LENGTH } from "./types";

const PRESETS_KEY = getPluginId("presets");

/**
 * Load presets from room metadata.
 *
 * If the room has never had Aurora presets before (key is absent),
 * the starter presets are written to metadata and returned. This
 * means the defaults only appear once per room — after that, any
 * user edits take precedence.
 */
export async function loadPresets(): Promise<Presets> {
  const metadata = await OBR.room.getMetadata();
  const data = metadata[PRESETS_KEY];

  if (isPresets(data)) {
    return data;
  }

  // First time in this room — seed with default presets
  const defaults: Presets = [...DEFAULT_PRESETS];
  await OBR.room.setMetadata({ [PRESETS_KEY]: defaults });
  return defaults;
}

/** Save the full presets array to room metadata */
export async function savePresets(presets: Presets): Promise<void> {
  await OBR.room.setMetadata({ [PRESETS_KEY]: presets });
}

/** Save current HSLO values into a specific preset slot */
export async function saveToPresetSlot(
  index: number,
  name: string,
  values: HSLOValues
): Promise<void> {
  const presets = await loadPresets();
  presets[index] = {
    n: name.trim().substring(0, MAX_NAME_LENGTH) || `Preset ${index + 1}`,
    s: values.s,
    l: values.l,
    h: values.h,
    o: values.o,
  };
  await savePresets(presets);
}

/** Clear a specific preset slot */
export async function clearPresetSlot(index: number): Promise<void> {
  const presets = await loadPresets();
  presets[index] = null;
  await savePresets(presets);
}

/** Get the room metadata key for subscribing to changes */
export function getPresetsKey(): string {
  return PRESETS_KEY;
}
