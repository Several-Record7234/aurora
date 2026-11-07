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

import OBR, { buildEffect, Effect, Item, isShape, isPath } from "@owlbear-rodeo/sdk";
import type { Curve, Path, Shape, Vector2 } from "@owlbear-rodeo/sdk";
import {
  getShaderCode,
  getShaderUniforms,
  getPolygonShaderCode,
  getPolygonShaderUniforms,
  POLYGON_MAX_VERTICES,
  ShaderGeometry,
  SHAPE_TYPE_RECT,
  SHAPE_TYPE_CIRCLE,
  SHAPE_TYPE_TRIANGLE,
  SHAPE_TYPE_HEXAGON,
} from "../shared/shader";
import { AuroraConfig, isAuroraConfig } from "../shared/types";
import { CONFIG_KEY, EFFECT_META_KEY, EFFECT_SOURCE_KEY, LUMA_KEY } from "../shared/keys";
import {
  extractPathVertices,
  tessellatePathCurve,
  cleanAndSimplify,
  computeInradius,
  recentre,
  aabbCentre,
  hashVertices,
  polygonCoordOffset,
  maxOutsideDistance,
} from "./polygonGeometry";

/** True iff this item is a candidate polygon host (PATH or closed CURVE). */
function isPolygonHost(item: Item): boolean {
  if (isPath(item)) return true;
  if (item.type === "CURVE") {
    const curve = item as Curve;
    return curve.style?.closed === true;
  }
  return false;
}

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

// ── Inradius cache (polygon hosts) ──────────────────────────────────────────
//
// computeInradius costs ~12 ms at N=24 (see progress.md Q3). It only changes
// when the polygon's vertices change, so we cache by a hash of the shader-
// local vertex list. Cache key = hashVertices(shaderLocalVerts). Cache
// lifetime is the process — cleared when the scene closes alongside the
// snapshot cache. A reshape produces a different hash and naturally evicts
// the old entry.
const inradiusCache = new Map<string, number>();

function getCachedInradius(verts: Vector2[]): number {
  const key = hashVertices(verts);
  const hit = inradiusCache.get(key);
  if (hit !== undefined) return hit;
  const r = computeInradius(verts);
  inradiusCache.set(key, r);
  return r;
}

// Self-intersect warning de-dup. Without this, a slider drag on a bow-tie
// polygon would re-fire the notification on every reconcile pass. The set is
// cleared alongside snapshotCache on scene close so re-opening the scene
// re-warns the user.
const warnedSelfIntersect = new Set<string>();

function notifySelfIntersect(itemId: string): void {
  if (warnedSelfIntersect.has(itemId)) return;
  warnedSelfIntersect.add(itemId);
  OBR.notification.show(
    "Aurora: polygon self-intersects — only the largest enclosed region is affected.",
    "WARNING",
  );
}

/** Serialise Aurora config + parent transform into a stable comparison key.
 *
 * For PATH and CURVE hosts a geometry fingerprint is included so that
 * reshaping the polygon (without changing position/rotation/scale) still
 * triggers a rebuild of the baked-vertex shader. JSON.stringify of the
 * commands or points array is the cheapest correct option — typical
 * freehand strokes have a few hundred commands, well below the cost of
 * a single getItemBounds round-trip. */
