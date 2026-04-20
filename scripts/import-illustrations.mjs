#!/usr/bin/env node
/**
 * scripts/import-illustrations.mjs
 *
 * One-shot importer: reads Envato SVG packs from public/*-utc/SVG/,
 * rewrites the 3-colour palette to CSS vars, and emits themed React
 * components into src/components/illustrations/.
 *
 * Usage:   node scripts/import-illustrations.mjs
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PUBLIC_DIR = join(__dirname, "..", "public");
const OUT_DIR = join(__dirname, "..", "src", "components", "illustrations");

/** Curated set: pack → file titles to import.
 *
 *  Audited 2026-04-17 — every entry below has been visually verified to
 *  contain ONLY male figures (or no human figures). Per Hossein, the
 *  Dudley deployment ships without female figures in the illustration
 *  set. Future additions must be JPG-previewed before being added here.
 *
 *  Removed (female figures present):
 *    car-garage:        Engine Diagnostic Check, Classic Car Restoration,
 *                       Exhaust System Upgrade
 *    file-and-document: Searching FIle, Cloud Storage
 *    project-management: Progress Tracking, Task Allocation, Time Management,
 *                       Data-Driven Decisions
 *    teamwork-collaboration: Shared Success, Brainstorming Session, Sharing Ideas
 *    business-startup:  Networking and Partnerships, Startup Launch, Innovation Hub
 */
const CURATED = {
  "car-garage-2026-02-24-01-45-57-utc": [
    "Garage Owner Welcoming Customers",
    "Car Repair in Progress",
    "Tire Replacement",
    "Battery Replacement",
    "Brake System Repair",
    "Oil Change Service",
    "Car Wash & Detailing",
    "Checking Air Conditioner System",
    "Car Modification & Customization",
  ],
  "file-and-document-2026-02-24-01-42-49-utc": [
    "Organized Filing System",
    "Data Security",
    "Document Review",
    "File Management",
  ],
  "project-management-2026-02-24-01-43-12-utc": [
    "Milestone Achievement",
    "Risk Analysis",
  ],
  "business-startup-2026-02-24-01-42-49-utc": [
    "Mission and Vision",
  ],
  "repair-maintenance-2026-02-24-04-18-59-utc": [
    "Tech Support Fixing Server Issues",
    "Fixing Digital Device Connections",
    "Software Debugging and Repair",
    "Updating and Patching Software",
  ],
};

// Colour swaps: stock hex → CSS var/keyword
const COLOR_SWAPS = [
  [/fill:\s*#010101/gi, "fill: currentColor"],
  [/fill:\s*#020202/gi, "fill: currentColor"],
  [/fill:\s*#fece2e/gi, "fill: var(--accent)"],
  [/fill:\s*#fff\b/gi, "fill: var(--card)"],
  [/fill:\s*#ffffff/gi, "fill: var(--card)"],
];

function toPascalCase(str) {
  return str
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

function toCamelCase(str) {
  const p = toPascalCase(str);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

function rewriteColors(svg) {
  let out = svg;
  for (const [re, rep] of COLOR_SWAPS) {
    out = out.replace(re, rep);
  }
  return out;
}

function makeJsxSafe(svg) {
  let out = svg;
  out = out.replace(/\bclass=/g, "className=");
  out = out.replace(/\bxlink:href=/g, "xlinkHref=");
  out = out.replace(/\bxml:space=/g, "xmlSpace=");
  out = out.replace(/\bstroke-width=/g, "strokeWidth=");
  out = out.replace(/\bstroke-linecap=/g, "strokeLinecap=");
  out = out.replace(/\bstroke-linejoin=/g, "strokeLinejoin=");
  out = out.replace(/\bstroke-dasharray=/g, "strokeDasharray=");
  out = out.replace(/\bstroke-dashoffset=/g, "strokeDashoffset=");
  out = out.replace(/\bstroke-miterlimit=/g, "strokeMiterlimit=");
  out = out.replace(/\bstroke-opacity=/g, "strokeOpacity=");
  out = out.replace(/\bfill-rule=/g, "fillRule=");
  out = out.replace(/\bfill-opacity=/g, "fillOpacity=");
  out = out.replace(/\bclip-rule=/g, "clipRule=");
  out = out.replace(/\bclip-path=/g, "clipPath=");
  // Remove root id to avoid collision when multiple mount
  out = out.replace(/<svg\s+id="[^"]*"/, "<svg");
  // JSX parses `{` / `}` inside element content as expression boundaries,
  // so any raw CSS inside <style> blocks must be wrapped in a JSX
  // expression with a template literal. Escape back-ticks and ${ to
  // prevent accidental template interpolation.
  out = out.replace(
    /<style([^>]*)>([\s\S]*?)<\/style>/g,
    (_m, attrs, css) => {
      const safe = css.replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
      return `<style${attrs}>{\`${safe}\`}</style>`;
    },
  );
  return out;
}

// ---------------------------------------------------------------------------

if (!existsSync(OUT_DIR)) {
  mkdirSync(OUT_DIR, { recursive: true });
}

const generated = [];

for (const [pack, files] of Object.entries(CURATED)) {
  const svgDir = join(PUBLIC_DIR, pack, "SVG");
  if (!existsSync(svgDir)) {
    console.warn(`⚠ Pack not found: ${svgDir}`);
    continue;
  }

  for (const title of files) {
    const svgFile = join(svgDir, `${title}.svg`);
    if (!existsSync(svgFile)) {
      console.warn(`⚠ SVG not found: ${svgFile}`);
      continue;
    }

    let raw = readFileSync(svgFile, "utf8");

    // Strip XML declaration
    raw = raw.replace(/<\?xml[^?]*\?>\s*/g, "");

    // Rewrite colours
    raw = rewriteColors(raw);

    // Make JSX-safe
    raw = makeJsxSafe(raw);

    // Extract viewBox
    const vbMatch = raw.match(/viewBox="([^"]+)"/);
    const viewBox = vbMatch?.[1] ?? "0 0 3000 3000";

    // Component name
    const componentName = toPascalCase(title) + "Illustration";
    const fileName = toCamelCase(title) + "Illustration.tsx";

    // Extract the inner content (everything inside <svg>...</svg>)
    const innerMatch = raw.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
    const innerContent = innerMatch?.[1] ?? "";

    const tsx = `// Auto-generated from ${pack}/${title}.svg — do not hand-edit.
// Re-run: node scripts/import-illustrations.mjs
import type { IllustrationProps } from "./types";
import { svgProps } from "./types";

export function ${componentName}({ className, title, size }: IllustrationProps) {
  return (
    <svg {...svgProps(title, "${viewBox}", size, className)}>
      ${innerContent.trim()}
    </svg>
  );
}
`;

    writeFileSync(join(OUT_DIR, fileName), tsx);
    generated.push({ exportName: componentName, fileName: fileName.replace(/\.tsx$/, "") });
    console.log(`✓ ${componentName} (${pack})`);
  }
}

// ---------------------------------------------------------------------------
// Generate barrel export (index.ts)
// ---------------------------------------------------------------------------

const indexLines = [
  `// Auto-generated barrel export — do not hand-edit.`,
  `// Re-run: node scripts/import-illustrations.mjs`,
  `export type { IllustrationProps } from "./types";`,
  ``,
  ...generated
    .sort((a, b) => a.exportName.localeCompare(b.exportName))
    .map((g) => `export { ${g.exportName} } from "./${g.fileName}";`),
  ``,
];

writeFileSync(join(OUT_DIR, "index.ts"), indexLines.join("\n"));
console.log(`\n✓ Barrel export: ${generated.length} illustrations in index.ts`);
