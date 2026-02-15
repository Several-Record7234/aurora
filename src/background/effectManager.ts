import OBR, { buildEffect, Effect, Item } from "@owlbear-rodeo/sdk";
import { getPluginId } from "../shared/pluginId";
import { getShaderCode, getShaderUniforms } from "../shared/shader";
import { AuroraConfig, isAuroraConfig } from "../shared/types";

const CONFIG_KEY = getPluginId("config");
const EFFECT_META_KEY = getPluginId("isEffect");

/** Tag we store on local effects so we can link them back to their source item */
function effectSourceKey(): string {
  return getPluginId("sourceItemId");
}

/** Find all local Aurora effects */
async function findAllEffects(): Promise<Item[]> {
  return OBR.scene.local.getItems(
    (item) => item.metadata[EFFECT_META_KEY] !== undefined
  );
}

/** Remove the local effect for a specific source item */
async function removeEffectForItem(itemId: string): Promise<void> {
  const effects = await OBR.scene.local.getItems(
    (item) => item.metadata[effectSourceKey()] === itemId
  );
  if (effects.length > 0) {
    await OBR.scene.local.deleteItems(effects.map((e) => e.id));
  }
}

/** Remove all Aurora effects (used on scene close) */
async function removeAllEffects(): Promise<void> {
  const effects = await findAllEffects();
  if (effects.length > 0) {
    await OBR.scene.local.deleteItems(effects.map((e) => e.id));
  }
}

/**
 * Build an ATTACHMENT effect for a MAP-layer item.
 *
 * SUPPORTS ANY MAP-LAYER ITEM — not limited to IMAGE type.
 * This means drawings (rectangles, circles, etc.) moved to the MAP layer
 * can also have Aurora effects applied, matching the Weather extension's
 * behaviour of supporting any attachable item.
 *
 * KEY IMPLEMENTATION NOTES:
 *
 * 1. POSITION: must be parent.position
 *    The shader uses the `modelView` built-in uniform, which combines the
 *    effect item's own model transform (including its position) with the
 *    viewport transform. For modelView to compute correct screen-space
 *    coordinates, the effect must know its actual position in the scene.
 *
 * 2. WIDTH/HEIGHT: not set
 *    ATTACHMENT effects auto-fill the parent item's display bounds.
 *
 * 3. LAYER: POST_PROCESS
 *    Required for access to the `uniform shader scene` built-in, which
 *    lets the shader sample the current rendered scene colour at each pixel.
 *
 * 4. disableAttachmentBehavior(["COPY"])
 *    Local items (effects) must not be copied when the parent is duplicated,
 *    as the effect manager will create new effects for any new items that
 *    have Aurora config in their metadata.
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

/** Create or recreate the local effect for a MAP-layer item with Aurora config */
async function syncEffectForItem(item: Item, config: AuroraConfig): Promise<void> {
  // Remove existing effect first (recreate is simple and ensures fresh state)
  await removeEffectForItem(item.id);

  if (!config.e) {
    // Disabled — just remove, don't recreate
    return;
  }

  const effect = buildAuroraEffect(item, config);
  await OBR.scene.local.addItems([effect]);
}

/**
 * Reconcile all Aurora effects with the current scene state.
 * Called on scene ready and whenever items change.
 *
 * Scans ALL items on the MAP layer (not just images) for Aurora config.
 */
async function reconcileEffects(items: Item[]): Promise<void> {
  const existingEffects = await findAllEffects();

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

  // Remove effects for items that no longer have Aurora config
  const toRemove = existingEffects.filter(
    (e) => !auroraItems.has(e.metadata[effectSourceKey()] as string)
  );
  if (toRemove.length > 0) {
    await OBR.scene.local.deleteItems(toRemove.map((e) => e.id));
  }

  // Create or update effects for items that have Aurora config
  for (const [, { item, config }] of auroraItems) {
    await syncEffectForItem(item, config);
  }
}

/** Start the effect manager.
 *  Watches for scene item changes and manages local effects accordingly.
 *  Returns a cleanup function. */
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
