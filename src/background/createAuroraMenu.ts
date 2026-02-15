import OBR from "@owlbear-rodeo/sdk";
import { getPluginId } from "../shared/pluginId";
import { DEFAULT_CONFIG } from "../shared/types";

/** Register context menu items on MAP layer objects.
 *
 *  Two entries:
 *  1. "Add Aurora" — shown on MAP items without Aurora metadata.
 *     Writes default config into the item's metadata.
 *  2. "Aurora Settings" — shown on MAP items that already have Aurora metadata.
 *     Opens the embedded menu popover for HSLO control.
 */
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
      height: 380,
    },
  });
}
