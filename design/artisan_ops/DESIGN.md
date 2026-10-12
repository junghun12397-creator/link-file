---
name: Artisan Ops
colors:
  surface: '#fbf9f7'
  surface-dim: '#dbdad8'
  surface-bright: '#fbf9f7'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f1'
  surface-container: '#efedeb'
  surface-container-high: '#eae8e6'
  surface-container-highest: '#e4e2e0'
  on-surface: '#1b1c1b'
  on-surface-variant: '#4e4540'
  inverse-surface: '#30302f'
  inverse-on-surface: '#f2f0ee'
  outline: '#7f756f'
  outline-variant: '#d1c4bd'
  surface-tint: '#685c55'
  primary: '#170f0a'
  on-primary: '#ffffff'
  primary-container: '#2d241e'
  on-primary-container: '#988a82'
  inverse-primary: '#d3c3ba'
  secondary: '#904d00'
  on-secondary: '#ffffff'
  secondary-container: '#fe932c'
  on-secondary-container: '#663500'
  tertiary: '#061122'
  on-tertiary: '#ffffff'
  tertiary-container: '#1b2638'
  on-tertiary-container: '#828da3'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#f0dfd6'
  primary-fixed-dim: '#d3c3ba'
  on-primary-fixed: '#221a14'
  on-primary-fixed-variant: '#4f453e'
  secondary-fixed: '#ffdcc3'
  secondary-fixed-dim: '#ffb77d'
  on-secondary-fixed: '#2f1500'
  on-secondary-fixed-variant: '#6e3900'
  tertiary-fixed: '#d8e3fb'
  tertiary-fixed-dim: '#bcc7de'
  on-tertiary-fixed: '#111c2d'
  on-tertiary-fixed-variant: '#3c475a'
  background: '#fbf9f7'
  on-background: '#1b1c1b'
  surface-variant: '#e4e2e0'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  metric-display:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  metric-table:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: '0'
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-xs:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.875rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system establishes a high-performance management and analytics cockpit tailored for specialty cafe operations. It bridges the precision of enterprise financial software with the tactile hospitality of specialty coffee culture.

### Aesthetic Persona
- **Disciplined Warmth:** Avoids sterile cold corporate grays by anchoring neutral surfaces in roasted coffee undertones and warm off-whites.
- **Operational Clarity:** High contrast data representations, explicit tabular alignment, and zero ambiguity in fiscal health indicators (revenue, prep prep stock, waste, margins).
- **Tactile Utility:** Micro-elevations, crisp border definitions, and deliberate state changes that evoke artisan workshop clipboards and modern POS precision.

### Design Movement
**Modern Functionalism with Warm Editorial Nuance:** A balance of utility-first SaaS modularity (12-column layout, compact density, strict 4px/8px modular rhythm) paired with warm organic neutrals and crisp, structured typography.

## Colors

The palette balances deep roasted tones, corporate slate accents, and hospitality warmth with strict semantic clarity for high-velocity cafe auditing.

### Palette Architecture
- **Primary (`#2D241E` - Espresso Roast):** Structural headers, primary navigation sidebars, high-priority action buttons, and dominant typographic hierarchy.
- **Accent/Brand (`#D97706` - Warm Caramel Amber):** Focused highlights, active KPI indicators, primary interactive selections, and batch-prep milestone indicators.
- **Secondary Corporate (`#1E293B` - Slate Navy):** Secondary tabs, structured query bars, technical metadata badges, and cold operational reports.
- **Canvas & Surface:**
  - Base App Canvas: `#F8F6F4` (Warm Alabaster)
  - Card/Container Surface: `#FFFFFF` (Pure Crisp White)
  - Inset Table/Sub-row Surface: `#F1EDE8` (Steamed Latte Tint)
  - Subtle Border/Hairline: `#E5DFD9` (Milled Oat)
- **Financial & Operational Semantics:**
  - **Success / Profit / Ready (`#059669`):** Realized sales, optimal inventory, completed batches.
  - **Warning / Pending / Shortage (`#EA580C`):** Pending closing batches, expiring milk/syrups, near-depletion thresholds.
  - **Danger / Loss / Scrap (`#E11D48`):** Expired wastage, negative yield margins, reconciliation discrepancies.
  - **Neutral Info (`#0284C7`):** Order routing (Dine-in vs. Delivery) and informational logs.

## Typography

The typographical structure is optimized for rapid scanning during active shifts and exhaustive financial auditing at end-of-day.

### Numerical Fidelity (Tabular Numerals)
- All monetary metrics, stock weights (g, kg, oz), batch numbers, and timestamps must activate OpenType tabular numbers via `font-feature-settings: "tnum" 1, "cv05" 1`.
- When rendering comparisons (e.g., Target vs Actual yield), strict right-alignment is mandatory across desktop tables and card matrices.

