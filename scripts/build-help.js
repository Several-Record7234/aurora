/**
 * build-help.js — Converts README.md into a styled HTML help page.
 *
 * Run: node scripts/build-help.js
 * Called automatically by "npm run build" as a prebuild step.
 *
 * Uses the `marked` library to parse GitHub-Flavoured Markdown and wraps
 * the result in a self-contained HTML page styled with the Catppuccin Mocha
 * palette (matching the extension's UI).
 *
 * The "Table of Contents" section from the README is extracted and rendered
 * as a fixed navigation sidebar (collapsible on mobile).
 *
 * ── Media conventions ────────────────────────────────────────────────────────
 *
 * GitHub user-attachment URLs are private — they only render on GitHub itself.
 * For the deployed help.html, local copies must live in public/images/.
 *
 * Convention: put the local path in the alt text; the script uses it as the
 * rewrite target. The README stays the single source of truth — no mapping.
 *
 *   Markdown:  ![public/images/demo.webm](https://github.com/user-attachments/assets/…)
 *   HTML img:  <img alt="public/images/shot.png" src="https://github.com/…" width="300">
 *
 * .webm files are automatically converted from <img> to <video autoplay loop muted>.
 *
 * ── Customisation ────────────────────────────────────────────────────────────
 *
 * This script reads the project name from package.json automatically.
 * Icon paths assume the portfolio standard: public/icon.svg + public/icon.png.
 * No per-project edits should be needed.
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { marked } from "marked";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const pkg  = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8"));
// Capitalise first letter: "snaps" → "Snaps"
const NAME = pkg.name.charAt(0).toUpperCase() + pkg.name.slice(1);

const readme = readFileSync(resolve(ROOT, "README.md"), "utf-8");

/*
 * Self-describing GitHub asset rewriter.
 * Swaps GitHub user-attachment URLs for local alt-text paths when the alt
 * text ends in a recognised media extension.
 */
function rewriteGitHubAssets(md) {
  const LOCAL_PATH = /\.(webm|png|webp|jpg|jpeg|gif|svg)$/i;

  // Markdown: ![local/path.ext](https://github.com/user-attachments/assets/…)
  let result = md.replace(
    /!\[([^\]]+)\]\((https:\/\/github\.com\/user-attachments\/assets\/[^)]+)\)/g,
    // Normalise backslashes before encodeURI — Windows alt-text paths use \ which
    // encodeURI turns into %5C, breaking the public/ prefix stripper downstream.
    (match, alt, _url) => LOCAL_PATH.test(alt) ? `![${alt}](${encodeURI(alt.replace(/\\/g, '/'))})` : match,
  );

  // HTML: <img … alt="local/path.ext" … src="https://github.com/…" …>
  result = result.replace(
    /<img\s+([^>]*?)src="(https:\/\/github\.com\/user-attachments\/assets\/[^"]+)"([^>]*?)\/?>/gi,
    (match, before, _url, after) => {
      const altMatch = (before + after).match(/alt="([^"]+)"/);
      if (altMatch && LOCAL_PATH.test(altMatch[1])) {
        return match.replace(_url, altMatch[1]);
      }
      return match;
    },
  );

  return result;
}

const remapped = rewriteGitHubAssets(readme);

/*
 * Normalise backslashes in src/href attributes to forward slashes.
 * Windows path-copy pastes (e.g. public\images\foo.jpg) would otherwise
 * silently bypass the public/ prefix stripper below.
 */
const normalised = remapped.replace(
  /(src|href)="([^"]*)"/gi,
  (_, attr, val) => `${attr}="${val.replace(/\\/g, "/")}"`,
);

/*
 * Strip the "public/" prefix from image/link paths.
 * README.md uses paths relative to the repo root so images render on GitHub.
 * help.html lives inside public/ (the web root), so the prefix must be removed.
 *   public/images/foo.png  →  images/foo.png
 *   public/icon.png        →  icon.png
 */
