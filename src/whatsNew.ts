/**
 * Aurora – What's New modal entry point.
 *
 * Vanilla TS (no React). Renders a changelog of unseen entries and closes
 * via OBR.modal.close() after an auto-dismiss countdown.
 */

import OBR from "@owlbear-rodeo/sdk";
import { changelog, getUnseenEntries } from "./changelog";

const MODAL_ID = "dev.aurora.whats-new";
const AUTO_CLOSE_S = 5;

const COLORS = {
  base: "#1e1e2e",
  surface: "#313244",
  text: "#cdd6f4",
  subtext: "#a6adc8",
  accent: "#89b4fa",
  green: "#a6e3a1",
  red: "#f38ba8",
  yellow: "#f9e2af",
} as const;

const TYPE_META = {
  feat:   { label: "New",    bg: "rgba(166,227,161,0.2)", color: COLORS.green },
  fix:    { label: "Fix",    bg: "rgba(243,139,168,0.2)", color: COLORS.red },
  change: { label: "Change", bg: "rgba(249,226,175,0.2)", color: COLORS.yellow },
} as const;

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

function parseMd(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
}

function render(entries: ReturnType<typeof getUnseenEntries>, remaining: number | null) {
  const body = entries.map((e) => {
    const items = e.changes.map((c) => {
      const m = TYPE_META[c.type] ?? TYPE_META.feat;
      return `
        <li style="display:flex;align-items:flex-start;gap:6px;margin-bottom:4px;">
          <span style="flex-shrink:0;padding:0 4px;border-radius:3px;font-size:10px;font-weight:500;line-height:16px;background:${m.bg};color:${m.color};">${m.label}</span>
          <span style="font-size:11px;color:${COLORS.subtext};">${parseMd(c.text)}</span>
        </li>`;
    }).join("");
    return `
      <div style="margin-bottom:12px;">
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px;">
          <span style="font-size:11px;font-weight:600;color:${COLORS.text};">v${e.version}</span>
          <span style="font-size:11px;color:${COLORS.subtext};">${e.date}</span>
        </div>
        <ul style="list-style:none;margin:0;padding:0;">${items}</ul>
      </div>`;
  }).join("");

  const btnLabel = remaining !== null ? `Got it (${remaining}s)` : "Got it";

  return `
    <div id="app" style="display:flex;flex-direction:column;height:100%;background:${COLORS.base};color:${COLORS.text};padding:16px;gap:12px;font-family:${FONT};box-sizing:border-box;">
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <img src="/icon.svg" alt="" style="width:24px;height:24px;border-radius:4px;" />
        <span style="font-size:13px;font-weight:600;">Aurora</span>
        <span style="font-size:11px;color:${COLORS.subtext};margin-left:auto;">What's New</span>
      </div>
      <div style="border-top:1px solid ${COLORS.surface};flex-shrink:0;"></div>
      <div id="scroll" style="flex:1;overflow-y:auto;min-height:0;">${body}</div>
      <div style="border-top:1px solid ${COLORS.surface};flex-shrink:0;"></div>
      <button id="close-btn" style="width:100%;padding:6px 12px;border-radius:4px;border:none;font-size:11px;font-weight:500;cursor:pointer;flex-shrink:0;background:${COLORS.accent};color:${COLORS.base};">${btnLabel}</button>
    </div>`;
}

OBR.onReady(() => {
  const params = new URLSearchParams(window.location.search);
  const lastSeen = params.get("lastSeen");
  const entries = getUnseenEntries(changelog, lastSeen);

  document.body.style.cssText = `margin:0;height:100%;overflow:hidden;`;
  document.body.innerHTML = render(entries, AUTO_CLOSE_S);

  let remaining: number | null = AUTO_CLOSE_S;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let tick: ReturnType<typeof setInterval> | null = null;

  function close() {
    OBR.modal.close(MODAL_ID);
  }

  function cancelCountdown() {
    if (timer === null) return;
    clearTimeout(timer); clearInterval(tick!);
    timer = null; tick = null; remaining = null;
    const btn = document.getElementById("close-btn");
    if (btn) btn.textContent = "Got it";
  }

  timer = setTimeout(close, AUTO_CLOSE_S * 1000);
  tick = setInterval(() => {
    if (remaining === null) return;
    remaining--;
    const btn = document.getElementById("close-btn");
    if (btn) btn.textContent = `Got it (${remaining}s)`;
  }, 1000);

  document.getElementById("close-btn")?.addEventListener("click", close);
  document.getElementById("app")?.addEventListener("click", cancelCountdown);
  document.getElementById("scroll")?.addEventListener("scroll", cancelCountdown);
});
