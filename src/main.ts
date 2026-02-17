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

import OBR from "@owlbear-rodeo/sdk";
import {
  Presets,
  isPresets,
  EMPTY_PRESETS,
  MAX_NAME_LENGTH,
  BLEND_MODES,
} from "./shared/types";
import { loadPresets, savePresets, clearPresetSlot, getPresetsKey } from "./shared/presets";

// ── Constants ─────────────────────────────────────────────────────

/** Dimensions of the action popover (pixels) */
const POPOVER_WIDTH = 350;
const POPOVER_HEIGHT = 572;

// ── State ─────────────────────────────────────────────────────────

let presets: Presets = [...EMPTY_PRESETS];

/** Current interaction mode: null = idle, "rename" or "clear" = awaiting preset click */
let activeMode: "rename" | "clear" | null = null;

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
  clearModeBtn.classList.toggle("active", activeMode === "clear");

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

    // Name
    const nameDiv = document.createElement("div");
    nameDiv.className = "preset-name";
    nameDiv.textContent = preset?.n ?? `Preset ${index + 1}`;

    // Values — displayed in S, L, H, O order with blend mode
    const valuesDiv = document.createElement("div");
    valuesDiv.className = "preset-values";
    if (preset) {
      const blendLabel = BLEND_MODES.find((m) => m.value === (preset.b ?? 3))?.label ?? "Color";
      valuesDiv.textContent = `S:${preset.s}% L:${preset.l}% H:${preset.h}\u00B0 O:${preset.o}% \u2022 ${blendLabel}`;
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
  if (activeMode === "rename") {
    showRenameDialog(index);
  } else if (activeMode === "clear") {
    await clearPresetSlot(index);
    presets = await loadPresets();
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
  dialog.innerHTML = `
    <h3>Rename Preset</h3>
    <input type="text" id="renameInput" maxlength="${MAX_NAME_LENGTH}" value="${preset.n}">
    <div class="rename-dialog-buttons">
      <button class="cancel">Cancel</button>
      <button class="confirm">Rename</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const input = document.getElementById("renameInput") as HTMLInputElement;
  input.focus();
  input.select();

  const close = () => {
    document.body.removeChild(overlay);
    exitMode();
  };

  const doRename = async () => {
    const name = input.value.trim().substring(0, MAX_NAME_LENGTH) || preset.n;
    presets[index] = { ...preset, n: name };
    await savePresets(presets);
    close();
  };

  dialog.querySelector(".cancel")?.addEventListener("click", close);
  dialog.querySelector(".confirm")?.addEventListener("click", doRename);

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

// ── Initialization ────────────────────────────────────────────────

OBR.onReady(async () => {
  await Promise.all([
    OBR.action.setHeight(POPOVER_HEIGHT),
    OBR.action.setWidth(POPOVER_WIDTH),
  ]);

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
  OBR.room.onMetadataChange((metadata) => {
    const data = metadata[getPresetsKey()];
    if (isPresets(data)) {
      presets = data;
      renderPresets();
    }
  });
});
