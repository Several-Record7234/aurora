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
import { DEFAULT_CONFIG } from "../shared/types";

/** Popover height for the Aurora Settings embed (pixels) */
const SETTINGS_EMBED_HEIGHT = 380;

export function createAuroraMenu() {
  const CONFIG_KEY = getPluginId("config");

  // "Add Aurora" — appears when item does NOT have Aurora config
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
          item.metadata[CONFIG_KEY] = { ...DEFAULT_CONFIG };
        }
      });
    },
  });

  // "Aurora Settings" — appears when item already has Aurora config
  OBR.contextMenu.create({
    id: getPluginId("menu/settings"),
    icons: [
      {
        icon: "/icon.png",
        label: "Aurora Settings",
        filter: {
          every: [
            { key: "layer", value: "MAP" },
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