function effectSnapshot(config: AuroraConfig, item: Item): string {
  const strokeWidth = isShape(item) || isPolygonHost(item)
    ? ((item as Path | Curve).style?.strokeWidth ?? 0)
    : 0;
  const shapeW = isShape(item) ? item.width : 0;
  const shapeH = isShape(item) ? item.height : 0;
  const shapeType = isShape(item) ? item.shapeType : "";

  let geometryFp = "";
  if (isPath(item)) {
    geometryFp = JSON.stringify((item as Path).commands);
  } else if (item.type === "CURVE") {
    const curve = item as Curve;
    geometryFp =
      JSON.stringify(curve.points) +
      "|" + (curve.style?.tension ?? 0) +
      "|" + (curve.style?.closed ?? false);
  }
  // Fill on/off switches the coordOffset excess (see drawnHostExcess).
  if (isShape(item) || isPolygonHost(item)) {
    geometryFp += "|" + (((item as Shape | Path | Curve).style?.fillOpacity ?? 0) > 0);
  }

  return JSON.stringify([
    config.s, config.l, config.h, config.o, config.e, config.b ?? 0,
    config.f ?? 0, config.fi ?? false, config.d ?? 0,
    typeof item.metadata[LUMA_KEY] === "number" ? item.metadata[LUMA_KEY] : 0.7,
    item.position.x, item.position.y,
    item.rotation,
    item.scale.x, item.scale.y,
    item.visible,
    item.layer,
    item.type, shapeType, strokeWidth, shapeW, shapeH,
    geometryFp,
  ]);
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
  inradiusCache.clear();
  warnedSelfIntersect.clear();
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
 * All shapes share the same bounds excess, which depends on fill: see
 * drawnHostExcess.
 */

interface ShapeCorrection {
  mx: number;      // Width multiplier for x offset
  my: number;      // Height multiplier for y offset
}

/** Bounds excess for an UNFILLED drawn host, measured on canvas. Why it is
 *  12 is not established; see drawnHostExcess for the filled case. */
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

/**
 * Bounds excess for a drawn host (SHAPE, CURVE or PATH). SHAPE_BOUNDS_EXCESS
 * holds only while the host is unfilled: with any fill opacity, every drawn
 * type (all four SHAPE types, CURVE and PATH) sampled ~(12 - strokeWidth/2)
 * up-left of true in its own frame, and is aligned with half its stroke
 * (canvas, 2026-11-07, strokes 0 to max, filled and unfilled).
 */
function drawnHostExcess(item: Item): number {
  const style = (item as Shape | Path | Curve).style;
  return (style?.fillOpacity ?? 0) > 0
    ? (style?.strokeWidth ?? 0) / 2
    : SHAPE_BOUNDS_EXCESS;
}

const SHAPE_CORRECTIONS: Record<string, ShapeCorrection> = {
  RECTANGLE: { mx: 0,     my: 0 },
  CIRCLE:    { mx: 1,     my: 1 },
  TRIANGLE:  { mx: 1,     my: 0 },
  HEXAGON:   { mx: 0.866, my: 1 },  // sqrt(3)/2 ≈ 0.866
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
      const excess = drawnHostExcess(item);

      const coordOffset = {
        x: -(item.position.x - bounds.min.x - excess) + corr.mx * item.width,
        y: -(item.position.y - bounds.min.y - excess) + corr.my * item.height,
      };

      // Shader coord space size for feather calculations.
      // The ATTACHMENT fill area extends the excess beyond the getItemBounds()
      // box on each side (the inverse of the excess subtracted in coordOffset),
      // so we add 2 * excess to recover the true coord-space extent that
      // the feather mask halfSize must be based on.
      const itemSize = {
        x: bounds.max.x - bounds.min.x + 2 * excess,
        y: bounds.max.y - bounds.min.y + 2 * excess,
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

// ── Polygon (PATH / CURVE) shader geometry ─────────────────────────────────

interface PolygonShaderGeometry {
  coordOffset: Vector2;
  boundsCenter: Vector2;
  polyCentre: Vector2;
  shaderLocalVerts: Vector2[];
  inradius: number;
  inflate: number;
}

/**
 * Extract polygon shader inputs for a PATH or closed CURVE host.
 *
 * Pipeline:
 *   1. Flatten commands / tessellate spline to world-space vertices.
 *   2. Clean (Clipper offset=0) and simplify to <= POLYGON_MAX_VERTICES.
 *   3. Look up world-space AABB via OBR.scene.items.getItemBounds (this
 *      already accounts for item position/rotation/scale).
 *   4. Compute coordOffset from the item-local verts (see
 *      polygonCoordOffset for what has and has not been verified).
 *   5. Transform vertices into the shader's correctedCoord frame.
 *   6. Look up or compute the inradius (cached by vertex hash; ~12 ms cold,
 *      free on cache hit).
 *
 * Returns null if extraction or simplification leaves fewer than 3 vertices,
 * or if the item is an open CURVE (no enclosed area).
 *
 * Vertices are extracted in item-local (pre-rotation, pre-scale, pre-position)
 * coordinates so the shader's `coord` (which OBR delivers in the same item-
 * local frame) lines up regardless of parent.rotation. polyCentre is the AABB
 * centre of the item-local verts and is rotation-invariant; subtracting it
 * from coord in the shader puts the SDF eval point in vert-relative space.
 *
 * Effect.position still uses the world bounds.center so OBR positions the
 * ATTACHMENT visually over the rotated polygon.
 */
async function getPolygonShaderGeometry(
  item: Item,
): Promise<PolygonShaderGeometry | null> {
  let localVerts: Vector2[];

  if (isPath(item)) {
    const path = item as Path;
    localVerts = extractPathVertices(path.commands);
  } else if (item.type === "CURVE") {
    const curve = item as Curve;
    if (curve.style?.closed !== true) return null;
    localVerts = tessellatePathCurve(
      curve.points,
      curve.style?.tension ?? 0,
    );
  } else {
    return null;
  }
  if (localVerts.length < 3) return null;

  const { vertices: simplified, rings } = cleanAndSimplify(
    localVerts,
    POLYGON_MAX_VERTICES,
  );
  if (simplified.length < 3) return null;
  if (rings > 1) notifySelfIntersect(item.id);

  let bounds;
  try {
    bounds = await OBR.scene.items.getItemBounds([item.id]);
  } catch {
    return null;
  }

  const boundsCenter = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
  };
  // Only affects where scene.eval samples; the feather mask uses raw `coord`.
  // Computed from the item-local verts, not the world bounds, so it holds
  // under rotation (see polygonCoordOffset). The excess depends on fill
  // (see drawnHostExcess).
  const coordOffset = polygonCoordOffset(localVerts, drawnHostExcess(item));

  // polyCentre lives in the item-local frame (rotation-invariant) so the
  // shader can subtract it from `coord` (also item-local) and land in the
  // vert frame at any parent.rotation.
  const localCentre = aabbCentre(simplified);

  const shaderLocalVerts = recentre(simplified, localCentre);
  const inradius = getCachedInradius(shaderLocalVerts);

  // Grow the mask to contain the true outline, so the chords cut no
  // ungraded slivers inside convex bulges. Safe because OBR clips an
  // ATTACHMENT's output to a CURVE or PATH host's outline (canvas-verified
  // 2026-11-07), so the excess never shows. Skipped for self-intersecting
  // input: the discarded lobes' points would inflate it by their full size.
  const inflate = rings > 1 ? 0 : maxOutsideDistance(localVerts, simplified);

  return {
    coordOffset,
    boundsCenter,
    polyCentre: localCentre,
    shaderLocalVerts,
    inradius,
    inflate,
  };
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
async function buildAuroraEffect(
  parent: Item,
  config: AuroraConfig,
): Promise<Effect | null> {
  const rawLuma = parent.metadata[LUMA_KEY];
  const bloomThreshold =
    typeof rawLuma === "number" && rawLuma > 0 ? rawLuma : 0.7;

  // ── PATH / CURVE polygon host ──
  // Per Flicker (c:\Coding\Flicker\src\background\effectManager.ts:247) the
  // effect is positioned at the world AABB centre, rotated by parent rotation
  // and built at unit scale; ATTACHMENT auto-fill then matches the polygon's
  // bounding rectangle. SCALE is inherited (unlike Flicker) so the fill tracks
  // a live resize: dragging a max-x/max-y edge stays aligned, a min-edge drag
  // still drifts until the rebuild on release (canvas-tested 2026-11-07).
  if (isPolygonHost(parent)) {
    const polyGeom = await getPolygonShaderGeometry(parent);
    if (!polyGeom) return null;

    const effect = buildEffect()
      .attachedTo(parent.id)
      .effectType("ATTACHMENT")
      .position(polyGeom.boundsCenter)
      .rotation(parent.rotation)
      .scale({ x: 1, y: 1 })
      .visible(parent.visible)
      .zIndex(getLayerZIndex(parent))
      .locked(true)
      .disableHit(true)
      .disableAttachmentBehavior(["COPY"])
      .build();

    effect.sksl = getPolygonShaderCode({
      vertices: polyGeom.shaderLocalVerts,
      inradius: polyGeom.inradius,
      inflate: polyGeom.inflate,
      polyCentre: polyGeom.polyCentre,
    });
    effect.uniforms = getPolygonShaderUniforms(
      config,
      polyGeom.coordOffset,
      bloomThreshold,
    );
    effect.layer = "POST_PROCESS";
    effect.disableAutoZIndex = true;
    effect.metadata = {
      [EFFECT_META_KEY]: true,
      [EFFECT_SOURCE_KEY]: parent.id,
    };
    return effect;
  }

  // ── IMAGE / SHAPE host (original path) ──
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

  effect.sksl = getShaderCode();
  effect.uniforms = getShaderUniforms(
    config,
    await getShaderGeometry(parent),
    bloomThreshold,
  );

  effect.layer = "POST_PROCESS";
  effect.disableAutoZIndex = true;

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

    const idsToRemove = new Set<string>();

    for (const [sourceId, effectItem] of effectsBySource) {
      if (!auroraItems.has(sourceId)) {
        // Source item no longer has Aurora config — remove its effect
        idsToRemove.add(effectItem.id);
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
      if (existing && !idsToRemove.has(existing.id)) {
        idsToRemove.add(existing.id);
      }

      if (config.e) {
        toBuild.push({ itemId, item, config, snap });
      }

      // Update cache (even for disabled configs, so we don't keep
      // trying to recreate them on every reconcile)
      snapshotCache.set(itemId, snap);
    }

    // Build all new effects in parallel (each calls getItemBounds).
    // buildAuroraEffect returns null for unbuildable polygon hosts (open
    // curves, sub-3-vertex paths); filter those out before submitting.
    const builtMaybe = await Promise.all(
      toBuild.map(({ item, config }) => buildAuroraEffect(item, config))
    );
    const effectsToAdd: Effect[] = builtMaybe.filter(
      (e): e is Effect => e !== null,
    );

    // ── Execute batched SDK operations ──────────────────────────

    if (idsToRemove.size > 0) {
      await OBR.scene.local.deleteItems([...idsToRemove]);
    }

    if (effectsToAdd.length > 0) {
      await OBR.scene.local.addItems(effectsToAdd);
    }
  } catch (err) {
    console.error("Aurora: reconcileEffects failed, will retry on next change", err);
    OBR.notification.show("Aurora: effect update failed — will retry on next change", "WARNING");
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
