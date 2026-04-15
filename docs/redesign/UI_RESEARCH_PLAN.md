# UI Research Plan — Automotive Workshop Software Visual Identity

> **STATUS (2026-04-14):** **Phase 3 research — pre-launch, scheduled.** The original M1 deadline is superseded; Hossein wants quality over speed. This research underpins Phase 3 (visual refinement). It can be executed any time during Phases 1–2 as background work — the output is fed into `VISUAL_IMPLEMENTATION_PLAN.md` V1–V6. See `CLAUDE.md > Current priority order`.

> **Purpose:** Research competitor UIs, visual trends, and graphic resources in the garage/workshop management space. Distill findings into a concrete visual direction for the Oplaris product (starting with Dudley Auto Service). Hand this document to a Claude chat session to conduct the research.
>
> **Output:** A research report with screenshots/links, competitor analysis, recommended visual direction, and an asset shopping list.

---

## Context for the researcher

Oplaris is building a **workshop management web app** for UK independent garages. The first client is Dudley Auto Service (5 bays, ~10 staff). The product will be resold to other garages.

The app has **four UIs**: manager dashboard (desktop), technician mobile (phone, gloves, sunlight), tablet kiosk (walk-in reception), and a public customer status page. It uses **Tailwind + shadcn/ui + Lucide icons** on a clean blue (`hsl(221, 83%, 53%)`) primary colour.

**The problem:** The UI is functional and clear, but visually plain. We want to find a balance between **uniquely branded automotive identity** and **professional usability**. Think: subtle visual flair that says "this is built for garages" without becoming gimmicky or cluttered.

---

## Research phases

### Phase 1 — Competitor UI Audit (the big players)

Research the visual design of these established garage/workshop management platforms. For each, document: colour palette, typography, use of illustrations/icons, card design patterns, empty state design, dashboard layout style, and any automotive-specific visual elements.

**UK-focused competitors:**
1. **Garage Hive** (garagehive.co.uk) — popular UK garage management
2. **TechMan** (techtms.com) — widely used by UK independents
3. **MAM Software** (maboradstone.com / Autowork Online) — legacy but big market share
4. **iAutomate** (iautomate.co.uk) — newer entrant
5. **Workshop Software** (workshopsoftware.com.au) — Australian but good UI reference

**International / best-in-class:**
6. **Shop-Ware** (shop-ware.com) — US, known for modern UX
7. **Tekmetric** (tekmetric.com) — US, considered the gold standard for garage UX
8. **AutoLeap** (autoleap.com) — US, newer, mobile-first
9. **Mitchell 1** (mitchell1.com / Manager SE) — US enterprise
10. **RepairDesk** (repairdesk.co) — repair shop, not automotive, but excellent UI patterns

**Questions to answer for each:**
- What is their visual identity? Dark/light theme? Colour palette?
- Do they use automotive-specific graphics (car silhouettes, tool icons, engine illustrations)?
- How do they handle empty states (no jobs, no vehicles, etc.)?
- What does their bay board / job board look like?
- How do they present vehicle information (images, reg plates, make/model)?
- Do they have a mobile technician view? How does it differ visually?
- What makes their UI feel "automotive" vs a generic SaaS dashboard?
- Rate their visual polish: 1 (basic/clinical) to 5 (premium/branded)

### Phase 2 — Visual Pattern Research

Research specific visual design patterns used in automotive and industrial software:

**2A. Card design patterns:**
- How do automotive apps design vehicle cards, job cards, customer cards?
- What information density works? (preview vs detail)
- Use of colour coding, status badges, progress indicators
- Card hover/active states, micro-interactions

**2B. Automotive iconography and illustration:**
- What icon styles work best for garage software? (outline, filled, duotone)
- Where do competitors use illustrations vs icons vs text-only?
- Common automotive visual motifs: wrenches, gears, pistons, tyre treads, speedometers, dipsticks
- How do they avoid looking "clipart-y"?

