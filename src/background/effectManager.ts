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

import OBR, { buildEffect, Effect, Item, isShape } from "@owlbear-rodeo/sdk";
import { getShaderCode, getShaderUniforms, ShaderGeometry, SHAPE_TYPE_RECT, SHAPE_TYPE_CIRCLE, SHAPE_TYPE_TRIANGLE, SHAPE_TYPE_HEXAGON } from "../shared/shader";
import { AuroraConfig, isAuroraConfig } from "../shared/types";
import { CONFIG_KEY, EFFECT_META_KEY, EFFECT_SOURCE_KEY } from "../shared/keys";

// ── Effect Snapshot Cache ─────────────────────────────────────────
//
// Maps source-item ID → a snapshot string of all properties that feed
// into the local effect (Aurora config + parent transform). On each
// reconcile pass we compare the current snapshot against the cached one;
// if they match we skip the item, avoiding needless delete-then-add
// cycles. This means scale, position, rotation, and visibility changes
// on the parent item will also trigger an effect rebuild.
//
// NOTE: item.zIndex is deliberately excluded. OBR auto-bumps zIndex
// when items are moved or selected, which would cause constant effect
// rebuilds and z-index drift. The effect's z-index is set once at
// creation via getLayerZIndex() and stays stable thereafter.
// disableAutoZIndex on the effect prevents OBR from overriding it.

const snapshotCache = new Map<string, string>();

/** Serialise Aurora config + parent transform into a stable comparison key */
function effectSnapshot(config: AuroraConfig, item: Item): string {
  const strokeWidth = isShape(item) ? (item.style.strokeWidth ?? 0) : 0;
  const shapeW = isShape(item) ? item.width : 0;
  const shapeH = isShape(item) ? item.height : 0;
  const shapeType = isShape(item) ? item.shapeType : "";
  return [
    config.s, config.l, config.h, config.o, config.e, config.b ?? 0,
    config.f ?? 0, config.fi ?? false,
    item.position.x, item.position.y,
    item.rotation,
    item.scale.x, item.scale.y,
    item.visible,
    item.layer,
    item.type, shapeType, strokeWidth, shapeW, shapeH,
  ].join("|");
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
  snapshotCache.clear();
}

// ── Coordinate Offset ─────────────────────────────────────────────

/**
 * Compute a coordinate offset to correct the shader's screen-space
 * mapping for non-image items.
 *
 * BACKGROUND:
 * The ATTACHMENT effect auto-fills the parent's bounding box as
 * reported by OBR. For Images, this aligns with the modelView
 * transform — no correction needed.
 *
 * For Shapes, two sources of offset exist:
 *
 *   1. VARIABLE: The bounding box includes the stroke width. We
 *      measure this via getItemBounds(), comparing bounds.min to
 *      the shape's centre position.
 *
 *   2. FIXED: getItemBounds() returns a box LARGER than the actual
 *      ATTACHMENT fill area (it includes selection handle padding
 *      that the ATTACHMENT does not). We subtract this excess
 *      from the bounds-derived offset.
 *
 * Different shape types have different internal origins relative to
 * their bounding box. We apply per-shape-type corrections expressed
 * as multipliers of the shape's width and height, plus the common
 * bounds excess.
 *
 * SHAPE ORIGIN CORRECTIONS (measured empirically):
 *   RECTANGLE: origin at centre — no dimension correction needed
 *   CIRCLE:    origin at top-left of bounding ellipse — +1× w, +1× h
 *   TRIANGLE:  origin at top of bounding box — +1× w, no y correction
 *   HEXAGON:   pointy-top; x = sqrt(3)/2 × w (flat-to-flat), y = 1× h
 *
 * All shapes share the same bounds excess of 12 scene units, which
 * accounts for selection handle padding in getItemBounds().
 */

interface ShapeCorrection {
  excess: number;  // Bounds excess to subtract (handle padding)
  mx: number;      // Width multiplier for x offset
  my: number;      // Height multiplier for y offset
}

/** Bounds excess common to all shape types (selection handle padding) */
const SHAPE_BOUNDS_EXCESS = 12;

