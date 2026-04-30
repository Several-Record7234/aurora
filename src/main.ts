/**
 * Aurora – action popover entry point (index.html).
 *
 * This is the UI shown when the user clicks the Aurora icon in the
 * top-left extension tray. It displays the Preset Library: a 2×3 grid
 * of saved colour-grading snapshots that can be renamed or cleared.
 *
 * Presets are read from and written to room metadata (via shared/presets.ts)
 * so they are visible to all players in the room.
 */

import OBR, { Item, isImage, isShape } from "@owlbear-rodeo/sdk";
import {
  Presets,
  isPresets,
  isAuroraConfig,
  EMPTY_PRESETS,
  MAX_NAME_LENGTH,
  BLEND_MODES,
  truncatePresetName,
} from "./shared/types";
import { loadPresets, savePresets, clearPresetSlot, getPresetsKey } from "./shared/presets";
import { CONFIG_KEY } from "./shared/keys";
import { applyTheme } from "./shared/theme";
import { changelog, getUnseenEntries } from "./changelog";

/** Dimensions of the action popover (pixels) */
const POPOVER_WIDTH = 350;
const POPOVER_HEIGHT = 680;

/** Approximate height of the Help section (pixels) */
const HELP_SECTION_HEIGHT = 100;
/** Approximate height of the Scene Items section (pixels) */
const SCENE_ITEMS_SECTION_HEIGHT = 100;

// ── OBR Connection Timeout ────────────────────────────────────────

const OBR_TIMEOUT_MS = 10_000;
const CONNECTION_ERROR_MSG =
  "Unable to connect to Owlbear Rodeo. Please try closing and reopening Aurora.";

function showConnectionError(): void {
  const container = document.querySelector(".container");
  if (container) {
    container.innerHTML = `<p style="padding:24px;text-align:center;color:var(--text-secondary);font-size:14px;">${CONNECTION_ERROR_MSG}</p>`;
  }
}

// ── State ─────────────────────────────────────────────────────────

let presets: Presets = [...EMPTY_PRESETS];

/** Current interaction mode: null = idle, "rename" or "clear" = awaiting preset click */
let activeMode: "rename" | "clear" | null = null;

// ── Scene Item List State (GM only) ───────────────────────────────

interface SceneItemData {
  id: string;
  label: string;
  enabled: boolean;
  thumbType: "IMAGE" | "SHAPE" | "OTHER";
  imageUrl?: string;
  shapeType?: string;
}

/** Extract display data (label + thumbnail + enabled state) from an OBR scene item. */
function extractItemData(item: Item): SceneItemData {
  const label = item.name.trim() || `${item.layer} ${item.type}`;
  const config = item.metadata[CONFIG_KEY];
  const enabled = isAuroraConfig(config) ? config.e : true;
  if (isImage(item)) {
    return { id: item.id, label, enabled, thumbType: "IMAGE", imageUrl: item.image.url };
  }
  if (isShape(item)) {
    return { id: item.id, label, enabled, thumbType: "SHAPE", shapeType: item.shapeType };
  }
  return { id: item.id, label, enabled, thumbType: "OTHER" };
}

let isGM = false;
let helpCollapsed = false;
let presetsCollapsed = false;
let auroraSceneItems: SceneItemData[] = [];
let itemsCollapsed = true;
let unsubSceneItems: (() => void) | null = null;
let unsubSceneReady: (() => void) | null = null;

/**
 * Shape of the persisted UI collapse state.
 * Stored in localStorage keyed by room ID so each player retains their own
 * preferences independently (room metadata would share state across all players).
 */
interface UIState {
  helpCollapsed: boolean;
  presetsCollapsed: boolean;
  itemsCollapsed: boolean;
}

function isUIState(v: unknown): v is UIState {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.helpCollapsed === "boolean" &&
    typeof o.presetsCollapsed === "boolean" &&
    typeof o.itemsCollapsed === "boolean"
  );
}

/** localStorage key for this room's UI state, scoped by room ID */
function getUIStateStorageKey(): string {
  return `aurora-uiState-${OBR.room.id}`;
}