### Visual Hierarchy Rules
- **Display Figures (`metric-display`):** Applied exclusively to top-level KPI widgets (Gross Daily Sales, Today's Prep Loss, Prime Cost Ratio).
- **Data Table Content (`body-md` / `metric-table`):** Compact line height ensures minimum 12 records are visible above the fold on desktop dashboards without overwhelming vertical white space.
- **Context Badges & Metadata (`label-xs`):** Rendered in uppercase with subtle letter-spacing for channel indicators (`DINE-IN`, `TAKEOUT`, `DELIVERY`).

## Layout & Spacing

A responsive layout strategy built to function smoothly on counter-top POS tablets (1024px landscape), manager back-office monitors (1440px+), and mobile manager audits (390px).

### Grid Configuration
- **Desktop (≥ 1280px):** 12-column responsive grid with a collapsed 260px fixed primary sidebar. Gutter: `1.5rem` (`24px`), Canvas Margin: `2rem` (`32px`).
- **Tablet / Countertop POS (768px - 1279px):** 8-column layout. Sidebar collapses into an icon rail (72px). Gutter: `1rem` (`16px`), Canvas Margin: `1.25rem` (`20px`).
- **Mobile (≤ 767px):** 4-column single-stack layout. Bottom floating navigation bar replaces sidebars. Margin: `1rem` (`16px`), Gutter: `0.75rem` (`12px`).

### Vertical Rhythm & Padding
- Dashboard metric cards employ `space-lg` (`20px`) inner padding to maintain breathing room around large numbers.
- High-density data grid rows use `space-sm` (`8px`) vertical cell padding with `space-md` (`14px`) horizontal cell padding.

## Elevation & Depth

This system rejects heavy, blurry drop shadows in favor of crisp architectural layering and warm tinted ambient boundaries.

### Layering Philosophy
- **Level 0 (Base Canvas):** Background color `#F8F6F4`. Flat plane with zero elevation.
- **Level 1 (Card & Module Surfaces):** Background `#FFFFFF` with a 1px boundary of `#E5DFD9` and a micro-diffused ambient shadow: `0 1px 3px rgba(45, 36, 30, 0.04), 0 1px 2px rgba(45, 36, 30, 0.02)`.
- **Level 2 (Hover States & Active Inset Panels):** Card lifts on interaction with shadow: `0 4px 12px -2px rgba(45, 36, 30, 0.08), 0 2px 4px -1px rgba(45, 36, 30, 0.04)` and border transitioning to `#D97706` (15% opacity).
- **Level 3 (Modals, Overlays, Floating Menus):** Pure white container with high-structure perimeter shadow: `0 16px 32px -6px rgba(30, 41, 59, 0.12), 0 6px 12px -4px rgba(30, 41, 59, 0.06)`, framed by a crisp border `#D1C7BD`. Backdrop utilizes a frosted dark roast blur: `rgba(45, 36, 30, 0.45)` with `backdrop-filter: blur(4px)`.

## Shapes

The geometric approach leverages purposeful, understated soft rounding (`roundedness: 1` = 0.25rem / 4px base radius) to maintain the professional, utilitarian aesthetic of an enterprise operating terminal.

### Corner Radius Mapping
- **Input Fields, Form Selects, & Standard Buttons:** `4px` (`rounded-sm`). Sharp enough to convey precision, rounded enough to avoid harsh brutalism.
- **Cards, Modals, Metric Tiles, & Table Wrappers:** `8px` (`rounded-lg`). Creates balanced framing around interior micro-elements.
- **Badges, Tags, & Status Pills:** `9999px` (`rounded-full`). Differentiates static analytical containers from interactive rectangular control switches.

## Components

### Buttons & Action Controls
- **Primary Button:** Background `#2D241E`, text `#FFFFFF`, radius `4px`, padding `8px 16px`. Hover: `#3E322A`. Active: `#1C1613`. Focus: ring 2px `#D97706` with 2px offset.
- **Secondary (Caramel Highlight):** Background `#D97706`, text `#FFFFFF`, radius `4px`. Used for positive workflow progression (e.g., "Complete Prep Shift", "Batch Out").
- **Ghost / Neutral Action:** Border 1px `#E5DFD9`, text `#2D241E`, background `#FFFFFF`. Hover: background `#F8F6F4`, border `#D1C7BD`.

### Data Tables & Numerical Records
- **Header:** Background `#F8F6F4`, border-bottom 1px solid `#E5DFD9`, font `label-md`, text `#64748B`, uppercase tracking.
- **Rows:** Alternating rows avoided; rely instead on clean 1px bottom divider `#F1EDE8`. Hover row background `#FDFBF7`.
- **Numeric Cells:** Mandatory right alignment, `font-variant-numeric: tabular-nums`, weight `600`.
- **Sub-totals & Reconciliation Rows:** Double bottom border `#2D241E`, background `#FDFBF7` with bold metrics.

### Status, Channel, & Reconciliation Badges
- **Channel Indicators (Store vs Takeout vs Delivery):**
  - Store (Dine-in): Background `#F1EDE8`, text `#2D241E`, icon: Cup.
  - Takeout: Background `#FEF3C7`, text `#B45309`, icon: Bag.
  - Delivery: Background `#E0F2FE`, text `#0369A1`, icon: Moped.
- **Reconciliation Badges (Actual vs Projected):**
  - Finalized / Closed: Solid badge background `#059669` (10% tint), text `#059669`, dot indicator filled.
  - Estimated / In-Progress: Dashed border 1px `#EA580C`, background `#FFF7ED`, text `#EA580C`.

### Form Controls & Inputs
- **Inputs & Selects:** Height `36px` (compact for dense data entry), border 1px `#D1C7BD`, background `#FFFFFF`, font `body-md`. Focus border `#D97706`, box-shadow `0 0 0 3px rgba(217, 119, 6, 0.12)`.
- **Currency Input:** Permanent prefix unit (₩, $, €) rendered in muted `#64748B` with rigid border divider inside the input box.

### Modals & Drawers
- **Batch Entry Modal:** Max-width 560px, header anchored with deep espresso `#2D241E` label, sticky footer with total delta reconciliation indicator before confirming checkout.