// ── Layer-based Z-Index ───────────────────────────────────────────
//
// POST_PROCESS effects from different parent layers all share a single
// z-space. Without intervention OBR assigns z-indices that reflect only
// the item's position within its own layer, so a MAP shader that is
// moved (and therefore gets a high auto-z) could render on top of a
// PROP or CHARACTER shader.
//
// We divide the safe-integer range into equal bands — one per layer —
// and map each effect's z-index into the band for its parent's layer:
//
//   zIndex = layerPriority * LAYER_BAND_SIZE + (parent.zIndex % LAYER_BAND_SIZE)
//
// LAYER_BAND_SIZE ≈ 600 trillion, which is far larger than any zIndex
// OBR assigns (observed values reach ~1.77 trillion). The modulo keeps
// the parent's z-order within the band, preserving relative ordering of
// effects whose parents share a layer.
//
// disableAutoZIndex is set on the effect so OBR does not reassign it.

/** Natural bottom-to-top rendering order for all OBR canvas layers */
const LAYER_PRIORITY: Partial<Record<string, number>> = {
  MAP:          0,
  GRID:         1,
  DRAWING:      2,
  PROP:         3,
  MOUNT:        4,
  CHARACTER:    5,
  ATTACHMENT:   6,
  NOTE:         7,
  TEXT:         8,
  RULER:        9,
  FOG:         10,
  POINTER:     11,
  POST_PROCESS:12,
  CONTROL:     13,
  POPOVER:     14,
};

/** Number of layer priority levels (must match the highest value in LAYER_PRIORITY + 1) */
const LAYER_COUNT = 15;

/** Size of each layer's z-index band (≈ 600 trillion) */
const LAYER_BAND_SIZE = Math.floor(Number.MAX_SAFE_INTEGER / LAYER_COUNT);

/**
 * Compose a z-index for a POST_PROCESS effect that encodes both the
 * parent item's canvas layer and its within-layer z-order.
 * MAP-parent effects always render below PROP-parent effects, etc.
 *
 * The parent's zIndex is mapped into the layer's band via modulo,
 * so even very large OBR-assigned z-indices (observed up to ~1.77T)
 * are handled correctly without overflowing into adjacent bands.
 */
function getLayerZIndex(parent: Item): number {
  const priority = LAYER_PRIORITY[parent.layer] ?? 0;
  const withinBand = ((parent.zIndex % LAYER_BAND_SIZE) + LAYER_BAND_SIZE) % LAYER_BAND_SIZE;
  return priority * LAYER_BAND_SIZE + withinBand;
}

const SHAPE_CORRECTIONS: Record<string, ShapeCorrection> = {
  RECTANGLE: { excess: SHAPE_BOUNDS_EXCESS, mx: 0,     my: 0 },
  CIRCLE:    { excess: SHAPE_BOUNDS_EXCESS, mx: 1,     my: 1 },
  TRIANGLE:  { excess: SHAPE_BOUNDS_EXCESS, mx: 1,     my: 0 },
  HEXAGON:   { excess: SHAPE_BOUNDS_EXCESS, mx: 0.866, my: 1 },  // sqrt(3)/2 ≈ 0.866
};

/** Map OBR shapeType strings to shader shapeType indices */
function getShapeTypeIndex(item: Item): number {
  if (!isShape(item)) return SHAPE_TYPE_RECT;
  switch (item.shapeType) {
    case "CIRCLE":    return SHAPE_TYPE_CIRCLE;
    case "TRIANGLE":  return SHAPE_TYPE_TRIANGLE;
    case "HEXAGON":   return SHAPE_TYPE_HEXAGON;
    default:          return SHAPE_TYPE_RECT;
  }
}

/**
 * Compute the full shader geometry for an item: coordinate offset,
 * attachment bounds size, and shape type index.
 */
