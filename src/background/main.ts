/**
 * Aurora – background page entry point.
 *
 * Runs as a hidden iframe whenever the extension is enabled in a room.
 * Responsibilities:
 *   1. Register the "Add Aurora" / "Aurora Settings" context menu items
 *      (see createAuroraMenu.ts).
 *   2. Start the effect manager that watches for item metadata changes
 *      and creates/removes local POST_PROCESS shader effects accordingly
 *      (see effectManager.ts).
 */

import OBR from "@owlbear-rodeo/sdk";
import { createAuroraMenu } from "./createAuroraMenu";
import { startEffectManager } from "./effectManager";

OBR.onReady(() => {
  createAuroraMenu();
  startEffectManager();
});
