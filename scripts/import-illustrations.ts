#!/usr/bin/env npx tsx
/**
 * scripts/import-illustrations.ts
 *
 * One-shot importer: reads Envato SVG packs from public/*-utc/SVG/,
 * rewrites the 3-colour palette to CSS vars, and emits themed React
 * components into src/components/illustrations/.
 *
 * Usage:
 *   npx tsx scripts/import-illustrations.ts
 *
 * The generated components paint through:
 *   currentColor   ← inherits parent's text color (--foreground / --muted-foreground)
 *   var(--accent)  ← per-garage brand accent
 *   var(--card)    ← card/paper surface (flips in dark mode)
 *
 * To regenerate after adding a new pack: just run again. Existing files
 * are overwritten. Do NOT hand-edit generated files — edit the source SVG
 * and re-run.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { join, basename, extname } from "path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PUBLIC_DIR = join(__dirname, "..", "public");
const OUT_DIR = join(__dirname, "..", "src", "components", "illustrations");

/** Only import from these packs + specific files (the curated set). */
const CURATED: Record<string, string[]> = {
  // Car-garage pack — automotive-specific scenes
  "car-garage-2026-02-24-01-45-57-utc": [
    "Garage Owner Welcoming Customers",      // → NoCustomersIllustration / KioskHero
    "Car Repair in Progress",                // → NoJobsIllustration
    "Engine Diagnostic Check",               // → DiagnosticIllustration
    "Tire Replacement",                      // → TireServiceIllustration
    "Battery Replacement",                   // → BatteryServiceIllustration
    "Brake System Repair",                   // → BrakeServiceIllustration
    "Oil Change Service",                    // → OilChangeIllustration
    "Classic Car Restoration",               // → RestorationIllustration
    "Car Wash & Detailing",                  // → DetailingIllustration
    "Checking Air Conditioner System",       // → AcCheckIllustration
    "Exhaust System Upgrade",                // → ExhaustIllustration
    "Car Modification & Customization",      // → CustomizationIllustration
  ],

  // File & document — admin / search / audit empty states
  "file-and-document-2026-02-24-01-42-49-utc": [
    "Searching FIle",                        // → SearchEmptyIllustration
    "Organized Filing System",               // → NoStockIllustration
    "Data Security",                         // → NoWarrantiesIllustration
    "Document Review",                       // → AuditLogEmptyIllustration
    "File Management",                       // → FileManagementIllustration
    "Cloud Storage",                         // → CloudStorageIllustration
  ],

  // Project management — reports / tasks / milestones
  "project-management-2026-02-24-01-43-12-utc": [
    "Progress Tracking",                     // → NoReportsIllustration
    "Milestone Achievement",                 // → AllCaughtUpIllustration
    "Task Allocation",                       // → NoTasksIllustration
    "Data-Driven Decisions",                 // → NoKpiDataIllustration
    "Time Management",                       // → TimeManagementIllustration
  ],

  // Teamwork — team / collaboration empty states
  "teamwork-collaboration-2026-02-24-01-43-13-utc": [
    "Shared Success",                        // → SuccessIllustration
    "Brainstorming Session",                 // → BrainstormIllustration
    "Sharing Ideas",                         // → SharingIdeasIllustration
  ],

  // Business startup — welcome / onboarding
  "business-startup-2026-02-24-01-42-49-utc": [
    "Networking and Partnerships",           // → WelcomeIllustration
    "Startup Launch",                        // → LaunchIllustration
    "Innovation Hub",                        // → InnovationIllustration
  ],

  // Repair & maintenance — error / offline / system states
  "repair-maintenance-2026-02-24-04-18-59-utc": [
    "Tech Support Fixing Server Issues",     // → ErrorIllustration
    "Fixing Digital Device Connections",      // → OfflineIllustration
    "Software Debugging and Repair",         // → DebuggingIllustration
    "Updating and Patching Software",        // → MaintenanceIllustration
  ],
};

// Colour swaps: stock hex → CSS var/keyword
const COLOR_SWAPS: Array<[RegExp, string]> = [
  // Ink (outline + dark fills) → currentColor
  [/fill:\s*#010101/gi, "fill: currentColor"],
  [/fill:\s*#020202/gi, "fill: currentColor"],
  // Accent (warm yellow) → per-garage accent
  [/fill:\s*#fece2e/gi, "fill: var(--accent)"],
  // Paper/surface (white) → card surface (dark-mode aware)
  [/fill:\s*#fff\b/gi, "fill: var(--card)"],
  [/fill:\s*#ffffff/gi, "fill: var(--card)"],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

function toCamelCase(str: string): string {
  const p = toPascalCase(str);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

function stripXmlDeclaration(svg: string): string {
  return svg.replace(/<\?xml[^?]*\?>\s*/g, "");
}

function makeJsxSafe(svg: string): string {
  let out = svg;
  // Convert HTML attributes to JSX camelCase
  out = out.replace(/\bclass=/g, "className=");
  out = out.replace(/\bdata-name=/g, "data-name="); // data-* is fine in JSX
  out = out.replace(/\bxlink:href=/g, "xlinkHref=");
  out = out.replace(/\bxml:space=/g, "xmlSpace=");
  // stroke-* and fill-* attributes
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
  // Remove the id on the root <svg> (collisions when multiple illustrations mount)
  out = out.replace(/<svg\s+id="[^"]*"/, "<svg");
  return out;
}

function rewriteColors(svg: string): string {
  let out = svg;
  for (const [re, rep] of COLOR_SWAPS) {
    out = out.replace(re, rep);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (!existsSync(OUT_DIR)) {
  mkdirSync(OUT_DIR, { recursive: true });
}

const generated: Array<{ exportName: string; fileName: string }> = [];

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
    raw = stripXmlDeclaration(raw);

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
// Re-run: npx tsx scripts/import-illustrations.ts
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
  `// Re-run: npx tsx scripts/import-illustrations.ts`,
  `export type { IllustrationProps } from "./types";`,
  ``,
  ...generated
    .sort((a, b) => a.exportName.localeCompare(b.exportName))
    .map((g) => `export { ${g.exportName} } from "./${g.fileName}";`),
  ``,
];

writeFileSync(join(OUT_DIR, "index.ts"), indexLines.join("\n"));
console.log(`\n✓ Barrel export: ${generated.length} illustrations in index.ts`);