async function getShaderGeometry(item: Item): Promise<ShaderGeometry> {
  const shapeType = getShapeTypeIndex(item);

  if (isShape(item)) {
    try {
      const bounds = await OBR.scene.items.getItemBounds([item.id]);
      const obrShapeType = item.shapeType ?? "RECTANGLE";
      const corr = SHAPE_CORRECTIONS[obrShapeType] ?? SHAPE_CORRECTIONS.RECTANGLE;

      const coordOffset = {
        x: -(item.position.x - bounds.min.x - corr.excess) + corr.mx * item.width,
        y: -(item.position.y - bounds.min.y - corr.excess) + corr.my * item.height,
      };

      // Shader coord space size for feather calculations.
      // The ATTACHMENT fill area extends corr.excess beyond the getItemBounds()
      // box on each side (the inverse of the excess subtracted in coordOffset),
      // so we add 2 * corr.excess to recover the true coord-space extent that
      // the feather mask halfSize must be based on.
      const itemSize = {
        x: bounds.max.x - bounds.min.x + 2 * corr.excess,
        y: bounds.max.y - bounds.min.y + 2 * corr.excess,
      };

      // shapeSize: the actual visual dimensions of the shape, used by
      // hex/triangle SDFs in the feather mask. Rectangles and circles
      // fill their full attachment bounds so shapeSize = itemSize.
      // Hexagons are regular (all sides equal) and inscribed within
      // item.width × item.height, so their visual extent differs from
      // the attachment bounds (which include stroke + excess padding).
      let shapeSize = itemSize;
      if (obrShapeType === "HEXAGON") {
        // Pointy-top regular hex: circumradius = height/2,
        // inradius = circumradius × sqrt(3)/2
        const circumR = item.height / 2;
        const inR = circumR * Math.sqrt(3) / 2;
        shapeSize = { x: inR * 2, y: circumR * 2 };
      } else if (obrShapeType === "TRIANGLE") {
        // Isoceles triangle fills item.width × item.height
        shapeSize = { x: item.width, y: item.height };
      }

      return { coordOffset, itemSize, shapeSize, shapeType };
    } catch {
      return { coordOffset: { x: 0, y: 0 }, itemSize: { x: 1, y: 1 }, shapeSize: { x: 1, y: 1 }, shapeType };
    }
  }

  // Images: no coord offset needed; use image dimensions for feather
  // Images have a grid with dpi and offset but the attachment fills
  // the rendered bounds. We use getItemBounds for consistency.
  try {
    const bounds = await OBR.scene.items.getItemBounds([item.id]);
    const size = {
      x: bounds.max.x - bounds.min.x,
      y: bounds.max.y - bounds.min.y,
    };
    return {
      coordOffset: { x: 0, y: 0 },
      itemSize: size,
      shapeSize: size,
      shapeType,
    };
  } catch {
    return { coordOffset: { x: 0, y: 0 }, itemSize: { x: 1, y: 1 }, shapeSize: { x: 1, y: 1 }, shapeType };
  }
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
 * 2. SCALE: must be parent.scale
 *    The modelView matrix must incorporate the parent's scale so that the
 *    shader's coordinate-to-screen mapping matches the actual rendered size
 *    of the parent item (e.g. when the user resizes via "Align Image").
 *
 * 3. WIDTH/HEIGHT: not set
 *    ATTACHMENT effects auto-fill the parent item's display bounds.
 *
 * 4. LAYER: POST_PROCESS
 *    Required for access to the `uniform shader scene` built-in, which
 *    lets the shader sample the current rendered scene colour at each pixel.
 *
 * 5. Z-INDEX: layerPriority × LAYER_BAND_SIZE + (parent.zIndex % LAYER_BAND_SIZE)
 *    All Aurora effects share the POST_PROCESS z-space. The safe-integer
 *    range is divided into equal bands per layer so that MAP-parent
 *    shaders always render below PROP-parent shaders, etc., even when
 *    parent z-indices are very large (observed up to ~1.77 trillion).
 *    disableAutoZIndex prevents OBR from overriding this value when
 *    items are moved. The snapshot includes both layer and zIndex so
 *    any change to either triggers an effect rebuild.
 *
 * 6. disableAttachmentBehavior(["COPY"])
 *    Local items (effects) must not be copied when the parent is duplicated;
 *    the effect manager will create new effects for any new items that have
 *    Aurora config in their metadata.
 *
 * 7. COORD OFFSET: passed as a shader uniform (see getCoordOffset)
 *    Shapes include stroke width in their ATTACHMENT bounds, creating a
 *    small positional offset. The shader adds this offset to local coords
 *    before transforming to screen-space.
 */
async function buildAuroraEffect(parent: Item, config: AuroraConfig): Promise<Effect> {
  const effect = buildEffect()
    .attachedTo(parent.id)
    .effectType("ATTACHMENT")
    .position(parent.position)
    .rotation(parent.rotation)
    .scale(parent.scale)
    .visible(parent.visible)
    .zIndex(getLayerZIndex(parent))
    .locked(true)
    .disableHit(true)
    .disableAttachmentBehavior(["COPY"])
    .build();

  // Set shader properties directly on the built object (not via builder)
  effect.sksl = getShaderCode();
  effect.uniforms = getShaderUniforms(config, await getShaderGeometry(parent));

  effect.layer = "POST_PROCESS";
  // Prevent OBR's auto-z-index from overriding the layer-composed value set above
  effect.disableAutoZIndex = true;

  // Tag with metadata so we can find/manage this effect later
  effect.metadata = {
    [EFFECT_META_KEY]: true,
    [EFFECT_SOURCE_KEY]: parent.id,
  };

  return effect;
}

// ── Reconciliation ────────────────────────────────────────────────

/**
 * Re-entrancy guard: if a reconcile is already in progress when a new
 * onChange fires, we stash the latest items and run one more pass after
 * the current one finishes. This prevents overlapping SDK calls without
 * dropping the most recent state.
 */
let reconciling = false;
let pendingItems: Item[] | null = null;

/**
 * Reconcile all Aurora effects with the current scene state.
 * Called on scene ready and whenever items change.
 *
 * Uses a config snapshot cache to skip items whose config hasn't changed
 * since the last pass, and batches all SDK add/delete calls.
 */
async function reconcileEffects(items: Item[]): Promise<void> {
  if (reconciling) {
    pendingItems = items;
    return;
  }
  reconciling = true;

  try {
    const existingEffects = await findAllEffects();

    // Build a lookup of existing effects by source item ID
    const effectsBySource = new Map<string, Item>();
    for (const e of existingEffects) {
      const sourceId = e.metadata[EFFECT_SOURCE_KEY] as string | undefined;
      if (sourceId) {
        effectsBySource.set(sourceId, e);
      }
    }

    // Items that should have effects — any item with Aurora config, regardless
    // of layer. "Add Aurora" is restricted to MAP-layer items in the context
    // menu (giving GM-only access by default), but once added the effect
    // persists if the item is later moved to another layer (e.g. Prop).
    const auroraItems = new Map<string, { item: Item; config: AuroraConfig }>();
    for (const item of items) {
      const config = item.metadata[CONFIG_KEY];
      if (isAuroraConfig(config)) {
        auroraItems.set(item.id, { item, config });
      }
    }

    // ── Determine which effects to remove ───────────────────────

    const idsToRemove: string[] = [];

    for (const [sourceId, effectItem] of effectsBySource) {
      if (!auroraItems.has(sourceId)) {
        // Source item no longer has Aurora config — remove its effect
        idsToRemove.push(effectItem.id);
        snapshotCache.delete(sourceId);
      }
    }

    // ── Determine which effects to create / recreate ────────────

    // Collect items that need new effects, then build them in parallel
    const toBuild: Array<{ itemId: string; item: Item; config: AuroraConfig; snap: string }> = [];

    for (const [itemId, { item, config }] of auroraItems) {
      const snap = effectSnapshot(config, item);
      const cached = snapshotCache.get(itemId);

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
        toBuild.push({ itemId, item, config, snap });
      }

      // Update cache (even for disabled configs, so we don't keep
      // trying to recreate them on every reconcile)
      snapshotCache.set(itemId, snap);
    }

    // Build all new effects in parallel (each calls getItemBounds)
    const effectsToAdd = await Promise.all(
      toBuild.map(({ item, config }) => buildAuroraEffect(item, config))
    );

    // ── Execute batched SDK operations ──────────────────────────

    if (idsToRemove.length > 0) {
      await OBR.scene.local.deleteItems(idsToRemove);
    }

    if (effectsToAdd.length > 0) {
      await OBR.scene.local.addItems(effectsToAdd);
    }
  } catch (err) {
    console.error("Aurora: reconcileEffects failed, will retry on next change", err);
  } finally {
    reconciling = false;
    if (pendingItems) {
      const next = pendingItems;
      pendingItems = null;
      reconcileEffects(next);
    }
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
