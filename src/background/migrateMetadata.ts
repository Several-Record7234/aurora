/**
 * Aurora – one-time metadata key migration.
 *
 * When the plugin namespace changed from "com.aurora-vtt.aurora" to the
 * hosting URL "https://aurora-0nm6.onrender.com", any rooms that already
 * had Aurora effects retained the old keys. This module detects old-format
 * metadata and rewrites it under the new namespace, then deletes the old
 * keys so the migration only runs once.
 *
 * Migrates:
 *   Room metadata  – presets, uiState
 *   Item metadata  – config, isEffect, sourceItemId
 *
 * REMOVABLE: This entire file can be deleted in a future major release
 * once all existing rooms have been migrated. When removing, also delete:
 *   - The import and calls in background/main.ts
 *   - The OLD_BASE, OLD_MENU_IDS, and removal loop in createAuroraMenu.ts
 */

import OBR from "@owlbear-rodeo/sdk";
import { getPluginId } from "../shared/pluginId";

const OLD_BASE = "com.aurora-vtt.aurora";

/** Old-namespace key paths that may exist on room metadata */
const ROOM_KEYS = ["presets", "uiState"] as const;

/** Old-namespace key paths that may exist on item metadata */
const ITEM_KEYS = ["config", "isEffect", "sourceItemId"] as const;

/**
 * Migrate any old-namespace metadata to the current namespace.
 * Safe to call on every startup — it no-ops when no old keys are found.
 */
export async function migrateMetadata(): Promise<void> {
  await migrateRoomMetadata();
  if (await OBR.scene.isReady()) {
    await migrateItemMetadata();
  }
}

async function migrateRoomMetadata(): Promise<void> {
  const metadata = await OBR.room.getMetadata();
  const updates: Record<string, unknown> = {};
  let found = false;

  for (const path of ROOM_KEYS) {
    const oldKey = `${OLD_BASE}/${path}`;
    const newKey = getPluginId(path);
    if (metadata[oldKey] !== undefined && metadata[newKey] === undefined) {
      updates[newKey] = metadata[oldKey];
      updates[oldKey] = undefined; // Delete old key
      found = true;
    }
  }

  if (found) {
    await OBR.room.setMetadata(updates);
    console.log("[Aurora] Migrated room metadata from old namespace");
  }
}

/** Migrate old-namespace keys on scene items. Exported so it can also
 *  run when the user switches to a different scene in the same room. */
export async function migrateItemMetadata(): Promise<void> {
  const allItems = await OBR.scene.items.getItems();
  const itemsToUpdate: string[] = [];

  // First pass: identify items with old-namespace keys
  for (const item of allItems) {
    for (const path of ITEM_KEYS) {
      const oldKey = `${OLD_BASE}/${path}`;
      if (item.metadata[oldKey] !== undefined) {
        itemsToUpdate.push(item.id);
        break; // Only need to flag the item once
      }
    }
  }

  if (itemsToUpdate.length === 0) return;

  await OBR.scene.items.updateItems(itemsToUpdate, (items) => {
    for (const item of items) {
      for (const path of ITEM_KEYS) {
        const oldKey = `${OLD_BASE}/${path}`;
        const newKey = getPluginId(path);
        if (item.metadata[oldKey] !== undefined && item.metadata[newKey] === undefined) {
          item.metadata[newKey] = item.metadata[oldKey];
        }
        // Always clean up old key
        delete item.metadata[oldKey];
      }
    }
  });

  console.log(`[Aurora] Migrated item metadata on ${itemsToUpdate.length} item(s)`);
}