const adjusted = normalised.replace(
  /(\]\(|src=["'])public\//g,
  "$1",
);

/*
 * Convert <img> tags pointing to .webm files into <video> elements.
 * Strips the alt attribute (it's a routing path, not user-facing text).
 */
function imgToVideo(html) {
  return html.replace(
    /<img\s+([^>]*?)src="([^"]*\.webm)"([^>]*?)\/?>/gi,
    (_match, before, src, after) => {
      const attrs = (before + after).replace(/\s*alt="[^"]*"/gi, "").trim();
      return `<video autoplay loop muted playsinline ${attrs}>`
        + `<source src="${src}" type="video/webm">`
        + `</video>`;
    },
  );
}

/*
 * GitHub-style heading slug generator.
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s/g, "-")
    .replace(/^-|-$/g, "");
}

const renderer = new marked.Renderer();
renderer.heading = function ({ text, depth }) {
  const id = slugify(text);
  return `<h${depth} id="${id}">${text}</h${depth}>\n`;
};
marked.use({ renderer });

const rawBody = imgToVideo(marked.parse(adjusted));

/*
 * Remove the "Table of Contents" section from the body — rendered as sidebar
 * nav instead. Strip both the <h2> heading and the <ul> list.
 */
let body = rawBody;
const tocBlock = rawBody.match(
  /<h2[^>]*id="table-of-contents"[^>]*>[\s\S]*?<\/h2>\s*<ul>[\s\S]*?<\/ul>/i,
);
if (tocBlock) {
  body = rawBody.replace(tocBlock[0], "");
}

/*
 * Build sidebar nav from all h2/h3 headings. h3s nest under their h2.
 */
const headingRegex = /<h([23])[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/gi;
const headings = [];
let hm;
while ((hm = headingRegex.exec(body)) !== null) {
  headings.push({
    level: parseInt(hm[1], 10),
    id: hm[2],
    text: hm[3].replace(/<[^>]+>/g, "").trim(),
  });
}

function buildNav(headings) {
  let html = "<ul>\n";
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    if (h.level !== 2) continue;
    const subs = [];
    while (i + 1 < headings.length && headings[i + 1].level === 3) {
      subs.push(headings[++i]);
    }
    html += `  <li>\n    <a href="#${h.id}" data-level="2">${h.text}</a>\n`;
    if (subs.length > 0) {
      html += `    <ul class="sub-links">\n`;
      for (const s of subs) {
        html += `      <li><a href="#${s.id}" data-level="3">${s.text}</a></li>\n`;
      }
      html += `    </ul>\n`;
    }
    html += `  </li>\n`;
  }
  html += "</ul>";
  return html;
}

