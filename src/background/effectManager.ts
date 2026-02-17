/**
 * Aurora – effect manager (background page).
 *
 * Watches for scene item changes and manages local POST_PROCESS shader
 * effects that implement Aurora's colour grading. Each MAP-layer item
 * with Aurora config metadata gets a corresponding local ATTACHMENT
 * effect; when the config changes the effect is recreated, and when the
 * config is removed the effect is cleaned up.
 *
 * PERFORMANCE NOTES:
 *   - A config snapshot cache avoids recreating effects when nothing has
 *     changed (the OBR onChange callback fires on every item mutation,
 *     including drags and selections).
 *   - All additions and deletions are batched into single SDK calls to
 *     minimise round-trips and reduce visual flicker.
 *   - The reconcile loop is wrapped in a try/catch so that a single
 *     failed operation doesn't leave the effect set in an inconsistent
 *     state.
 */

import OBR, { buildEffect, Effect, Item } from "@owlbear-rodeo/sdk";
import { getPluginId } from "../shared/pluginId";
import { getShaderCode, getShaderUniforms } from "../shared/shader";
import { AuroraConfig, isAuroraConfig } from "../shared/types";

// ── Metadata Keys ─────────────────────────────────────────────────

const CONFIG_KEY = getPluginId("config");
const EFFECT_META_KEY = getPluginId("isEffect");

/** Tag stored on local effects so we can link them back to their source item */
function effectSourceKey(): string {
  return getPluginId("sourceItemId");
}

// ── Config Snapshot Cache ─────────────────────────────────────────
//
// Maps source-item ID → a JSON snapshot of the AuroraConfig that was
// last used to create its effect. On each reconcile pass we compare the
// current config against this snapshot; if they match we skip the item
// entirely, avoiding needless delete-then-add cycles.

const configCache = new Map<string, string>();

/** Serialise an AuroraConfig to a stable string for comparison */
function configSnapshot(config: AuroraConfig): string {
  // Deterministic key order via explicit concatenation (faster than JSON.stringify)
  return `${config.s}|${config.l}|${config.h}|${config.o}|${config.e}`;
}

// ── Effect Helpers ────────────────────────────────────────────────

/** Find all local Aurora effects */
async function findAllEffects(): Promise<Item[]> {
  return OBR.scene.local.getItems(
    (item) => item.metadata[EFFECT_META_KEY] !== undefined
  );
}

/** Remove all Aurora effects and clear the cache (used on scene close) */
async function removeAllEffects(): Promise<void> {
  const effects = await findAllEffects();
  if (effects.length > 0) {
    await OBR.scene.local.deleteItems(effects.map((e) => e.id));
  }
  configCache.clear();
}

/**
 * Build an ATTACHMENT effect for a MAP-layer item.
 *
 * SUPPORTS ANY MAP-LAYER ITEM — not limited to IMAGE type.
 * Drawings (rectangles, circles, etc.) moved to the MAP layer can also
 * have Aurora effects applied, matching the Weather extension's behaviour
 * of supporting any attachable item.
 *
 * KEY IMPLEMENTATION NOTES:
 *
 * 1. POSITION: must be parent.position
 *    The shader uses the `modelView` built-in uniform, which combines the
 *    effect item's own model transform with the viewport transform. For
 *    modelView to compute correct screen-space coordinates the effect
 *    must know its actual position in the scene.
 *
 * 2. WIDTH/HEIGHT: not set
 *    ATTACHMENT effects auto-fill the parent item's display bounds.
 *
 * 3. LAYER: POST_PROCESS
 *    Required for access to the `uniform shader scene` built-in, which
 *    lets the shader sample the current rendered scene colour at each pixel.
 *
 * 4. disableAttachmentBehavior(["COPY"])
 *    Local items (effects) must not be copied when the parent is duplicated;
 *    the effect manager will create new effects for any new items that have
 *    Aurora config in their metadata.
 */