/** Persist the current collapsed states to localStorage (per-player, per-room). */
function saveUIState(): void {
  const state: UIState = { helpCollapsed, presetsCollapsed, itemsCollapsed };
  try {
    localStorage.setItem(getUIStateStorageKey(), JSON.stringify(state));
  } catch {
    // localStorage may be unavailable in some iframe contexts — silently degrade
  }
}

/** Load persisted collapsed states from localStorage. */
function loadUIState(): UIState | null {
  try {
    const raw = localStorage.getItem(getUIStateStorageKey());
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isUIState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Apply collapsed states to the DOM elements.
 * Called once after loading persisted state and on each toggle.
 */
function applyCollapsedStates(): void {
  const helpBody = document.getElementById("helpBody");
  const helpChevron = document.getElementById("helpChevron");
  const helpHeader = document.getElementById("helpHeader");
  if (helpBody) helpBody.style.display = helpCollapsed ? "none" : "";
  if (helpChevron) helpChevron.classList.toggle("collapsed", helpCollapsed);
  if (helpHeader) helpHeader.setAttribute("aria-expanded", String(!helpCollapsed));

  const presetsBody = document.getElementById("presetsBody");
  const presetsActions = document.getElementById("presetsActions");
  const presetsChevron = document.getElementById("presetsChevron");
  const presetsHeader = document.getElementById("presetsHeader");
  if (presetsBody) presetsBody.style.display = presetsCollapsed ? "none" : "";
  if (presetsActions) presetsActions.style.display = (presetsCollapsed || !isGM) ? "none" : "";
  if (presetsChevron) presetsChevron.classList.toggle("collapsed", presetsCollapsed);
  if (presetsHeader) presetsHeader.setAttribute("aria-expanded", String(!presetsCollapsed));

  const itemsBody = document.getElementById("sceneItemsBody");
  const itemsChevron = document.getElementById("sceneItemsChevron");
  const itemsHeader = document.getElementById("sceneItemsHeader");
  if (itemsBody) itemsBody.style.display = itemsCollapsed ? "none" : "";
  if (itemsChevron) itemsChevron.classList.toggle("collapsed", itemsCollapsed);
  if (itemsHeader) itemsHeader.setAttribute("aria-expanded", String(!itemsCollapsed));
}

// ── DOM refs ──────────────────────────────────────────────────────

let renameModeBtn: HTMLButtonElement;
let clearModeBtn: HTMLButtonElement;

// ── Mode Management ───────────────────────────────────────────────

function setMode(mode: "rename" | "clear" | null) {
  // If clicking the already-active mode button, cancel
  if (mode === activeMode) {
    activeMode = null;
  } else {
    activeMode = mode;
  }

  // Update button active states
  renameModeBtn.classList.toggle("active", activeMode === "rename");
  renameModeBtn.setAttribute("aria-pressed", String(activeMode === "rename"));
  clearModeBtn.classList.toggle("active", activeMode === "clear");
  clearModeBtn.setAttribute("aria-pressed", String(activeMode === "clear"));

  // Re-render presets with highlight states
  renderPresets();
}

function exitMode() {
  activeMode = null;
  renameModeBtn.classList.remove("active");
  clearModeBtn.classList.remove("active");
  renderPresets();
}

// ── Rendering ─────────────────────────────────────────────────────

function renderPresets() {
  const container = document.getElementById("presetsList");
  if (!container) return;
  container.innerHTML = "";

  presets.forEach((preset, index) => {
    const div = document.createElement("div");
    div.className = "preset-item";

    if (!preset) {
      div.classList.add("empty");
    }

    // Apply highlight classes based on active mode (only to valid targets)
    const isValidTarget = preset !== null;
    if (activeMode === "rename" && isValidTarget) {
      div.classList.add("highlight-rename");
    } else if (activeMode === "clear" && isValidTarget) {
      div.classList.add("highlight-clear");
    }

    // Tint the card background to preview the preset's hue colour.
    // Only applied when opacity (o) is non-zero — pure S/L adjustments
    // with no tint leave the card at the default neutral background.
    // Saturation is scaled by o/100 so high-opacity presets show a
    // more vivid tint while low-opacity ones remain subtle.
    if (preset && preset.o > 0) {
      const cssHue = ((preset.h % 360) + 360) % 360;
      // Base saturation from opacity; s values above 100 (boosted saturation)
      // add extra vibrancy so high-saturation presets like Golden Hour show
      // a richer hue rather than appearing washed out at low opacity.
      const sat = Math.min(60, Math.round((preset.o + Math.max(0, preset.s - 100)) * 0.7));
      // Map preset l (0–200, 100=neutral) to CSS lightness (82%–95%).
      // Darkening presets (l<100) shade toward 82%; brightening (l>100) toward 95%.
      // The asymmetric range keeps legibility since most dark presets cluster 30–80.
      const cssL = preset.l <= 100
        ? Math.round(82 + (preset.l / 100) * 8)
        : Math.round(90 + ((preset.l - 100) / 100) * 5);
      div.style.setProperty("--preset-tint", `hsl(${cssHue}, ${sat}%, ${cssL}%)`);
      // Force dark text on the light tinted background so it stays legible
      // in both OBR light and dark themes (dark mode --text-primary is near-white).
      div.style.setProperty("--preset-text-primary", "#1a1a1a");
      div.style.setProperty("--preset-text-secondary", "#555");
    }

    // Name
    const nameDiv = document.createElement("div");
    nameDiv.className = "preset-name";
    nameDiv.textContent = preset ? truncatePresetName(preset.n) : `Preset ${index + 1}`;

    // Values — displayed in S, L, H, O order with blend mode
    const valuesDiv = document.createElement("div");
    valuesDiv.className = "preset-values";
    if (preset) {
      const blendLabel = BLEND_MODES.find((m) => m.value === (preset.b ?? 3))?.label ?? "Color";
      const featherStr = (preset.f ?? 0) > 0
        ? ` F:${preset.f}%${preset.fi ? "\u21BA" : ""}`
        : "";
      valuesDiv.textContent = `S:${preset.s}% L:${preset.l}% H:${preset.h}\u00B0 O:${preset.o}%${featherStr} \u2022 ${blendLabel}`;
    } else {
      valuesDiv.textContent = "Empty";
    }

    div.appendChild(nameDiv);
    div.appendChild(valuesDiv);

    // Click handler — only active in a mode and only for valid targets
    if (activeMode && isValidTarget) {
      div.addEventListener("click", () => handlePresetClick(index));
    }

    container.appendChild(div);
  });
}

// ── Preset Click Handlers ─────────────────────────────────────────

async function handlePresetClick(index: number) {
  if (!isGM) return;
  if (activeMode === "rename") {
    showRenameDialog(index);
  } else if (activeMode === "clear") {
    try {
      await clearPresetSlot(index);
      presets = await loadPresets();
    } catch {
      OBR.notification.show("Aurora: failed to clear preset", "ERROR");
    }
    exitMode();
  }
}

// ── Rename Dialog ─────────────────────────────────────────────────

function showRenameDialog(index: number) {
  const preset = presets[index];
  if (!preset) return;

  const overlay = document.createElement("div");
  overlay.className = "rename-overlay";

  const dialog = document.createElement("div");
  dialog.className = "rename-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "rename-dialog-heading");

  const heading = document.createElement("h3");
  heading.id = "rename-dialog-heading";
  heading.textContent = "Rename Preset";
  dialog.appendChild(heading);

  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = MAX_NAME_LENGTH;
  input.value = preset.n;
  dialog.appendChild(input);

  const btnRow = document.createElement("div");
  btnRow.className = "rename-dialog-buttons";
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "cancel";
  cancelBtn.textContent = "Cancel";
  const confirmBtn = document.createElement("button");
  confirmBtn.className = "confirm";
  confirmBtn.textContent = "Rename";
  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(confirmBtn);
  dialog.appendChild(btnRow);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });

  const close = () => {
    document.body.removeChild(overlay);
    exitMode();
  };

  const doRename = async () => {
    const name = input.value.trim().substring(0, MAX_NAME_LENGTH) || preset.n;
    presets[index] = { ...preset, n: name };
    try {
      await savePresets(presets);
    } catch {
      OBR.notification.show("Aurora: failed to rename preset", "ERROR");
    }
    close();
  };

  cancelBtn.addEventListener("click", close);
  confirmBtn.addEventListener("click", doRename);

  // Enter key triggers rename
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doRename();
    }
  });

  // Esc key triggers cancel
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });

  // Close on overlay click (outside dialog)
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
}

