/**
 * Aurora – context-menu popover (per-item settings).
 *
 * This script runs inside the embedded popover that appears when the user
 * right-clicks a MAP-layer item that already has Aurora config and selects
 * "Aurora Settings". It provides real-time HSLO sliders, a blend mode
 * dropdown, preset load/save, and a toggle to enable/disable the effect.
 *
 * LIVE PREVIEW:
 * During slider drags, the local effect's uniforms are updated directly
 * via scene.local for instant visual feedback without syncing to other
 * players. On mouse release, the final value is written to item metadata
 * which triggers the normal reconcile path and syncs to all clients.
 */

import OBR, { Effect } from "@owlbear-rodeo/sdk";
import {
  AuroraConfig,
  BlendModeValue,
  HSLOValues,
  Presets,
  isAuroraConfig,
  isPresets,
  DEFAULT_CONFIG,
  MAX_NAME_LENGTH,
  EMPTY_PRESETS,
  BLEND_MODES,
  truncatePresetName,
} from "../shared/types";
import { getShaderUniforms } from "../shared/shader";
import { loadPresets, saveToPresetSlot, getPresetsKey } from "../shared/presets";
import { CONFIG_KEY, LAST_CONFIG_KEY, EFFECT_META_KEY, EFFECT_SOURCE_KEY } from "../shared/keys";
import { applyTheme } from "../shared/theme";

// ── DOM Elements ──────────────────────────────────────────────────

interface UIElements {
  toggle: HTMLElement;
  satSlider: HTMLInputElement;
  lightSlider: HTMLInputElement;
  hueSlider: HTMLInputElement;
  opacitySlider: HTMLInputElement;
  satValue: HTMLElement;
  lightValue: HTMLElement;
  hueValue: HTMLElement;
  opacityValue: HTMLElement;
  blendSelect: HTMLSelectElement | null;  // Hidden in production; kept for future use
  featherSlider: HTMLInputElement;
  featherValue: HTMLElement;
  invertBtn: HTMLButtonElement;
  presetSelect: HTMLSelectElement;
  savePresetBtn: HTMLButtonElement;
  resetBtn: HTMLButtonElement;
  removeBtn: HTMLButtonElement;
}

function resolveUI(): UIElements | null {
  const toggle = document.getElementById("masterToggle");
  const satSlider = document.getElementById("satSlider") as HTMLInputElement | null;
  const lightSlider = document.getElementById("lightSlider") as HTMLInputElement | null;
  const hueSlider = document.getElementById("hueSlider") as HTMLInputElement | null;
  const opacitySlider = document.getElementById("opacitySlider") as HTMLInputElement | null;
  const satValue = document.getElementById("satValue");
  const lightValue = document.getElementById("lightValue");
  const hueValue = document.getElementById("hueValue");
  const opacityValue = document.getElementById("opacityValue");
  const blendSelect = document.getElementById("blendSelect") as HTMLSelectElement | null;
  const featherSlider = document.getElementById("featherSlider") as HTMLInputElement | null;
  const featherValue = document.getElementById("featherValue");
  const invertBtn = document.getElementById("invertBtn") as HTMLButtonElement | null;
  const presetSelect = document.getElementById("presetSelect") as HTMLSelectElement | null;
  const savePresetBtn = document.getElementById("savePresetBtn") as HTMLButtonElement | null;
  const resetBtn = document.getElementById("resetBtn") as HTMLButtonElement | null;
  const removeBtn = document.getElementById("removeBtn") as HTMLButtonElement | null;

  if (
    !toggle || !satSlider || !lightSlider || !hueSlider || !opacitySlider ||
    !satValue || !lightValue || !hueValue || !opacityValue ||
    !featherSlider || !featherValue || !invertBtn ||
    !presetSelect || !savePresetBtn || !resetBtn || !removeBtn
  ) {
    return null;
  }

  return {
    toggle, satSlider, lightSlider, hueSlider, opacitySlider,
    satValue, lightValue, hueValue, opacityValue,
    blendSelect, featherSlider, featherValue, invertBtn,
    presetSelect, savePresetBtn, resetBtn, removeBtn,
  };
}

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

let ui: UIElements | null = null;
let selectedItemIds: string[] = [];
let currentConfig: AuroraConfig = { ...DEFAULT_CONFIG };
let presets: Presets = [...EMPTY_PRESETS];

