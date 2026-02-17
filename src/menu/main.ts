/**
 * Aurora – context-menu popover (per-item settings).
 *
 * This script runs inside the embedded popover that appears when the user
 * right-clicks a MAP-layer item that already has Aurora config and selects
 * "Aurora Settings". It provides real-time HSLO sliders, a blend mode
 * dropdown, preset load/save, and a toggle to enable/disable the effect.
 */

import OBR from "@owlbear-rodeo/sdk";
import { getPluginId } from "../shared/pluginId";
import {
  AuroraConfig,
  HSLOValues,
  Presets,
  isAuroraConfig,
  isPresets,
  DEFAULT_CONFIG,
  MAX_NAME_LENGTH,
  EMPTY_PRESETS,
  BLEND_MODES,
} from "../shared/types";
import { loadPresets, saveToPresetSlot, getPresetsKey } from "../shared/presets";

const CONFIG_KEY = getPluginId("config");

/** Debounce delay for writing slider changes to item metadata (ms) */
const SAVE_DEBOUNCE_MS = 150;

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
  presetSelect: HTMLSelectElement;
  savePresetBtn: HTMLButtonElement;
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
  const presetSelect = document.getElementById("presetSelect") as HTMLSelectElement | null;
  const savePresetBtn = document.getElementById("savePresetBtn") as HTMLButtonElement | null;
  const removeBtn = document.getElementById("removeBtn") as HTMLButtonElement | null;

  if (
    !toggle || !satSlider || !lightSlider || !hueSlider || !opacitySlider ||
    !satValue || !lightValue || !hueValue || !opacityValue ||
    !presetSelect || !savePresetBtn || !removeBtn
  ) {
    return null;
  }

  return {
    toggle, satSlider, lightSlider, hueSlider, opacitySlider,
    satValue, lightValue, hueValue, opacityValue,
    blendSelect, presetSelect, savePresetBtn, removeBtn,
  };
}

// ── State ─────────────────────────────────────────────────────────

let ui: UIElements | null = null;
let selectedItemIds: string[] = [];
let currentConfig: AuroraConfig = { ...DEFAULT_CONFIG };
let presets: Presets = [...EMPTY_PRESETS];

// ── Debounce ──────────────────────────────────────────────────────

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => writeConfigToItems(), SAVE_DEBOUNCE_MS);
}

// ── Item Config Read/Write ────────────────────────────────────────

/** Read Aurora config from the first selected item */
async function readConfigFromItems(): Promise<AuroraConfig> {
  if (selectedItemIds.length === 0) return { ...DEFAULT_CONFIG };

  const items = await OBR.scene.items.getItems(selectedItemIds);
  for (const item of items) {
    const config = item.metadata[CONFIG_KEY];
    if (isAuroraConfig(config)) {
      // Ensure backwards compatibility: older configs may lack blend mode
      const withDefaults: AuroraConfig = { ...config, b: config.b ?? 0 };
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

/** Remove Aurora metadata from all selected items */
async function removeAuroraFromItems(): Promise<void> {
  if (selectedItemIds.length === 0) return;

  await OBR.scene.items.updateItems(selectedItemIds, (items) => {
    for (const item of items) {
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
      (p.b ?? 3) === (currentConfig.b ?? 3)
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
    placeholder.textContent = preset.n;
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
      option.textContent = `${preset.n} (S:${preset.s} L:${preset.l} H:${preset.h} O:${preset.o} \u2022 ${blendLabel})`;
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
      currentConfig[key] = value;
      label.textContent = `${value}${suffix}`;

      // Live-update the hue slider track colour
      if (key === "h") {
        updateHueSliderTrack();
      }

      // Live-update the preset dropdown match indicator
      updatePresetSelection();
    });

    slider.addEventListener("change", debouncedSave);
  }

  // Blend mode dropdown (hidden in production; listener attached if element exists)
  if (ui.blendSelect) {
    ui.blendSelect.addEventListener("change", async () => {
      if (!ui?.blendSelect) return;
      currentConfig.b = parseInt(ui.blendSelect.value, 10);
      await writeConfigToItems();
    });
  }

  // Preset select — immediately apply the selected preset
  ui.presetSelect.addEventListener("change", async () => {
    if (!ui) return;
    const value = ui.presetSelect.value;

    // Clicking the placeholder does nothing (it's disabled)
    if (value === "") return;

    const index = parseInt(value, 10);
    const preset = presets[index];
    if (!preset) return;

    // Apply preset values (S, L, H, O, B), keeping current enabled state
    currentConfig = {
      s: preset.s, l: preset.l, h: preset.h, o: preset.o,
      e: currentConfig.e,
      b: preset.b ?? currentConfig.b,
    };
    updateUI();
    await writeConfigToItems();
  });

  // Save to preset
  ui.savePresetBtn.addEventListener("click", () => {
    showSaveDialog();
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

  // Build slot options
  const slotOptions = presets
    .map((preset, i) => {
      const label = preset ? preset.n : `Preset ${i + 1} (empty)`;
      return `<option value="${i}">${label}</option>`;
    })
    .join("");

  const dialog = document.createElement("div");
  dialog.className = "save-dialog";
  dialog.innerHTML = `
    <h3>Save Current As...</h3>
    <label for="saveSlotSelect">Slot</label>
    <select id="saveSlotSelect">${slotOptions}</select>
    <label for="saveNameInput">Name</label>
    <input type="text" id="saveNameInput" maxlength="${MAX_NAME_LENGTH}" placeholder="Preset name">
    <div class="save-dialog-buttons">
      <button class="cancel">Cancel</button>
      <button class="confirm">Save</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const slotSelect = document.getElementById("saveSlotSelect") as HTMLSelectElement;
  const nameInput = document.getElementById("saveNameInput") as HTMLInputElement;

  // Auto-select the first empty slot if one exists
  const firstEmpty = presets.findIndex((p) => p === null);
  if (firstEmpty >= 0) {
    slotSelect.value = firstEmpty.toString();
  }

  // Pre-fill name from selected slot
  const updateName = () => {
    const idx = parseInt(slotSelect.value, 10);
    nameInput.value = presets[idx]?.n ?? `Preset ${idx + 1}`;
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
    await saveToPresetSlot(index, name, currentConfig);
    presets = await loadPresets();
    updatePresetDropdown();
    close();
  };

  dialog.querySelector(".cancel")?.addEventListener("click", close);
  dialog.querySelector(".confirm")?.addEventListener("click", doSave);

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

  // Attach event listeners
  setupEventListeners();

  // Sync if item metadata changes externally (e.g. another player)
  OBR.scene.items.onChange(async (items) => {
    const relevant = items.filter((item) => selectedItemIds.includes(item.id));
    for (const item of relevant) {
      const config = item.metadata[CONFIG_KEY];
      if (isAuroraConfig(config)) {
        currentConfig = { ...config, b: config.b ?? 0 };
        updateUI();
        break;
      }
    }
  });

  // Sync presets if they change externally
  OBR.room.onMetadataChange((metadata) => {
    const data = metadata[getPresetsKey()];
    if (isPresets(data)) {
      presets = data;
      updatePresetDropdown();
    }
  });
});