const tocHtml = buildNav(headings);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${NAME} \u2014 Help</title>
  <link rel="icon" type="image/svg+xml" href="icon.svg">
  <link rel="icon" type="image/png" sizes="128x128" href="icon.png">
  <style>
    /* \u2500\u2500 Catppuccin Mocha palette \u2500\u2500 */
    :root {
      --base:    #1e1e2e;
      --mantle:  #181825;
      --crust:   #11111b;
      --surface: #313244;
      --surface1:#45475a;
      --text:    #cdd6f4;
      --subtext: #a6adc8;
      --accent:  #89b4fa;
      --green:   #a6e3a1;
      --red:     #f38ba8;
      --yellow:  #f9e2af;
      --overlay: #6c7086;
      --sidebar-w: 220px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--base);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                   Helvetica, Arial, sans-serif, "Apple Color Emoji",
                   "Segoe UI Emoji";
      font-size: 15px;
      line-height: 1.7;
    }

    .page { display: flex; min-height: 100vh; }

    /* \u2500\u2500 Sidebar \u2500\u2500 */
    .sidebar {
      position: fixed; top: 0; left: 0;
      width: var(--sidebar-w); height: 100vh;
      background: var(--mantle);
      border-right: 1px solid var(--surface);
      overflow-y: auto;
      padding: 1.25rem 0.75rem 2rem;
      z-index: 10;
    }
    .sidebar-title {
      font-size: 0.8rem; font-weight: 700; color: var(--accent);
      text-transform: uppercase; letter-spacing: 0.05em;
      margin-bottom: 0.75rem; padding: 0 0.25rem;
    }
    .sidebar ul { list-style: none; padding: 0; margin: 0; }
    .sidebar li { margin-bottom: 0; }
    .sidebar a {
      display: block; padding: 0.3rem 0.5rem; border-radius: 4px;
      color: var(--subtext); text-decoration: none;
      font-size: 0.82rem; line-height: 1.4;
      transition: background 0.15s, color 0.15s;
    }
    .sidebar a:hover { background: var(--surface); color: var(--text); }
    .sidebar a.active { background: var(--surface); color: var(--accent); font-weight: 600; }

    .sidebar .sub-links {
      display: none; padding-left: 0.6rem;
      margin: 0 0 0.25rem 0.5rem;
      border-left: 1px solid var(--surface1);
    }
    .sidebar li.expanded > .sub-links { display: block; }
    .sidebar .sub-links a { font-size: 0.77rem; color: var(--overlay); padding: 0.2rem 0.5rem; }
    .sidebar .sub-links a:hover { color: var(--text); }
    .sidebar .sub-links a.active { color: var(--accent); font-weight: 500; }

    /* \u2500\u2500 Mobile sidebar toggle \u2500\u2500 */
    .sidebar-toggle {
      display: none; position: fixed; top: 0.75rem; left: 0.75rem; z-index: 20;
      background: var(--surface); color: var(--accent);
      border: 1px solid var(--surface1); border-radius: 6px;
      padding: 0.35rem 0.7rem; font-size: 0.85rem; font-weight: 600; cursor: pointer;
    }
    .sidebar-toggle:hover { background: var(--surface1); }

    .main { margin-left: var(--sidebar-w); flex: 1; max-width: 820px; padding: 2rem 2rem 4rem; }

    @media (max-width: 860px) {
      .sidebar { transform: translateX(-100%); transition: transform 0.25s ease; }
      .sidebar.open { transform: translateX(0); box-shadow: 4px 0 20px rgba(0,0,0,0.5); }
      .sidebar-toggle { display: block; }
      .main { margin-left: 0; padding: 3rem 1.5rem 4rem; }
    }

    h1, h2, h3, h4 { color: var(--accent); margin-top: 2rem; margin-bottom: 0.75rem; line-height: 1.3; }
    h1 { font-size: 2rem; margin-top: 0; }
    h2 { font-size: 1.45rem; border-bottom: 1px solid var(--surface); padding-bottom: 0.4rem; }
    h3 { font-size: 1.15rem; }
    h4 { font-size: 1rem; color: var(--subtext); }
    h2[id], h3[id], h4[id] { scroll-margin-top: 1rem; }

    p  { margin-bottom: 0.9rem; }
    ul, ol { margin-bottom: 0.9rem; padding-left: 1.6rem; }
    li { margin-bottom: 0.35rem; }

    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    strong { color: var(--text); }
    em { color: var(--subtext); font-style: italic; }
    hr { border: none; border-top: 1px solid var(--surface); margin: 2rem 0; }

    code {
      background: var(--surface); color: var(--green);
      padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.9em;
      font-family: "Cascadia Code", "Fira Code", Consolas, monospace;
    }
    pre {
      background: var(--surface); border: 1px solid var(--surface1);
      border-radius: 6px; padding: 1rem; overflow-x: auto;
      margin-bottom: 1rem; position: relative;
    }
    pre code { background: none; padding: 0; color: var(--text); }
    pre .copy-btn {
      position: absolute; top: 6px; right: 6px;
      background: var(--surface1); color: var(--subtext);
      border: none; border-radius: 4px; padding: 2px 8px;
      font-size: 11px; cursor: pointer; opacity: 0; transition: opacity 0.15s;
    }
    pre:hover .copy-btn { opacity: 1; }
    pre .copy-btn:hover { color: var(--text); }

    blockquote {
      border-left: 3px solid var(--accent); padding: 0.5rem 1rem;
      margin: 0.5rem 0 1rem; color: var(--subtext);
      background: var(--mantle); border-radius: 0 6px 6px 0;
    }
    blockquote p { margin-bottom: 0.4rem; }

    table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 0.93em; }
    th, td { padding: 0.5rem 0.75rem; text-align: left; border: 1px solid var(--surface1); }
    th { background: var(--surface); color: var(--accent); font-weight: 600; }
    tr:nth-child(even) td { background: var(--mantle); }

    img, video { max-width: 100%; height: auto; border-radius: 8px; margin: 0.5rem 0; }
    img[width] { vertical-align: middle; margin: 0; }
    p:has(> img[alt=""]) img[alt=""] { display: none; }
  </style>
