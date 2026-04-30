export interface ChangelogEntry {
  version: string;
  date: string;
  changes: {
    type: "feat" | "fix" | "change";
    text: string;
  }[];
}

/**
 * Changelog entries, newest first.
 * Only versions listed here trigger the "What's New" modal.
 */
export const changelog: ChangelogEntry[] = [
  {
    version: "0.9.2",
    date: "2026-04-01",
    changes: [
      {
        type: "feat",
        text: "**Crisp ↔ Dreamy slider**: negative values sharpen the image (unsharp mask); positive values add a soft bloom glow.",
      },
      {
        type: "feat",
        text: "**Adaptive bloom threshold**: bloom intensity is automatically calibrated to the scene's luminance histogram so bright areas glow naturally without blowing out.",
      },
      {
        type: "fix",
        text: "**Colour bleed at low saturation**: the blur pass is now desaturated to match the graded signal, eliminating hue shifts when bloom or unsharp is active.",
      },
    ],
  },
  {
    version: "0.9.1",
    date: "2026-03-16",
    changes: [
      {
        type: "feat",
        text: "**'Vitest' test suite**: 75 unit tests cover presets, type guards, shader uniforms, and metadata keys, which harden the codebase against accidental breakage.",
      },
    ],
  },
];

/** Compare two semver strings. Returns <0, 0, or >0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Return changelog entries the user hasn't seen yet.
 * Returns [] if lastSeen is null (first-time user — skip modal).
 */
export function getUnseenEntries(
  log: ChangelogEntry[],
  lastSeen: string | null,
): ChangelogEntry[] {
  if (!lastSeen) return [];
  return log.filter((e) => compareVersions(e.version, lastSeen) > 0);
}