// ── Scene Item List ───────────────────────────────────────────────

/**
 * Toggle the enabled state of an item's Aurora config.
 * Reads the current config, flips the `e` flag, and writes it back.
 * The onChange subscription will automatically update the list.
 */
async function toggleItemEnabled(itemId: string): Promise<void> {
  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const item of items) {
      const config = item.metadata[CONFIG_KEY];
      if (isAuroraConfig(config)) {
        item.metadata[CONFIG_KEY] = { ...config, e: !config.e };
      }
    }
  });
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Build a 28×28 thumbnail element for a scene item.
 *   IMAGE → <img> with object-fit: cover (from item.image.url)
 *   SHAPE → inline SVG showing the actual shape outline
 *   OTHER → dashed rectangle placeholder
 */
function buildThumb(data: SceneItemData): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "scene-item-thumb";

  // Image thumbnail
  if (data.thumbType === "IMAGE" && data.imageUrl) {
    const img = document.createElement("img");
    img.src = data.imageUrl;
    img.alt = "";
    img.draggable = false;
    wrap.appendChild(img);
    return wrap;
  }

  // SVG icon for shapes and other item types
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 28 28");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  if (data.thumbType === "SHAPE") {
    switch (data.shapeType) {
      case "CIRCLE": {
        const el = document.createElementNS(SVG_NS, "circle");
        el.setAttribute("cx", "14"); el.setAttribute("cy", "14"); el.setAttribute("r", "10");
        svg.appendChild(el);
        break;
      }
      case "TRIANGLE": {
        const el = document.createElementNS(SVG_NS, "polygon");
        el.setAttribute("points", "14,3 25,25 3,25");
        svg.appendChild(el);
        break;
      }
      case "HEXAGON": {
        const el = document.createElementNS(SVG_NS, "polygon");
        el.setAttribute("points", "14,2 24,8 24,20 14,26 4,20 4,8");
        svg.appendChild(el);
        break;
      }
      default: { // RECTANGLE and unknown shapes
        const el = document.createElementNS(SVG_NS, "rect");
        el.setAttribute("x", "4"); el.setAttribute("y", "4");
        el.setAttribute("width", "20"); el.setAttribute("height", "20");
        el.setAttribute("rx", "2");
        svg.appendChild(el);
        break;
      }
    }
  } else {
    // OTHER: dashed rectangle placeholder
    const el = document.createElementNS(SVG_NS, "rect");
    el.setAttribute("x", "4"); el.setAttribute("y", "4");
    el.setAttribute("width", "20"); el.setAttribute("height", "20");
    el.setAttribute("rx", "2"); el.setAttribute("stroke-dasharray", "4 2");
    svg.appendChild(el);
  }

  wrap.appendChild(svg);
  return wrap;
}