// ── Live Preview ──────────────────────────────────────────────────

/**
 * Update local effect uniforms directly for instant visual feedback
 * during slider drags, without writing to synced item metadata.
 *
 * Finds the local ATTACHMENT effect linked to each selected item and
 * patches only the config-derived uniforms in place. Geometry uniforms
 * (coordOffset, itemSize, shapeType) are left untouched — they were
 * computed by the effect manager and must not be overwritten.
 */

/** Uniform names that are derived from AuroraConfig (safe to patch) */
const CONFIG_UNIFORMS = new Set([
  "saturation", "lightness", "hue", "opacity",
  "blendMode", "feather", "invertFeather",
]);

async function previewLocal(): Promise<void> {
  if (selectedItemIds.length === 0) return;

  // Find local effects linked to our selected items
  const localEffects = await OBR.scene.local.getItems<Effect>(
    (item) =>
      item.metadata[EFFECT_META_KEY] !== undefined &&
      selectedItemIds.includes(item.metadata[EFFECT_SOURCE_KEY] as string)
  );

  if (localEffects.length === 0) return;

  // Build fresh config-derived uniform values
  const freshUniforms = getShaderUniforms(currentConfig);

  await OBR.scene.local.updateItems<Effect>(
    localEffects.map((e) => e.id),
    (effects) => {
      for (const effect of effects) {
        if (!effect.uniforms) continue;

        // Patch ONLY config-derived uniforms, skip geometry uniforms
        for (const fresh of freshUniforms) {
          if (!CONFIG_UNIFORMS.has(fresh.name)) continue;
          const existing = effect.uniforms.find((u: { name: string }) => u.name === fresh.name);
          if (existing) {
            existing.value = fresh.value;
          }
        }
      }
    }
  );
}

// ── Item Config Read/Write ────────────────────────────────────────

/** Read Aurora config from the first selected item */
async function readConfigFromItems(): Promise<AuroraConfig> {
  if (selectedItemIds.length === 0) return { ...DEFAULT_CONFIG };

  const items = await OBR.scene.items.getItems(selectedItemIds);
  for (const item of items) {
    const config = item.metadata[CONFIG_KEY];
    if (isAuroraConfig(config)) {
      // Ensure backwards compatibility: older configs may lack b, f, fi
      const withDefaults: AuroraConfig = {
        ...config,
        b:  config.b  ?? DEFAULT_CONFIG.b,
        f:  config.f  ?? DEFAULT_CONFIG.f,
        fi: config.fi ?? DEFAULT_CONFIG.fi,
      };
      return withDefaults;
    }
  }
  return { ...DEFAULT_CONFIG };
}

/** Write the current config to all selected items' metadata */
async function writeConfigToItems(): Promise<void> {
  if (selectedItemIds.length === 0) return;

  await OBR.scene.items.updateItems(selectedItemIds, (items) => {
    for (const item of items) {
      item.metadata[CONFIG_KEY] = { ...currentConfig };
    }
  });
}

/** Remove Aurora metadata from all selected items.
 *  Snapshots the current config into lastConfig so that a subsequent
 *  "Add Aurora" on the same item restores the previous settings.
 *
 *  NOTE: When a user duplicates an item, OBR copies all metadata including
 *  lastConfig. This is intentional — duplicating a formerly-Aurora item lets
 *  the user re-add Aurora with the same settings on the copy. */
async function removeAuroraFromItems(): Promise<void> {
  if (selectedItemIds.length === 0) return;

  await OBR.scene.items.updateItems(selectedItemIds, (items) => {
    for (const item of items) {
      const config = item.metadata[CONFIG_KEY];
      if (isAuroraConfig(config)) item.metadata[LAST_CONFIG_KEY] = { ...config };
      delete item.metadata[CONFIG_KEY];
    }
  });
}

// ── Hue Slider Visual Feedback ────────────────────────────────────

/**
 * Convert a hue degree value (-180..180) to a CSS hsl() colour string
 * for the slider track background.
 */
function hueToTrackColor(hueDegrees: number): string {
  const cssHue = ((hueDegrees % 360) + 360) % 360;
  return `hsl(${cssHue}, 70%, 65%)`;
}

/** Update the hue slider track background to reflect the current hue value */
function updateHueSliderTrack() {
  if (!ui) return;
  const hue = parseInt(ui.hueSlider.value, 10);
  ui.hueSlider.style.background = hueToTrackColor(hue);
}

