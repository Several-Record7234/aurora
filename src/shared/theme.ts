/**
 * Aurora – shared theme application.
 *
 * Apply OBR theme tokens as CSS custom properties on the root element.
 * The CSS uses var() references with light-mode fallbacks, so this just
 * overrides them to match whatever theme OBR is currently using.
 *
 * Used by both the action popover (index.html) and context menu (menu.html).
 */

import type { Theme } from "@owlbear-rodeo/sdk";

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const isDark = theme.mode === "DARK";
  root.style.setProperty("--bg-default", theme.background.default);
  root.style.setProperty("--bg-paper", theme.background.paper);
  root.style.setProperty("--text-primary", theme.text.primary);
  root.style.setProperty("--text-secondary", theme.text.secondary);
  root.style.setProperty("--border-color", isDark ? "rgba(255,255,255,0.12)" : "#e0e0e0");
  root.style.setProperty("--bg-subtle", isDark ? "rgba(255,255,255,0.06)" : "#f0f0f0");
  root.style.setProperty("--shadow", isDark ? "0 1px 3px rgba(0,0,0,0.4)" : "0 1px 3px rgba(0,0,0,0.1)");
}