function renderSceneItems(): void {
  const list = document.getElementById("sceneItemsList");
  if (!list) return;
  list.innerHTML = "";

  const countBadge = document.getElementById("sceneItemsCount");
  if (countBadge) countBadge.textContent = String(auroraSceneItems.length);

  if (auroraSceneItems.length === 0) {
    const empty = document.createElement("div");
    empty.className = "scene-item-empty";
    empty.textContent = "No Aurora effects in this scene";
    list.appendChild(empty);
    return;
  }

  for (const data of auroraSceneItems) {
    const row = document.createElement("div");
    row.className = "scene-item-row";
    row.title = data.label;

    row.appendChild(buildThumb(data));

    const labelEl = document.createElement("span");
    labelEl.className = "scene-item-label";
    labelEl.textContent = data.label;
    row.appendChild(labelEl);

    // Enable/disable toggle (same visual as context menu's master toggle)
    const toggle = document.createElement("div");
    toggle.className = "scene-item-toggle" + (data.enabled ? " active" : "");
    toggle.title = data.enabled ? "Disable effect" : "Enable effect";
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-checked", String(data.enabled));
    toggle.setAttribute("aria-label", data.enabled ? "Disable Aurora effect" : "Enable Aurora effect");
    const slider = document.createElement("div");
    slider.className = "scene-item-toggle-slider";
    toggle.appendChild(slider);
    toggle.addEventListener("click", (e) => {
      e.stopPropagation(); // Don't trigger row select
      toggleItemEnabled(data.id);
    });
    toggle.addEventListener("dblclick", (e) => {
      e.stopPropagation(); // Don't trigger row viewport-centre
    });
    row.appendChild(toggle);

    // Single click — select the item
    row.addEventListener("click", () => {
      OBR.player.select([data.id], true);
    });

    // Double click — select and centre the viewport on the item
    row.addEventListener("dblclick", async () => {
      OBR.player.select([data.id], true);
      try {
        const bounds = await OBR.scene.items.getItemBounds([data.id]);
        await OBR.viewport.animateToBounds(bounds);
      } catch {
        // Viewport centering failed — selection still worked
      }
    });

    list.appendChild(row);
  }
}