// ── Preset Matching ───────────────────────────────────────────────

/**
 * Find a preset whose S, L, H, O, B values exactly match the current config.
 * Returns the index if found, or -1 if no match.
 */
function findMatchingPreset(): number {
  return presets.findIndex(
    (p) =>
      p !== null &&
      p.s === currentConfig.s &&
      p.l === currentConfig.l &&
      p.h === currentConfig.h &&
      p.o === currentConfig.o &&
      (p.b  ?? 3)     === (currentConfig.b  ?? 3) &&
      (p.f  ?? 0)     === (currentConfig.f  ?? 0) &&
      (p.fi ?? false) === (currentConfig.fi ?? false)
  );
}

// ── Blend Mode Dropdown ───────────────────────────────────────────

/** Populate the blend mode dropdown from the BLEND_MODES constant */
function populateBlendModes() {
  if (!ui?.blendSelect) return;
  ui.blendSelect.innerHTML = "";
  for (const mode of BLEND_MODES) {
    const option = document.createElement("option");
    option.value = mode.value.toString();
    option.textContent = mode.label;
    ui.blendSelect.appendChild(option);
  }
}

// ── UI Updates ────────────────────────────────────────────────────

function updateUI() {
  if (!ui) return;

  // Slider positions (order: S, L, H, O)
  ui.satSlider.value = currentConfig.s.toString();
  ui.lightSlider.value = currentConfig.l.toString();
  ui.hueSlider.value = currentConfig.h.toString();
  ui.opacitySlider.value = currentConfig.o.toString();

  // Value labels
  ui.satValue.textContent = `${currentConfig.s}%`;
  ui.lightValue.textContent = `${currentConfig.l}%`;
  ui.hueValue.textContent = `${currentConfig.h}\u00B0`;
  ui.opacityValue.textContent = `${currentConfig.o}%`;

  // Blend mode (hidden in production; updated if element exists)
  if (ui.blendSelect) {
    ui.blendSelect.value = (currentConfig.b ?? 0).toString();
  }

  // Feather
  ui.featherSlider.value = (currentConfig.f ?? 0).toString();
  ui.featherValue.textContent = `${currentConfig.f ?? 0}%`;
  ui.invertBtn.classList.toggle("active", currentConfig.fi ?? false);

  // Toggle
  ui.toggle.classList.toggle("active", currentConfig.e);

  // Hue slider track colour
  updateHueSliderTrack();

  // Update preset dropdown selection to reflect current values
  updatePresetSelection();
}

/**
 * Update the preset dropdown's placeholder to show the name of the
 * matching preset, or "Load Preset..." if no match.
 */
function updatePresetSelection() {
  if (!ui) return;

  const matchIndex = findMatchingPreset();
  const placeholder = ui.presetSelect.options[0];

  if (matchIndex >= 0) {
    const preset = presets[matchIndex]!;
    placeholder.textContent = truncatePresetName(preset.n);
    ui.presetSelect.value = "";
  } else {
    placeholder.textContent = "Load Preset...";
    ui.presetSelect.value = "";
  }
}

/** Rebuild the preset dropdown options (called when presets change) */
function updatePresetDropdown() {
  if (!ui) return;

  // Clear existing options (keep the placeholder)
  ui.presetSelect.innerHTML = '<option value="" disabled selected>Load Preset...</option>';

  presets.forEach((preset, index) => {
    if (preset) {
      const option = document.createElement("option");
      option.value = index.toString();
      const blendLabel = BLEND_MODES.find((m) => m.value === (preset.b ?? 3))?.label ?? "Color";
      const featherStr = (preset.f ?? 0) > 0
        ? ` F:${preset.f}%${preset.fi ? "\u21BA" : ""}`
        : "";
      option.textContent = `${truncatePresetName(preset.n)} (S:${preset.s} L:${preset.l} H:${preset.h} O:${preset.o}${featherStr} \u2022 ${blendLabel})`;
      ui!.presetSelect.appendChild(option);
    }
  });

  // Refresh the placeholder text based on current match state
  updatePresetSelection();
}

// ── Event Listeners ───────────────────────────────────────────────

