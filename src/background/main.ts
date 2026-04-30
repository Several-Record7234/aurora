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
import { changelog, getUnseenEntries } from "../changelog";

const OBR_TIMEOUT_MS = 10_000;
const obrTimeout = setTimeout(() => {
  console.warn("Aurora: OBR.onReady did not fire within 10 s — connection may have failed");
}, OBR_TIMEOUT_MS);

OBR.onReady(async () => {
  clearTimeout(obrTimeout);
  // Migrate old "com.aurora-vtt.aurora/*" keys before anything reads them.
  // REMOVABLE: see migrateMetadata.ts header comment.
  await migrateMetadata();

  createAuroraMenu();
  const cleanupEffectManager = startEffectManager();

  // What's New modal (GM only, fires once per new version)
  try {
    const role = await OBR.player.getRole();
    if (role === "GM") {
      const lastSeen = localStorage.getItem("aurora:lastSeenVersion");
      if (!lastSeen) {
        if (changelog.length > 0) localStorage.setItem("aurora:lastSeenVersion", changelog[0].version);
      } else {
        const unseen = getUnseenEntries(changelog, lastSeen);
        if (unseen.length > 0) {
          OBR.modal.open({
            id: "dev.aurora.whats-new",
            url: `/whats-new.html?lastSeen=${encodeURIComponent(lastSeen)}`,
            width: 360,
            height: 480,
          }).then(() => {
            if (changelog.length > 0) localStorage.setItem("aurora:lastSeenVersion", changelog[0].version);
          }).catch(() => {});
        }
      }
    }
  } catch {
    // OBR not ready or role unavailable — skip
  }

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
