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
import { migrateMetadata, migrateItemMetadata } from "./migrateMetadata";

OBR.onReady(async () => {
  // Migrate old "com.aurora-vtt.aurora/*" keys before anything reads them.
  // REMOVABLE: see migrateMetadata.ts header comment.
  await migrateMetadata();

  createAuroraMenu();
  const cleanupEffectManager = startEffectManager();

  // Also migrate item metadata when the user switches to a different scene.
  // REMOVABLE: see migrateMetadata.ts header comment.
  const unsubReadyChange = OBR.scene.onReadyChange(async (ready) => {
    if (ready) await migrateItemMetadata();
  });

  // Clean up subscriptions and effects when the background iframe is torn down
  window.addEventListener("beforeunload", () => {
    cleanupEffectManager();
    unsubReadyChange();
  });
});