async function loadSceneItems(): Promise<void> {
  try {
    const items = await OBR.scene.items.getItems();
    auroraSceneItems = items
      .filter((item) => isAuroraConfig(item.metadata[CONFIG_KEY]))
      .map(extractItemData);
  } catch {
    auroraSceneItems = [];
  }
  renderSceneItems();
}

function showSceneItemsSection(show: boolean): void {
  const section = document.getElementById("sceneItemsSection");
  if (section) section.style.display = show ? "" : "none";
}

// ── Initialization ────────────────────────────────────────────────

const obrTimeout = setTimeout(showConnectionError, OBR_TIMEOUT_MS);

OBR.onReady(async () => {
  clearTimeout(obrTimeout);

  await Promise.all([
    OBR.action.setHeight(POPOVER_HEIGHT),
    OBR.action.setWidth(POPOVER_WIDTH),
  ]);

  // Apply OBR theme tokens and subscribe to live changes
  const theme = await OBR.theme.getTheme();
  applyTheme(theme);
  const unsubTheme = OBR.theme.onChange(applyTheme);

  // Load persisted UI collapse states from localStorage (per-player, per-room)
  {
    const saved = loadUIState();
    if (saved) {
      helpCollapsed = saved.helpCollapsed;
      presetsCollapsed = saved.presetsCollapsed;
      itemsCollapsed = saved.itemsCollapsed;
    }
    // Defaults (helpCollapsed=false, presetsCollapsed=false, itemsCollapsed=true)
    // are already set in the state declarations above.
    applyCollapsedStates();
  }

  // Collapsible Help section
  document.getElementById("helpHeader")?.addEventListener("click", () => {
    helpCollapsed = !helpCollapsed;
    applyCollapsedStates();
    saveUIState();
  });

  // Collapsible Presets section
  document.getElementById("presetsHeader")?.addEventListener("click", (e) => {
    // Don't collapse when clicking the Rename/Clear action buttons
    if ((e.target as HTMLElement).closest(".presets-actions")) return;
    presetsCollapsed = !presetsCollapsed;
    // Cancel rename/clear mode if collapsing while active
    if (presetsCollapsed && activeMode) exitMode();
    applyCollapsedStates();
    saveUIState();
  });

  // Resolve DOM
  renameModeBtn = document.getElementById("renameModeBtn") as HTMLButtonElement;
  clearModeBtn = document.getElementById("clearModeBtn") as HTMLButtonElement;

  // Mode button listeners
  renameModeBtn.addEventListener("click", () => setMode("rename"));
  clearModeBtn.addEventListener("click", () => setMode("clear"));

  // Load and render presets
  presets = await loadPresets();
  renderPresets();

  // Sync if presets change externally (e.g. saved from a context menu)
  const unsubRoomMeta = OBR.room.onMetadataChange((metadata) => {
    const data = metadata[getPresetsKey()];
    if (isPresets(data)) {
      presets = data;
      renderPresets();
    }
  });

  // ── Scene Item List (GM only) ────────────────────────────────────

  isGM = (await OBR.player.getRole()) === "GM";
  showSceneItemsSection(isGM);

  // Hide "How to Use" section when the player has no MAP layer permissions
  // (the instructions are about right-clicking MAP items, which is irrelevant
  // if the room denies MAP_CREATE and MAP_UPDATE).
  if (!isGM) {
    const permissions = await OBR.room.getPermissions();
    const hasMapAccess = permissions.includes("MAP_CREATE") || permissions.includes("MAP_UPDATE");
    if (!hasMapAccess) {
      const helpSection = document.getElementById("helpHeader")?.parentElement;
      if (helpSection) helpSection.style.display = "none";
    }

    // Hide preset Rename/Clear buttons for non-GMs
    const presetsActions = document.getElementById("presetsActions");
    if (presetsActions) presetsActions.style.display = "none";

    // Shrink the popover — players don't see Help (if no MAP access) or Scene Items
    await OBR.action.setHeight(hasMapAccess
      ? POPOVER_HEIGHT - SCENE_ITEMS_SECTION_HEIGHT
      : POPOVER_HEIGHT - SCENE_ITEMS_SECTION_HEIGHT - HELP_SECTION_HEIGHT);
  }

  // What's New modal helpers — available to all users (link) and GMs (auto-trigger)
  const WHATS_NEW_KEY = "aurora:lastSeenVersion";

  function openWhatsNewModal(lastSeen: string): void {
    OBR.modal.open({
      id: "dev.aurora.whats-new",
      url: `/whats-new.html?lastSeen=${encodeURIComponent(lastSeen)}`,
      width: 340,
      height: 320,
    }).then(() => {
      if (changelog.length > 0) localStorage.setItem(WHATS_NEW_KEY, changelog[0].version);
    }).catch(() => { /* modal already open or OBR unavailable */ });
  }

  document.getElementById("whatsNewLink")?.addEventListener("click", () => {
    openWhatsNewModal("0.0.0");
  });

  if (isGM) {
    // Auto-trigger: show once per version on first GM open after an update
    const lastSeen = localStorage.getItem(WHATS_NEW_KEY);
    if (!lastSeen) {
      // First-time user: record current version so future updates trigger the modal
      if (changelog.length > 0) localStorage.setItem(WHATS_NEW_KEY, changelog[0].version);
    } else if (getUnseenEntries(changelog, lastSeen).length > 0) {
      openWhatsNewModal(lastSeen);
    }

    // Collapse/expand toggle on section header click
    document.getElementById("sceneItemsHeader")?.addEventListener("click", () => {
      itemsCollapsed = !itemsCollapsed;
      applyCollapsedStates();
      saveUIState();
    });

    // Subscribe to scene items when the scene is ready; clean up on scene close
    async function onSceneReady() {
      await loadSceneItems();
      unsubSceneItems?.();
      unsubSceneItems = OBR.scene.items.onChange((items) => {
        auroraSceneItems = items
          .filter((item) => isAuroraConfig(item.metadata[CONFIG_KEY]))
          .map(extractItemData);
        renderSceneItems();
      });
    }

    if (await OBR.scene.isReady()) {
      await onSceneReady();
    }

    unsubSceneReady = OBR.scene.onReadyChange(async (ready) => {
      if (ready) {
        await onSceneReady();
      } else {
        unsubSceneItems?.();
        unsubSceneItems = null;
        auroraSceneItems = [];
        renderSceneItems();
      }
    });
  }

  // Clean up subscriptions when the iframe is torn down
  window.addEventListener("beforeunload", () => {
    unsubTheme();
    unsubRoomMeta();
    unsubSceneItems?.();
    unsubSceneReady?.();
  });
});
