/**
 * Aurora – context menu registration (background page).
 *
 * Registers two right-click context menu entries on MAP-layer items:
 *
 *   "Add Aurora"      — shown when the item has no Aurora metadata yet.
 *                       Writes DEFAULT_CONFIG into the item's metadata,
 *                       which the effect manager picks up on its next
 *                       reconcile pass.
 *
 *   "Aurora Settings" — shown when the item already has Aurora metadata.
 *                       Opens the embedded menu popover (menu.html) so
 *                       the user can adjust HSLO sliders.
 */

import OBR from "@owlbear-rodeo/sdk";
import { getPluginId } from "../shared/pluginId";
import { DEFAULT_CONFIG, isAuroraConfig } from "../shared/types";
import { CONFIG_KEY, LAST_CONFIG_KEY } from "../shared/keys";

/** Popover height for the Aurora Settings embed (pixels) */
const SETTINGS_EMBED_HEIGHT = 490;

/** Old namespace context menu IDs left over from before the namespace migration.
 *  REMOVABLE: see migrateMetadata.ts header comment. */
const OLD_BASE = "com.aurora-vtt.aurora";
const OLD_MENU_IDS = [`${OLD_BASE}/menu/add`, `${OLD_BASE}/menu/settings`];

export function createAuroraMenu() {
  // Clean up old-namespace menu registrations so they don't appear
  // alongside the new ones (one-time migration artefact).
  // REMOVABLE: see migrateMetadata.ts header comment.
  for (const oldId of OLD_MENU_IDS) {
    OBR.contextMenu.remove(oldId).catch(() => {});
  }

  // "Add Aurora" — appears when item does NOT have Aurora config.
  // If the item has a lastConfig snapshot (from a previous "Remove Aurora"),
  // restores those settings instead of applying defaults.
  OBR.contextMenu.create({
    id: getPluginId("menu/add"),
    icons: [
      {
        icon: "/icon.png",
        label: "Add Aurora",
        filter: {
          every: [
            { key: "layer", value: "MAP" },
            {
              key: ["metadata", CONFIG_KEY],
              value: undefined,
            },
          ],
          permissions: ["UPDATE"],
        },
      },
    ],
    async onClick(context) {
      await OBR.scene.items.updateItems(context.items, (items) => {
        for (const item of items) {
          const lastConfig = item.metadata[LAST_CONFIG_KEY];
          if (isAuroraConfig(lastConfig)) {
            item.metadata[CONFIG_KEY] = { ...lastConfig };
            delete item.metadata[LAST_CONFIG_KEY];
          } else {
            item.metadata[CONFIG_KEY] = { ...DEFAULT_CONFIG };
          }
        }
      });
    },
  });

  // "Aurora Settings" — appears when item already has Aurora config.
  // No layer restriction: the effect persists if the item moves off MAP,
  // so the settings popup must remain accessible on any layer.
  OBR.contextMenu.create({
    id: getPluginId("menu/settings"),
    icons: [
      {
        icon: "/icon.png",
        label: "Aurora Settings",
        filter: {
          every: [
            {
              key: ["metadata", CONFIG_KEY],
              value: undefined,
              operator: "!=",
            },
          ],
          permissions: ["UPDATE"],
        },
      },
    ],
    embed: {
      url: "/menu.html",
      height: SETTINGS_EMBED_HEIGHT,
    },
  });
}