</head>
<body>
  <button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle navigation">&#9776; Contents</button>
  <div class="page">
    <nav class="sidebar" id="sidebar">
      <div class="sidebar-title">Contents</div>
      ${tocHtml}
    </nav>
    <div class="main">
      ${body}
    </div>
  </div>
  <script>
    document.querySelectorAll("pre").forEach(pre => {
      const btn = document.createElement("button");
      btn.className = "copy-btn";
      btn.textContent = "Copy";
      btn.addEventListener("click", () => {
        const text = pre.querySelector("code")?.textContent ?? pre.textContent;
        navigator.clipboard?.writeText(text).catch(() => {
          const ta = document.createElement("textarea");
          ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
          document.body.appendChild(ta); ta.select(); document.execCommand("copy");
          document.body.removeChild(ta);
        });
        btn.textContent = "Copied!";
        setTimeout(() => btn.textContent = "Copy", 1500);
      });
      pre.appendChild(btn);
    });

    const toggle  = document.getElementById("sidebarToggle");
    const sidebar = document.getElementById("sidebar");
    toggle.addEventListener("click", () => sidebar.classList.toggle("open"));
    sidebar.querySelectorAll("a").forEach(a => {
      a.addEventListener("click", () => sidebar.classList.remove("open"));
    });

    const navLinks    = [...sidebar.querySelectorAll("a[href^='#']")];
    const h2Links     = navLinks.filter(a => a.dataset.level === "2");
    const allSections = navLinks
      .map(a => document.getElementById(a.getAttribute("href").slice(1)))
      .filter(Boolean);
    const h2Sections  = h2Links
      .map(a => document.getElementById(a.getAttribute("href").slice(1)))
      .filter(Boolean);

    function updateActive() {
      const THRESHOLD = 80;
      let current = allSections[0];
      for (const s of allSections) { if (s.getBoundingClientRect().top <= THRESHOLD) current = s; }
      let currentH2 = h2Sections[0];
      for (const s of h2Sections) { if (s.getBoundingClientRect().top <= THRESHOLD) currentH2 = s; }
      navLinks.forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + current?.id));
      sidebar.querySelectorAll("li").forEach(li => li.classList.remove("expanded"));
      const activeH2Link = h2Links.find(a => a.getAttribute("href") === "#" + currentH2?.id);
      if (activeH2Link) activeH2Link.closest("li").classList.add("expanded");
    }
    window.addEventListener("scroll", updateActive, { passive: true });
    updateActive();

    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener("click", e => {
        const target = document.getElementById(a.getAttribute("href").slice(1));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: "smooth" });
          history.replaceState(null, "", a.getAttribute("href"));
        }
      });
    });
  </script>
</body>
</html>
`;

writeFileSync(resolve(ROOT, "public", "help.html"), html, "utf-8");
console.log("\u2713 public/help.html generated from README.md");
