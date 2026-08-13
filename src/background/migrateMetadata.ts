/**
 * Aurora – one-time metadata key migration.
 *
 * Aurora's plugin namespace (the prefix on every metadata key) has changed
 * several times as hosting moved. Each time, rooms and items that already
 * held Aurora data kept the old-namespace keys. This module detects any
 * known old-namespace metadata and rewrites it under the current namespace,
 * then deletes the old keys so each migration runs only once per room/item.
 *
 * Current namespace: see PLUGIN_BASE in shared/pluginId.ts
 *   (com.several-record.aurora)
 *
 * Superseded namespaces still migrated from (newest first):
 *   https://aurora.several-record.com    Cloudflare Pages, URL-style key
 *   https://aurora-0nm6.onrender.com     Render hosting
 *
 * The original "com.aurora-vtt.aurora" namespace was retired in v0.9.3 — a
 * room not opened since that era keeps its orphaned keys, which are ignored.
 *
 * REMOVABLE: This entire file can be deleted in a future major release once
 * all active rooms have been migrated. When removing, also delete:
 *   - The import and calls in background/main.ts
 *   - The OLD_MENU_IDS removal loop in createAuroraMenu.ts
 */

import OBR from "@owlbear-rodeo/sdk";
import { getPluginId } from "../shared/pluginId";

/** A superseded namespace and the key paths that may still exist under it. */
interface LegacyNamespace {
  base: string;
  roomKeys: readonly string[];
  itemKeys: readonly string[];
}

/**
 * Every namespace Aurora has used before the current one, NEWEST FIRST.
 * Order matters: when two eras' keys somehow coexist, the newest is copied
 * first and wins, so the most recent data is preserved.
 */
const LEGACY_NAMESPACES: readonly LegacyNamespace[] = [
  {
    base: "https://aurora.several-record.com",
    roomKeys: ["presets"],
    itemKeys: ["config", "lastConfig", "isEffect", "sourceItemId", "luma"],
  },
  {
    base: "https://aurora-0nm6.onrender.com",
    roomKeys: ["presets"],
    itemKeys: ["config", "lastConfig", "isEffect", "sourceItemId", "luma"],
  },
];

/**
 * Migrate any old-namespace metadata to the current namespace.
 * Safe to call on every startup — it no-ops when no old keys are found.
 */
export async function migrateMetadata(): Promise<void> {
  for (const ns of LEGACY_NAMESPACES) {
    await migrateRoomFromBase(ns.base, ns.roomKeys);
  }
  if (await OBR.scene.isReady()) {
    await migrateItemMetadata();
  }
}

/** Migrate old-namespace keys on scene items. Exported so it can also
 *  run when the user switches to a different scene in the same room. */
export async function migrateItemMetadata(): Promise<void> {
  for (const ns of LEGACY_NAMESPACES) {
    await migrateItemsFromBase(ns.base, ns.itemKeys);
  }
}

async function migrateRoomFromBase(base: string, roomKeys: readonly string[]): Promise<void> {
  const metadata = await OBR.room.getMetadata();
  const updates: Record<string, unknown> = {};
  let found = false;

  for (const path of roomKeys) {
    const oldKey = `${base}/${path}`;
    const newKey = getPluginId(path);
    if (metadata[oldKey] !== undefined) {
      // Only copy when the current key is empty, so a newer era already
      // migrated does not get clobbered by an older one.
      if (metadata[newKey] === undefined) updates[newKey] = metadata[oldKey];
      // OBR's setMetadata shallow-merges; setting a key to `undefined`
      // removes it. Always clean up the old key so nothing is orphaned.
      updates[oldKey] = undefined;
      found = true;
    }
  }

  if (found) {
    await OBR.room.setMetadata(updates);
    console.log(`[Aurora] Migrated room metadata from ${base}`);
  }
}

async function migrateItemsFromBase(base: string, itemKeys: readonly string[]): Promise<void> {
  const allItems = await OBR.scene.items.getItems();
  const itemsToUpdate: string[] = [];

  // First pass: identify items carrying any old-namespace key.
  for (const item of allItems) {
    for (const path of itemKeys) {
      if (item.metadata[`${base}/${path}`] !== undefined) {
        itemsToUpdate.push(item.id);
        break; // Only need to flag the item once
      }
    }
  }

  if (itemsToUpdate.length === 0) return;

  await OBR.scene.items.updateItems(itemsToUpdate, (items) => {
    for (const item of items) {
      for (const path of itemKeys) {
        const oldKey = `${base}/${path}`;
        const newKey = getPluginId(path);
        if (item.metadata[oldKey] !== undefined && item.metadata[newKey] === undefined) {
          item.metadata[newKey] = item.metadata[oldKey];
        }
        // Always clean up the old key.
        delete item.metadata[oldKey];
      }
    }
  });

  console.log(`[Aurora] Migrated item metadata from ${base} on ${itemsToUpdate.length} item(s)`);
}