function buildAuroraEffect(parent: Item, config: AuroraConfig): Effect {
  const effect = buildEffect()
    .attachedTo(parent.id)
    .effectType("ATTACHMENT")
    .position(parent.position)
    .rotation(parent.rotation)
    .visible(parent.visible)
    .locked(true)
    .disableHit(true)
    .disableAttachmentBehavior(["COPY"])
    .disableAutoZIndex(true)
    .build();

  // Set shader properties directly on the built object (not via builder)
  effect.sksl = getShaderCode();
  effect.uniforms = getShaderUniforms(config);

  effect.layer = "POST_PROCESS";
  effect.zIndex = 0;

  // Tag with metadata so we can find/manage this effect later
  effect.metadata = {
    [EFFECT_META_KEY]: true,
    [effectSourceKey()]: parent.id,
  };

  return effect;
}

// ── Reconciliation ────────────────────────────────────────────────

/**
 * Reconcile all Aurora effects with the current scene state.
 * Called on scene ready and whenever items change.
 *
 * Uses a config snapshot cache to skip items whose config hasn't changed
 * since the last pass, and batches all SDK add/delete calls.
 */
async function reconcileEffects(items: Item[]): Promise<void> {
  try {
    const existingEffects = await findAllEffects();

    // Build a lookup of existing effects by source item ID
    const effectsBySource = new Map<string, Item>();
    for (const e of existingEffects) {
      const sourceId = e.metadata[effectSourceKey()] as string | undefined;
      if (sourceId) {
        effectsBySource.set(sourceId, e);
      }
    }

    // Items that should have effects — any MAP-layer item with Aurora config
    const auroraItems = new Map<string, { item: Item; config: AuroraConfig }>();
    for (const item of items) {
      if (item.layer === "MAP") {
        const config = item.metadata[CONFIG_KEY];
        if (isAuroraConfig(config)) {
          auroraItems.set(item.id, { item, config });
        }
      }
    }

    // ── Determine which effects to remove ───────────────────────

    const idsToRemove: string[] = [];

    for (const [sourceId, effectItem] of effectsBySource) {
      if (!auroraItems.has(sourceId)) {
        // Source item no longer has Aurora config — remove its effect
        idsToRemove.push(effectItem.id);
        configCache.delete(sourceId);
      }
    }

    // ── Determine which effects to create / recreate ────────────

    const effectsToAdd: Effect[] = [];

    for (const [itemId, { item, config }] of auroraItems) {
      const snap = configSnapshot(config);
      const cached = configCache.get(itemId);

      if (cached === snap && effectsBySource.has(itemId)) {
        // Config unchanged and effect already exists — skip
        continue;
      }

      // Config changed or effect is missing — schedule removal of the
      // old effect (if any) and creation of a new one
      const existing = effectsBySource.get(itemId);
      if (existing && !idsToRemove.includes(existing.id)) {
        idsToRemove.push(existing.id);
      }

      if (config.e) {
        effectsToAdd.push(buildAuroraEffect(item, config));
      }

      // Update cache (even for disabled configs, so we don't keep
      // trying to recreate them on every reconcile)
      configCache.set(itemId, snap);
    }

    // ── Execute batched SDK operations ──────────────────────────

    if (idsToRemove.length > 0) {
      await OBR.scene.local.deleteItems(idsToRemove);
    }

    if (effectsToAdd.length > 0) {
      await OBR.scene.local.addItems(effectsToAdd);
    }
  } catch (err) {
    console.error("Aurora: reconcileEffects failed, will retry on next change", err);
  }
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Start the effect manager.
 * Watches for scene item changes and manages local effects accordingly.
 * Returns a cleanup function.
 */
export function startEffectManager(): () => void {
  let unsubItems: (() => void) | null = null;
  let unsubReady: (() => void) | null = null;

  async function onSceneReady() {
    const items = await OBR.scene.items.getItems();
    await reconcileEffects(items);

    unsubItems?.();
    unsubItems = OBR.scene.items.onChange(async (items) => {
      await reconcileEffects(items);
    });
  }

  async function init() {
    if (await OBR.scene.isReady()) {
      await onSceneReady();
    }

    unsubReady = OBR.scene.onReadyChange(async (ready) => {
      if (ready) {
        await onSceneReady();
      } else {
        unsubItems?.();
        unsubItems = null;
        await removeAllEffects().catch(() => {});
      }
    });
  }

  init();

  return () => {
    unsubItems?.();
    unsubReady?.();
    removeAllEffects().catch(() => {});
  };
}
