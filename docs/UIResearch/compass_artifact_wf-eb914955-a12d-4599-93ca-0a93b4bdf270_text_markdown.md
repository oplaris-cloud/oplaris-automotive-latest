# Oplaris workshop app: comprehensive UI/UX visual research

**Oplaris has a rare window to leapfrog every UK competitor on visual polish.** The UK garage management software market scores between 2/5 and 3.5/5 on design quality, while US cloud-native competitors like Shop-Ware and Tekmetric set the bar at 4.5/5. By targeting a visual polish level of 4–4.5/5 using Tailwind + shadcn/ui + Lucide supplemented with Phosphor Icons, Oplaris can deliver a product that feels dramatically more modern than anything a UK independent garage has seen — while costing zero in asset licensing if the free stack is used correctly.

This report covers four phases: a 10-competitor visual audit, design pattern research, asset source evaluation, and a synthesised visual direction with a concrete shopping list of what to build and acquire.

---

## Phase 1 — Competitor UI audit

### UK competitors score poorly on visual design

The UK garage management software market is dominated by functional but visually dated products. Every UK competitor builds automotive identity through workflow terminology (VHC, jobsheets, MOT lookups) rather than visual theming — not one uses meaningful automotive illustration or custom iconography in their product UI.

**Garage Hive** (garagehive.co.uk) — **Visual polish: 2.5/5**
Built on Microsoft Dynamics 365 Business Central, Garage Hive inherits the enterprise ERP aesthetic: light theme, Segoe UI typography, tile-based navigation, and factbox-heavy layouts. The brand colour is green, applied through website headers and CTA buttons, while the app itself uses standard BC blues and greys. Its standout visual element is the **TCard/Kanban board** — colour-coded drag-and-drop cards that auto-update when technicians start or finish jobs. Vehicle Health Checks use **traffic-light (red/amber/green) coding**, an industry-standard pattern. Power BI dashboards provide KPI visualisation but require separate configuration. The information density is very high, described as "complex" with mandatory training. The marketing website is modern, but the actual product feels like a well-configured ERP, not a purpose-built SaaS.

**TechMan** (techmangms.com) — **Visual polish: 2.5/5**
Dark navy marketing website with orange accents, but the in-app experience draws consistent criticism for being "clunky" (Capterra: 3.6/5). TechMan launched the first integrated Digital Kanban Board for UK garages, with traffic-light job progress tracking. The EVHC (TechView) tool captures photos and video for customer reports. Dashboard KPIs are customisable with threshold notifications. However, users report needing to "click on minimum 35 windows" to complete tasks — a sign of UI complexity over design clarity. No standalone mobile app; relies on responsive web for tablet use.

**MAM Software / Autowork Online** (mamsoftware.com) — **Visual polish: 2/5**
The most dated competitor. Now owned by Kerridge Commercial Systems and rebranded under Klipboard, Autowork Online uses a blue/teal corporate colour scheme with traditional form-based interfaces. The Workshop Diary and Work in Progress screen are table/list-based. The CarSide app provides mobile eVHC checklists, and TeamView handles paperless job cards on smart devices. Deep parts catalogue integration (Autocat) is a strength, but the visual experience looks circa 2015. Reviews praise "fast, simple, and efficient" functionality while acknowledging visual design is not a differentiator.

**iAutomate** (iautomate.co.uk) — **Not found**
Extensive searching across Google, Capterra, G2, SoftwareSuggest, Apple App Store, and UK garage industry publications returned no results for iAutomate as an active UK workshop management product. The domain may be inactive, rebranded, or extremely niche. This product does not appear in any 2025–2026 UK garage software comparison lists.

**Workshop Software** (workshopsoftware.com.au) — **Visual polish: 3.5/5**
The most visually modern of the UK-accessible competitors. Australian-built with a clean, consumer-grade SaaS aesthetic — white backgrounds, blue primary with orange accents, and a recently redesigned mobile app (March 2024). The booking diary offers daily, monthly, and list views. Digital vehicle inspections use green/yellow/red ratings with photo and video attachments. A customer portal lets clients access quotes and job history. The **dedicated iOS and Android app** with VIN barcode scanning and technician time clocking sets it apart from UK competitors that rely on responsive web. Praised for simplicity and ease of use, though reporting depth is limited.