function setupEventListeners() {
  if (!ui) return;

  // Master toggle
  ui.toggle.addEventListener("click", async () => {
    currentConfig.e = !currentConfig.e;
    updateUI();
    await writeConfigToItems();
  });

  // Slider config (order: S, L, H, O)
  const sliderConfig: Array<{
    slider: HTMLInputElement;
    label: HTMLElement;
    key: keyof HSLOValues;
    suffix: string;
  }> = [
    { slider: ui.satSlider, label: ui.satValue, key: "s", suffix: "%" },
    { slider: ui.lightSlider, label: ui.lightValue, key: "l", suffix: "%" },
    { slider: ui.hueSlider, label: ui.hueValue, key: "h", suffix: "\u00B0" },
    { slider: ui.opacitySlider, label: ui.opacityValue, key: "o", suffix: "%" },
  ];

  for (const { slider, label, key, suffix } of sliderConfig) {
    slider.addEventListener("input", () => {
      const value = parseInt(slider.value, 10);
      if (isNaN(value)) return;
      currentConfig[key] = value;
      label.textContent = `${value}${suffix}`;

      // Live-update the hue slider track colour
      if (key === "h") {
        updateHueSliderTrack();
      }

      // Live-update the preset dropdown match indicator
      updatePresetSelection();

      // Instant local preview (no sync to other players)
      previewLocal();
    });

    // On release, write to synced item metadata
    slider.addEventListener("change", () => writeConfigToItems());
  }

  // Blend mode dropdown (hidden in production; listener attached if element exists)
  if (ui.blendSelect) {
    ui.blendSelect.addEventListener("change", async () => {
      if (!ui?.blendSelect) return;
      const val = parseInt(ui.blendSelect.value, 10);
      if (isNaN(val)) return;
      currentConfig.b = val as BlendModeValue;
      await writeConfigToItems();
    });
  }

  // Feather slider
  ui.featherSlider.addEventListener("input", () => {
    if (!ui) return;
    const value = parseInt(ui.featherSlider.value, 10);
    if (isNaN(value)) return;
    currentConfig.f = value;
    ui.featherValue.textContent = `${value}%`;
    previewLocal();
  });
  ui.featherSlider.addEventListener("change", () => writeConfigToItems());

  // Invert button (immediate write — it's a toggle, not a drag)
  ui.invertBtn.addEventListener("click", async () => {
    if (!ui) return;
    currentConfig.fi = !(currentConfig.fi ?? false);
    ui.invertBtn.classList.toggle("active", currentConfig.fi);
    await writeConfigToItems();
  });

  // Preset select — immediately apply the selected preset
  ui.presetSelect.addEventListener("change", async () => {
    if (!ui) return;
    const value = ui.presetSelect.value;

    // Clicking the placeholder does nothing (it's disabled)
    if (value === "") return;

    const index = parseInt(value, 10);
    const preset = presets[index];
    if (!preset) return;

    // Apply all preset values (S, L, H, O, B, F, Fi), keeping only the
    // current enabled state (which is per-item, not part of presets)
    currentConfig = {
      s: preset.s, l: preset.l, h: preset.h, o: preset.o,
      e: currentConfig.e,
      b:  preset.b  ?? currentConfig.b,
      f:  preset.f  ?? 0,
      fi: preset.fi ?? false,
    };
    updateUI();
    await writeConfigToItems();
  });

  // Save to preset
  ui.savePresetBtn.addEventListener("click", () => {
    showSaveDialog();
  });

  // Reset to neutral values (no visual effect, but keeps Aurora attached)
  ui.resetBtn.addEventListener("click", async () => {
    currentConfig.s = 100;
    currentConfig.l = 100;
    currentConfig.h = 0;
    currentConfig.o = 0;
    currentConfig.f = 0;
    currentConfig.fi = false;
    updateUI();
    await writeConfigToItems();
  });

  // Remove Aurora
  ui.removeBtn.addEventListener("click", async () => {
    await removeAuroraFromItems();
  });
}

// ── Save Dialog ───────────────────────────────────────────────────