**2C. Dashboard layouts in industrial/trade software:**
- How do garage apps lay out their main dashboard?
- KPI presentation: cards, charts, gauges, numbers?
- Use of real-time indicators (live bay status, active jobs)
- How do they handle information density for managers vs simplicity for techs?

**2D. Colour theory in automotive branding:**
- Research common colour palettes in automotive brands (workshops, not car manufacturers)
- What colours convey trust, professionalism, and mechanical competence?
- Dark mode prevalence in garage software (often preferred for workshop environments)
- How do top apps use accent colours for status indication?

### Phase 3 — Graphic Asset Sources

Evaluate these specific sources for automotive-themed visual assets. For each, find the best automotive/mechanical assets available and assess quality, style consistency, and fit with a modern shadcn/ui design:

**Free SVG & illustration libraries:**
1. **SVG Repo** (svgrepo.com) — search: car, wrench, engine, gear, mechanic, garage
2. **Undraw** (undraw.co) — recolourable SVG illustrations, search for mechanical/repair themes
3. **UXWing** (uxwing.com) — no-attribution icons, search automotive
4. **Vecteezy** (vecteezy.com) — vector art, search: automotive line art, mechanic illustration

**Pattern & texture generators:**
5. **Hero Patterns** (heropatterns.com) — subtle SVG background patterns
6. **Pattern.Monster** (pattern.monster) — geometric/organic pattern generator
7. **fffuel** (fffuel.co) — procedural SVG generators (gradients, noise, shapes)

**Icon systems (alternatives to Lucide):**
8. **Phosphor Icons** (phosphoricons.com) — 9000+ icons, 6 weights, automotive section
9. **Remix Icon** (remixicon.com) — 2200+ icons, outline/filled pairs

**Premium / paid (if budget allows):**
10. **Noun Project** (thenounproject.com) — curated icons, search: automotive, garage
11. **Icons8** (icons8.com) — multiple styles, animated icons available
12. **Blush** (blush.design) — mix-and-match illustration components

**For each source, answer:**
- How many relevant automotive/mechanical assets exist?
- Style: outline, filled, duotone, illustrative?
- Consistent enough to use across 4 different UIs?
- Licence: free, attribution required, or paid?
- Can assets be recoloured to match Oplaris blue (hsl 221 83% 53%)?

### Phase 4 — Visual Direction Synthesis

Based on all the above, produce:

**4A. Competitive positioning map:**
- Plot competitors on a 2×2: X-axis = simple ↔ feature-rich, Y-axis = clinical ↔ branded
- Where does Oplaris want to sit?

**4B. Recommended visual direction:**
- Proposed colour palette refinement (keep primary blue? add warm accent?)
- Typography recommendation (keep Inter or consider an alternative?)
- Illustration style recommendation (line art, flat, duotone, none?)
- Icon style (stay with Lucide, switch, or supplement?)
- Key visual motifs that say "automotive workshop" without being cheesy

**4C. Concrete asset shopping list:**
- Empty state illustrations needed (no jobs, no vehicles, no customers, no parts, etc.)
- Card decoration patterns (vehicle card, job card, bay card, customer card)
- Background textures for sections/headers
- Branded loading states
- Status page visual identity (public-facing, must look professional)
- Kiosk welcome screen visual

**4D. Moodboard brief:**
- 10-15 reference screenshots/links showing the target aesthetic
- Annotate what to take from each reference
- Identify 3 "north star" examples that nail the balance of branded + usable

---

## Deliverable format

Produce a structured markdown report with all findings, organised by phase. Include links to every source and competitor referenced. End with a clear "Recommended Next Steps" section listing exactly what assets to acquire/create and what design changes to implement.

---

## How to use this plan

Copy everything above into a **Claude chat session** (not Claude Code). Ask Claude to work through each phase sequentially, using web search to research each competitor and source. The researcher should take their time on Phase 1 — the competitor audit is the highest-value section and will inform everything else.