### International competitors define the design ceiling

**Shop-Ware** (shop-ware.com) — **Visual polish: 4.5/5**
The visual benchmark for automotive workshop software. Dark navy marketing site transitions to a light in-app theme with a green (#2DB67D) accent palette. The signature UI innovation is the **green dot capacity system** — each dot represents one billed hour of shop capacity, creating an instantly scannable visual metaphor for utilisation. The DVX (Digital Vehicle Experience) presents inspection findings and repair recommendations to customers in an "eCommerce-like" experience with photos, videos, and line-item detail. The TechApp provides a 4-screen mobile workflow for technicians. Overall aesthetic feels "tech startup" rather than traditional automotive — professional, spacious, and confident.

**Tekmetric** (tekmetric.com) — **Visual polish: 4.5/5**
Tied with Shop-Ware for best-in-class. Uses teal/cyan blue (#00B4D8) as the primary accent with a recently refreshed brand identity. The Digital Vehicle Inspection (DVI) uses **traffic-light colour coding** (red/yellow/green) for findings with MotoVisuals integration — animated educational content that helps customers understand repairs. The dedicated iOS/Android mobile app (launched ~2024) includes VIN/plate scanning, photo markup with annotations, and real-time sync with the desktop job board. With **13,000+ shops** providing feedback, the UI is continuously refined. Marketing uses uppercase section labels and clean geometric sans-serif typography.

**AutoLeap** (autoleap.com) — **Visual polish: 4/5**
Forest green (#1B7A3D) brand colour with a clean, modern SaaS aesthetic. The **Kanban-style work board** with drag-and-drop RO management across workflow stages is AutoLeap's standout UI pattern — users describe it as "very helpful because often I just need a brief glimpse to help me make decisions." The technician app provides job assignments with instant notifications, DVI checklists, and time tracking. An AI Receptionist (AIR) feature uses a distinctive purple-toned branded illustration style, showing willingness to invest in differentiated visual identity. Marketing integrations (SEO, Google Ads) built directly into the platform are uncommon in the space.

**Mitchell 1 / Manager SE** (mitchell1.com) — **Visual polish: 2/5**
A Windows desktop application with 30+ years of heritage. Corporate blue (#003366) and red branding. The WIP (Work in Progress) screen is a dense table/list view — functional for experienced users but visually dated. Recent updates added customisable colour-coding for order status entries. The **Job View** feature groups labour and parts into logical "job containers" within estimates — a sophisticated information architecture pattern worth studying. 180+ reports make it the most comprehensive reporting suite in the category. However, no mobile shop management capability exists; the hybrid cloud model still requires a local Windows installation. Users consistently leave for cloud-native competitors citing the dated interface.

**RepairDesk** (repairdesk.co) — **Visual polish: 3.5/5**
Not automotive (electronics/phone repair), but valuable for UI patterns. Blue-purple (#4A6CF7) primary with orange/coral accents. The **POS-first design** optimises for counter transaction speed — a relevant pattern for the Oplaris kiosk UI. The December 2024 dashboard redesign introduced **drag-and-drop widget customisation** with saveable configurations and PDF export. The repair ticket workflow uses custom-definable multi-step stages with sequential enforcement. A **TV display integration** shows repair status in customer waiting areas — directly relevant to Oplaris's public status page. The Repair Category Tree (multi-level device/repair hierarchy) is a smart navigation pattern adaptable to automotive service categories.

### Cross-competitor visual polish summary

| Competitor | Polish | Theme | Primary colour | Architecture | Standout pattern |
|---|---|---|---|---|---|
| Shop-Ware | 4.5/5 | Light app | Green | Cloud | Green dot capacity |
| Tekmetric | 4.5/5 | Light app | Teal/cyan | Cloud | Traffic-light DVI |
| AutoLeap | 4/5 | Light | Forest green | Cloud | Kanban work board |
| Workshop Software | 3.5/5 | Light | Blue + orange | Cloud | Mobile-first app |
| RepairDesk | 3.5/5 | Light | Blue-purple | Cloud | Custom dashboard widgets |
| Garage Hive | 2.5/5 | Light (ERP) | Green | MS Dynamics | TCard bay board |
| TechMan | 2.5/5 | Light | Dark navy | Web | Digital Kanban |
| Mitchell 1 | 2/5 | Light (Win32) | Corporate blue | Desktop + cloud | Job View grouping |
| Autowork Online | 2/5 | Light | Blue/teal | Web | Parts catalogue depth |

---

## Phase 2 — Visual pattern research

### Card design patterns that work for workshops

**Vehicle cards** should lead with the registration plate as the primary identifier, displayed in a badge or pill format mimicking the UK plate style. Secondary information (make, model, year, colour) sits below as a metadata row, with tertiary data (mileage, MOT date, last service) available on hover or tap. The shadcn/ui Card component maps naturally to this: `CardTitle` for the reg plate, `CardDescription` for make/model, `CardContent` for detailed data, and `CardFooter` for action buttons like "Create Job" or "View History."

**Job cards** need a colour-coded left border or top stripe for instant status recognition — green for complete, amber for in progress, red for blocked/overdue, blue for waiting on parts. Show the job number, vehicle reg, customer name, assigned technician (small circular avatar), and estimated vs actual hours as a comparison figure. The Kanban workflow pattern (Booked → Checked In → In Progress → Waiting Parts → QC → Ready for Collection) is validated by AutoLeap, Shop-Ware, and ClickUp's mechanics templates.

**Information density** should differ dramatically by UI surface. Manager dashboards need **36–40px row heights** in dense tables, 4–6 KPI cards in the top 80–120px, and sortable columns. Technician mobile views need **48–52px row heights**, large cards with minimal info (current job, parts status, timer), and prominent action buttons. The key insight from dashboard pattern research: "Prioritise information density over whitespace — dashboard users are power users who want data, not breathing room."

**Status badges** should use the shadcn/ui Badge component extended with custom variants: `success` (green), `warning` (amber), `destructive` (red), `info` (sky blue), plus automotive-specific states like `waitingParts` (amber + Package icon) and `readyForCollection` (green + Car icon). Always pair colour with an icon and text label — **8% of male users have colour vision deficiency**, critical in a workshop environment.

**Micro-interactions** matter for perceived quality. Loading skeletons (content-shaped placeholders with shimmer animation, Stripe/Linear pattern) reduce perceived load time **20–30% compared to spinners**. Hover states should increase card elevation (shadow-md → shadow-lg) with 200ms ease-in-out transitions.

### Automotive iconography without the clipart feel

Lucide provides a solid baseline with `Car`, `CarFront`, `Wrench`, `Cog`, `Gauge`, `Fuel`, `Truck`, `Timer`, `ClipboardList`, and `Camera` — sufficient for core navigation and status indicators. However, **critical automotive icons are missing**: engine, car battery, oil can, brake disc, spark plug, diagnostic scanner, tyre, and steering wheel.

The cardinal rule for avoiding a clipart aesthetic is **consistent stroke weight** (2px across all icons, matching Lucide's standard), single colour per icon, and minimal detail. A clean wrench outline reads as professional; crossed wrenches with a banner reads as clip art. A simple car silhouette (side profile) is clean; a cartoon car with eyes is amateur. The threshold test: if an icon needs more than three seconds to parse, it's too complex for UI chrome.

For custom automotive SVGs not in Lucide, follow Lucide's design guidelines: 24×24 grid, rounded corners, consistent padding, balanced negative space. Create simple outline versions of engine block, oil drop, brake disc with caliper, OBD port/plug, and tyre with minimal tread lines. These should feel like natural extensions of the Lucide set.

### Dashboard layouts for the workshop context

The **metric strip pattern** (proven by Stripe and Linear) works best for the manager dashboard: 4–6 KPI cards across the top 80–120px showing revenue today, bay utilisation percentage, jobs completed vs booked, average job value, outstanding invoices, and customer satisfaction. Each card contains one primary number (28–32px), one trend indicator, and one sparkline. Use CSS Grid with `auto-fill, minmax(200px, 1fr)` for responsive behaviour.

**Bay board layouts** should default to Kanban columns (validated by every modern competitor) with an alternative grid/bay view showing physical bay representation. The grid view maps rows to bays, each showing current job card, technician, and ETA, colour-coded: green (available), blue (occupied, on schedule), amber (running late), red (blocked). A timeline/Gantt view for scheduling completes the trifecta.

For the **tablet kiosk** (reception), design a simplified check-in flow: search by reg → confirm appointment → update contact info → check in. The kiosk should auto-refresh every 30–60 seconds for live status. Touch targets must be **44px minimum**, with a simplified navigation structure (bottom nav or minimal sidebar).

The **technician mobile view** needs bottom tab navigation, a card stack (vertical scroll, one job focus at a time), large thumb-friendly action buttons (Start/Pause timer, Request Parts, Mark Complete, Take Photo), and camera integration for inspection photos. Consider offline capability for workshops with poor signal.

### Colour theory supports the blue primary choice

Oplaris's primary blue (`hsl(221, 83%, 53%)`, approximately #3b82f6) is a strong choice. Blue is the **#1 colour for trust in professional services** — used by Ford, VW, BMW, Bosch, and virtually every financial institution. Research from colour psychology studies confirms blue "conveys trust and professionalism" and "promotes trust and dependability," exactly the attributes a workshop management tool needs to project.

**Differentiate through design quality and accent colours, not by fighting against blue.** Many UK garages already use blue in their branding; the app will feel familiar. The competitive landscape actually favours blue — Shop-Ware uses green, Tekmetric uses teal, AutoLeap uses forest green. Oplaris's saturated blue carves out distinct visual territory.

The recommended semantic colour system alongside the blue primary:

| Role | Colour | HSL | Usage |
|---|---|---|---|
| Primary | Blue | hsl(221, 83%, 53%) | Brand, primary actions, links, active states |
| Success | Green | hsl(142, 71%, 45%) | Completed, paid, passed, on schedule |
| Warning | Amber | hsl(38, 92%, 50%) | Approaching deadline, awaiting approval |
| Error | Red | hsl(0, 84%, 60%) | Overdue, failed, blocked, critical |
| Info | Sky blue | hsl(199, 89%, 48%) | Informational, new items |
| Neutral | Slate grey | hsl(215, 20%, 65%) | Inactive, draft, archived |

Implement using CSS custom properties (shadcn/ui's native approach) with separate light/dark mode token values. A two-layer system — base palette mapped to semantic tokens like `--status-success` — makes dark mode adaptation trivial.

**Dark mode should be offered** but contextually defaulted. Light mode for office and reception screens (better colour accuracy, print-readiness). Dark mode for technician bay environment and long-duration monitoring screens (bay board on wall TV). For technician outdoor/sunlight use, light mode with **WCAG AAA contrast (7:1)** is essential — avoid low-contrast greys on critical status text and use solid background fills behind badges.

---

## Phase 3 — Graphic asset source evaluation

### The free stack covers 90% of needs

**Primary icon system: Lucide + Phosphor Icons.** Phosphor (phosphoricons.com) scores **5/5 quality** and is the top recommendation to supplement Lucide. It provides ~20 automotive-specific icons that Lucide lacks — engine, car-battery, gas-pump, gauge, steering-wheel, car-profile — across **six weight variants** (Thin, Light, Regular, Bold, Fill, Duotone). MIT licensed, no attribution required. The `@phosphor-icons/react` package integrates seamlessly alongside `lucide-react`, and both share similar 24×24 design grids. The **duotone variant** is particularly valuable for feature highlights and empty state accents.

**Illustrations: Undraw** (undraw.co) scores **4.5/5** and is the primary choice for empty states, onboarding screens, and error pages. All illustrations are free, open-licence, no attribution required, and feature a **live colour picker** that applies #3b82f6 to every illustration before download. The limitation is only ~5–10 directly automotive-relevant illustrations, but "fix," "repair," "service," "maintenance," and "building" searches yield usable results for workshop contexts.

**Supplementary automotive icons: UXWing** (uxwing.com) provides ~40–60 clean automotive icons as solid-glyph SVGs with **no attribution required** — free for commercial use. The dedicated "Automotive Icons" category includes car types, repair indicators, and tool icons not found in Lucide or Phosphor.

**Background textures: Hero Patterns** (heropatterns.com) scores **4.5/5** with 80+ repeatable SVG patterns designed by Steve Schoger (the Tailwind UI designer). The **Circuit Board** pattern at 3–5% opacity with #3b82f6 foreground on white creates a subtle tech-industrial workshop feel. The `tailwindcss-hero-patterns` plugin provides native Tailwind integration. **fffuel** (fffuel.co) complements this with generative SVG backgrounds — the `gggrain` tool produces grainy blue-to-dark-blue gradients perfect for hero sections and login pages.

**Pattern.Monster** (pattern.monster) adds 320+ customisable SVG patterns for variety beyond Hero Patterns. Free for commercial use, with geometric patterns (hexagons, chevrons, cross-hatches) suitable for industrial aesthetics.

### Paid sources are optional but valuable for niche needs

**Noun Project** ($9.99/month Creator Pro) provides access to ~10,000+ automotive icons — the broadest collection for niche needs like specific car part diagrams, vehicle lift icons, or brake pad illustrations. Quality varies, so manual curation is required.

**Icons8** ($24/month) offers multi-style icon sets (iOS, Material, 3D, animated) and illustration packs. Worth considering only if cross-platform visual consistency across multiple design languages is needed.

**Blush** ($12/month Pro) provides customisable character illustrations — adjustable hair, clothes, skin tones — but has limited automotive-specific content. Undraw covers similar ground for free.

**Vecteezy** has massive quantity (78,000+ mechanic results) but inconsistent quality, attribution requirements on free assets, and heavy free/Pro mixing. Not recommended as a primary source.

**SVG Repo** (svgrepo.com) is useful for one-off specialty icons (~200–300 automotive results) but licence terms vary per icon and styles are inconsistent. Cherry-pick from curated collections only.

### Asset source comparison

| Source | Auto assets | Licence | Attribution | Quality | Primary use |
|---|---|---|---|---|---|
| Phosphor Icons | ~20 + 1,500 total | MIT | No | 5/5 | Supplementary icon system |
| Undraw | ~5–10 | Free/open | No | 4.5/5 | Empty states, onboarding |
| Hero Patterns | 80+ patterns | CC BY 4.0 | Yes | 4.5/5 | Subtle backgrounds |
| fffuel | 15+ generators | Free | No | 4.5/5 | Hero/login backgrounds |
| UXWing | ~40–60 | Free commercial | No | 4/5 | Auto-specific icons |
| Pattern.Monster | 320+ patterns | Free | No | 4/5 | Varied backgrounds |
| Remix Icon | ~12 auto / 2,800 | Remix v1.0 | No | 4/5 | General UI supplement |
| Noun Project | ~10,000+ | $9.99/mo | Paid: no | 3.5/5 | Niche specialty icons |

---

## Phase 4 — Visual direction synthesis

### Competitive positioning: Oplaris should target the upper-right quadrant

Plotting competitors on a 2×2 matrix of **simple ↔ feature-rich** (x-axis) and **clinical ↔ branded** (y-axis):

```
                    BRANDED
                       │
     Workshop Software │  AutoLeap    Shop-Ware
                       │                 ●
                       │              Tekmetric
                       │
  SIMPLE ──────────────┼────────────────── FEATURE-RICH
                       │
                       │  TechMan     Garage Hive
          RepairDesk   │              Mitchell 1
                       │  Autowork Online
                       │
                    CLINICAL
```

**Oplaris should position in the upper-right quadrant** — feature-rich AND branded — sitting near Shop-Ware and Tekmetric but with a distinctly British, professional identity. The UK market has no competitor occupying this space. The gap between UK incumbents (lower-right, clinical + feature-rich) and the US leaders (upper-right, branded + feature-rich) represents Oplaris's primary competitive advantage on visual design.

The key tension to manage: the first client is a 5-bay, 10-staff independent garage that needs simplicity for technicians, but the product must also demonstrate depth for managers. Solve this through **role-based information density** — the same data, presented at different levels of detail per UI surface — rather than reducing total features.

### Recommended visual direction

**Colour palette refinement.** Keep `hsl(221, 83%, 53%)` as the primary blue — it's differentiated from competitors (Shop-Ware green, Tekmetric teal, AutoLeap green) and lands in the trust/professionalism sweet spot. Extend with a full semantic palette:

- Primary blue: `hsl(221, 83%, 53%)` — brand, actions, links
- Primary dark: `hsl(221, 83%, 40%)` — hover states, emphasis
- Primary light: `hsl(221, 83%, 95%)` — backgrounds, selected states
- Success green: `hsl(142, 71%, 45%)` — completed, passed, on-time
- Warning amber: `hsl(38, 92%, 50%)` — deadlines, caution, awaiting action
- Error red: `hsl(0, 84%, 60%)` — overdue, failed, critical
- Bay-occupied blue: `hsl(221, 60%, 55%)` — active work in progress
- Ready-for-collection teal: `hsl(160, 60%, 45%)` — distinct from success green
- Neutral slate: `hsl(215, 20%, 65%)` — inactive, archived

**Typography: keep Inter.** Inter is the default for shadcn/ui, renders excellently at all sizes, has extensive weight options, and is free. Every top-tier competitor uses a similar geometric sans-serif. Do not switch — switching fonts adds complexity without meaningful differentiation. If a display font is desired for marketing pages or the kiosk welcome screen, consider **DM Sans** (slightly warmer geometric) for headings only.

**Illustration style: flat line-art with brand blue accent.** Use Undraw illustrations recoloured to #3b82f6 for empty states and onboarding. For automotive-specific illustrations (workshop scene, bay board, vehicle inspection), commission simple line-art SVGs in the Undraw style — monochrome grey linework with the blue primary as a single accent colour. This matches shadcn/ui's clean aesthetic and avoids the clipart problem.

**Icon strategy: Lucide primary, Phosphor supplementary.** Continue with Lucide for all standard UI icons (navigation, actions, status). Add `@phosphor-icons/react` for automotive-specific icons: `Engine`, `CarBattery`, `GasPump`, `Gauge`, `SteeringWheel`, `CarProfile`. For icons neither library provides (brake disc, spark plug, OBD port, tyre), create custom SVGs following Lucide's 24×24/2px stroke design language. Use Phosphor's **duotone** weight for feature callouts and empty state accents — it adds visual richness without breaking consistency.

**Automotive visual motifs that aren't cheesy.** The strongest competitors (Shop-Ware, Tekmetric) avoid decorative automotive graphics entirely — their apps feel "automotive" through data context and workflow design, not wrench clipart. Follow this approach:

- Use the **UK registration plate format** as a visual motif for vehicle cards — the yellow/white plate shape is instantly recognisable and distinctly British
- Employ **traffic-light colour coding** (red/amber/green) for vehicle health checks — universal in the industry
- Design the **bay board** as a physical-digital metaphor — digital T-cards that reference the physical boards workshops already use
- Apply **subtle geometric patterns** (Hero Patterns Circuit Board at 3% opacity) to backgrounds for a tech-industrial undertone
- Avoid: cartoon mechanics, crossed-wrench crests, gear borders, skeuomorphic gauges, chrome/metallic textures

### Concrete asset shopping list

**Empty state illustrations needed (source: Undraw, recoloured to #3b82f6):**

1. "No jobs today" — workshop/calendar empty (search: "empty," "void," "blank canvas")
2. "No vehicles found" — search result empty (search: "not found," "searching")
3. "No customers yet" — CRM empty (search: "people," "community")
4. "First booking" — onboarding prompt (search: "welcome," "start," "begin")
5. "No invoices" — financial section empty (search: "finance," "payments")
6. "Service complete" — confirmation (search: "done," "complete," "success")
7. "Connection lost" — offline state (search: "connection," "server," "signal")
8. "Error occurred" — error page (search: "error," "warning," "bug")

**Card decoration patterns (source: Hero Patterns + fffuel):**

- Dashboard header: `gggrain` gradient (blue-to-dark-blue) at 100% behind white text
- KPI card backgrounds: solid white with 1px border, no pattern (keep clean)
- Empty state cards: Hero Patterns "Topography" at 2% opacity
- Bay board background: Hero Patterns "Circuit Board" at 3% opacity on slate-50
- Login/welcome page: `fffuel` ffflurry lines or gggrain gradient as hero background
- Invoice/estimate headers: subtle Hero Patterns "Architect" at 2% for blueprint feel

**Background textures (source: Hero Patterns, configured via tailwindcss-hero-patterns plugin):**

- Circuit Board: tech-industrial feel for dashboard sections
- Hexagons: mechanical/industrial for sidebar or header backgrounds
- Topography: subtle organic texture for card and modal backgrounds
- Diagonal Lines: workshop/blueprint feel for print-oriented views

**Branded loading states:**

- Skeleton screens (shimmer animation) for all data-loading states — use shadcn/ui Skeleton component
- Oplaris logo pulse animation (subtle scale 1.0→1.05→1.0 with opacity fade) for full-page loads
- Progress bar (linear, primary blue) for multi-step operations (invoice generation, bulk updates)
- Bay-specific: animated wrench icon (Lucide `Wrench` with CSS rotation) for "processing" states

**Status page visual identity (public customer page):**

- Light theme only (customer-facing, needs maximum readability)
- Minimal chrome: Oplaris logo + garage branding (logo, name, phone number)
- Vehicle status card: reg plate prominently displayed, current job status with estimated completion
- Timeline view: step indicators showing workflow progress (Checked In → Diagnosing → Repairing → QC → Ready)
- RepairDesk's TV display pattern is the closest reference — simple, auto-refreshing, status-focused

**Kiosk welcome screen (tablet reception):**

- Full-width hero with garage branding (configurable per client)
- Large "Check In" button (primary blue, 60px+ height, centred)
- Secondary actions: "New Customer," "View Status," "Contact Us"
- Background: subtle fffuel gradient or Hero Patterns texture
- Auto-return to welcome screen after 60 seconds of inactivity
- High-contrast, large touch targets (56px+ for primary actions)

### Moodboard brief: 10 target aesthetic references

**North Star #1: Shop-Ware's capacity dashboard** (shop-ware.com/features/capacity-management/)
Take: the green dot capacity metaphor — adapt as blue dots for Oplaris. Each dot = 1 hour of bay capacity. The simplicity of this visualisation communicates complex data instantly. Also take: the overall spaciousness and confidence of the layout, generous whitespace, and the dark marketing site / light app duality.

**North Star #2: Tekmetric's DVI workflow** (tekmetric.com/feature/digital-vehicle-inspection)
Take: the traffic-light inspection system with photo markup annotations. The red/yellow/green finding cards are universally understood. Also take: the mobile-first technician workflow with camera integration, and the clean typographic hierarchy with uppercase section labels.

**North Star #3: Linear's dashboard and product design** (linear.app)
Take: the overall design system quality — Inter typography, muted colour palette with strategic colour accents, skeleton loading states, keyboard-first interaction model, and the way information density is managed through progressive disclosure. Linear is not automotive, but it represents the polish level Oplaris should target. The dark sidebar + light content area pattern is directly applicable.

**Additional references:**

4. **AutoLeap's work board** (autoleap.com/features/work-board/) — Take: Kanban drag-and-drop job cards with colour-coded status badges. The column-based workflow visualisation is the most intuitive pattern for a bay/job board.

5. **Stripe Dashboard** (dashboard.stripe.com) — Take: KPI metric strip at top with sparklines, clean data tables with inline actions, progressive disclosure pattern, and the overall information hierarchy approach. Stripe's balance of density and clarity is exemplary.

6. **RepairDesk's customisable dashboard** (repairdesk.co/features/) — Take: drag-and-drop widget arrangement with saveable configurations. Also take: the TV display / customer-facing status board concept for the public status page.

7. **shadcn/ui Blocks** (ui.shadcn.com/blocks) — Take: the reference implementation patterns for sidebars, data tables, cards, forms, and authentication pages. These are the direct building blocks for Oplaris's UI.

8. **Vercel Dashboard** (vercel.com/dashboard) — Take: the deployment status timeline (adaptable to job status timeline), the clean project card design, and the system status page design (reference for Oplaris's public customer page).

9. **Notion's empty states** — Take: the friendly, minimalist illustration style for zero-data screens. Simple line art with a single accent colour, accompanied by clear CTAs that guide users to their first action.

10. **ServiceTitan's reporting dashboard** (servicetitan.com) — Take: the trade-specific KPI presentation (revenue vs missed opportunities, technician performance comparison, job-level costing drill-down). ServiceTitan demonstrates how a field-service platform can present complex business data for trade professionals.

11. **Figma's sidebar navigation** (figma.com) — Take: the collapsible sidebar with icon-only rail mode (240px expanded → 64px collapsed), the nested navigation with sections, and the contextual right panel pattern (applicable to job detail panels).

12. **Cal.com booking flow** (cal.com) — Take: the clean appointment scheduling UI with time slot selection, built on shadcn/ui. The open-source codebase is a direct reference for the kiosk booking interface and online booking flow.

---

## Recommended next steps

**Immediate actions (Week 1):**

1. Install `@phosphor-icons/react` alongside `lucide-react` and create an icon mapping document listing which library provides each required icon
2. Install `tailwindcss-hero-patterns` plugin and configure Circuit Board, Hexagons, and Topography patterns at 2–5% opacity in the Tailwind config
3. Download 8 Undraw illustrations (listed in shopping list above), recoloured to #3b82f6, and save as SVG components
4. Define the full semantic colour token system in CSS custom properties with light and dark mode values
5. Create a Badge component variant map: `success`, `warning`, `destructive`, `info`, `waitingParts`, `inBay`, `readyForCollection`, `qualityCheck`

**Design system foundations (Week 2–3):**

6. Build vehicle card, job card, and customer card components using shadcn/ui Card with the documented information hierarchy (reg plate → make/model → status → actions)
7. Implement the bay board as a Kanban board with columns: Booked → Checked In → In Progress → Waiting Parts → QC → Ready for Collection → Collected
8. Design the KPI metric strip (4–6 cards) for the manager dashboard header, following the Stripe pattern (primary number + trend + sparkline)
9. Create skeleton loading states for every card type using shadcn/ui Skeleton component
10. Build the responsive sidebar with collapsible icon rail (240px → 64px) following the Figma/Linear pattern

**Custom assets (Week 3–4):**

11. Create 5–8 custom automotive SVG icons following Lucide's 24×24/2px stroke design language: engine, oil drop, brake disc, spark plug, OBD port, tyre, car lift, exhaust
12. Design the UK registration plate visual motif for vehicle cards (yellow rear / white front plate shape as a decorative element)
13. Generate fffuel gggrain gradient backgrounds for login page, kiosk welcome screen, and marketing sections
14. Design the public customer status page with timeline progress indicators and auto-refresh

**Role-specific UI refinement (Week 4–5):**

15. Build the technician mobile layout with bottom tab navigation, large touch targets (56px+), and high-contrast mode for sunlight visibility
16. Design the tablet kiosk check-in flow: welcome → search reg → confirm appointment → check in, with 60-second auto-return
17. Implement dark mode tokens for the technician and bay board views, defaulting to system preference
18. Test all semantic colours against WCAG AAA (7:1) for outdoor/bright-light scenarios and deuteranopia simulation

**Competitive differentiation (Ongoing):**

19. Develop a unique capacity visualisation (inspired by Shop-Ware's green dots but using Oplaris blue) — each dot = 1 hour of bay capacity, creating an instantly scannable utilisation indicator
20. Build the customer-facing inspection report with traffic-light findings (red/amber/green), photo evidence, and one-tap approval — targeting the "eCommerce-like" experience Shop-Ware and Tekmetric have pioneered
21. Design the workshop wall display mode (bay board on a TV) with auto-refresh, large text, high contrast, and countdown timers for estimated completion

The $0 asset stack (Lucide + Phosphor + Undraw + UXWing + Hero Patterns + fffuel + Pattern.Monster) covers approximately 90% of visual asset needs. Add Noun Project Creator Pro ($9.99/month) only if niche automotive icons are needed beyond what custom SVGs can provide. The primary investment is design and development time, not asset licensing — which is exactly where Oplaris should be spending to build a product that looks nothing like the dated UK incumbents and everything like the best-in-class US platforms.