function showSaveDialog() {
  const overlay = document.createElement("div");
  overlay.className = "save-overlay";

  const dialog = document.createElement("div");
  dialog.className = "save-dialog";

  const heading = document.createElement("h3");
  heading.textContent = "Save Current As...";
  dialog.appendChild(heading);

  const slotLabel = document.createElement("label");
  slotLabel.textContent = "Slot";
  dialog.appendChild(slotLabel);

  const slotSelect = document.createElement("select");
  presets.forEach((preset, i) => {
    const opt = document.createElement("option");
    opt.value = i.toString();
    opt.textContent = preset ? truncatePresetName(preset.n) : `Preset ${i + 1} (empty)`;
    slotSelect.appendChild(opt);
  });
  dialog.appendChild(slotSelect);

  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Name";
  dialog.appendChild(nameLabel);

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.maxLength = MAX_NAME_LENGTH;
  nameInput.placeholder = "Preset name";
  dialog.appendChild(nameInput);

  const btnRow = document.createElement("div");
  btnRow.className = "save-dialog-buttons";
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "cancel";
  cancelBtn.textContent = "Cancel";
  const confirmBtn = document.createElement("button");
  confirmBtn.className = "confirm";
  confirmBtn.textContent = "Save";
  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(confirmBtn);
  dialog.appendChild(btnRow);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Auto-select the first empty slot if one exists
  const firstEmpty = presets.findIndex((p) => p === null);
  if (firstEmpty >= 0) {
    slotSelect.value = firstEmpty.toString();
  }

  // Pre-fill name from selected slot
  const updateName = () => {
    const idx = parseInt(slotSelect.value, 10);
    nameInput.value = presets[idx] ? truncatePresetName(presets[idx].n) : `Preset ${idx + 1}`;
  };
  updateName();
  slotSelect.addEventListener("change", updateName);

  nameInput.focus();
  nameInput.select();

  const close = () => {
    document.body.removeChild(overlay);
  };

  const doSave = async () => {
    const index = parseInt(slotSelect.value, 10);
    const name = nameInput.value.trim() || `Preset ${index + 1}`;
    try {
      await saveToPresetSlot(index, name, currentConfig);
      presets = await loadPresets();
      updatePresetDropdown();
    } catch {
      OBR.notification.show("Aurora: failed to save preset", "ERROR");
    }
    close();
  };

  cancelBtn.addEventListener("click", close);
  confirmBtn.addEventListener("click", doSave);

  // Enter key in name input triggers save
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doSave();
    }
  });

  // Esc key anywhere in the dialog triggers cancel
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

// ── Initialization ────────────────────────────────────────────────

OBR.onReady(async () => {
  ui = resolveUI();
  if (!ui) {
    console.error("Aurora menu: Required DOM elements not found");
    return;
  }

  // Apply OBR theme tokens and subscribe to live changes
  const theme = await OBR.theme.getTheme();
  applyTheme(theme);
  const unsubTheme = OBR.theme.onChange(applyTheme);

  // Populate the blend mode dropdown from the shared constant
  populateBlendModes();

  // Get the currently selected items
  const selection = await OBR.player.getSelection();
  selectedItemIds = selection ?? [];

  // Load the config from the selected item
  currentConfig = await readConfigFromItems();
  updateUI();

  // Load presets
  presets = await loadPresets();
  updatePresetDropdown();

  // Hide destructive actions for non-GMs
  const isGM = (await OBR.player.getRole()) === "GM";
  if (!isGM) {
    ui.savePresetBtn.style.display = "none";
    ui.resetBtn.style.display = "none";
    ui.removeBtn.style.display = "none";
  }

  // Attach event listeners
  setupEventListeners();

  // Sync if item metadata changes externally (e.g. another player)
  const unsubItems = OBR.scene.items.onChange(async (items) => {
    const relevant = items.filter((item) => selectedItemIds.includes(item.id));
    for (const item of relevant) {
      const config = item.metadata[CONFIG_KEY];
      if (isAuroraConfig(config)) {
        currentConfig = { ...config, b: config.b ?? DEFAULT_CONFIG.b, f: config.f ?? DEFAULT_CONFIG.f, fi: config.fi ?? DEFAULT_CONFIG.fi };
        updateUI();
        break;
      }
    }
  });

  // Sync presets if they change externally
  const unsubRoomMeta = OBR.room.onMetadataChange((metadata) => {
    const data = metadata[getPresetsKey()];
    if (isPresets(data)) {
      presets = data;
      updatePresetDropdown();
    }
  });

  // Clean up subscriptions when the iframe is torn down
  window.addEventListener("beforeunload", () => {
    unsubTheme();
    unsubItems();
    unsubRoomMeta();
  });
});
