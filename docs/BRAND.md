# CourtOps Brand & Design System Brief

> One-page reference for anyone (including claude.design) extending the visual system.
> The tokens here are formalized in [`src/app/globals.css`](../src/app/globals.css) as a Tailwind v4 `@theme` block — no design tools or build steps required to apply them.

---

## Positioning

**CourtOps** is a multi-tenant operations platform for court sport clubs — the "ops layer that sits on top of Court Reserve" reservation software. Pilot tenant is The Jar Pickleball Club; the product is designed to white-label to other clubs via subdomain (`*.courtops.app`).

**Voice:** clean, operational, no-nonsense. Think *Linear meets a club ops manual* — efficient, dense info, dark UI, sparse iconography. We are tools for people doing the actual work, not a marketing surface.

**Audience:** club owners, GMs, and day-to-day staff. Comfortable with dense information; impatient with anything decorative.

---

## Visual identity at a glance

| Aspect | Choice |
|---|---|
| **Theme** | Dark only (v1). No light theme planned. |
| **Font** | Inter, via `next/font/google` — loaded in [`src/app/layout.tsx`](../src/app/layout.tsx) |
| **Primary accent** | Orange (`#ea580c`, `brand-600`) — links, primary CTAs, owner role |
| **Base surface** | `#030712` (`surface-base` / gray-950) — app background |
| **Raised surface** | `#111827` (`surface-raised` / gray-900) — cards, modals, inputs |
| **Wordmark** | [`public/courtops-wordmark.svg`](../public/courtops-wordmark.svg) (placeholder) |
| **Mark** | [`public/courtops-mark.svg`](../public/courtops-mark.svg) (placeholder) |

---

## Color tokens

All tokens are defined in [`src/app/globals.css`](../src/app/globals.css) and exposed as Tailwind v4 utilities (`bg-*`, `text-*`, `border-*`).

### Brand

| Token | Hex | Use |
|---|---|---|
| `brand-600` | `#ea580c` | Primary buttons, links, focus rings, owner accent |
| `brand-500` | `#f97316` | Hover state for primary CTAs |
| `brand-400` | `#fb923c` | Foreground accent on tinted backgrounds |

The full 50–900 scale is available (`brand-50` → `brand-900`) and matches Tailwind's `orange-*` palette numerically.

### Role accents

The only other semantic color system already in use, applied in [`src/components/sidebar.tsx`](../src/components/sidebar.tsx) for role badges. Each is paired with a `*-fg` (text) of the lighter `-400` shade in usage.

| Token | Hex | Role |
|---|---|---|
| `role-owner` | `#ea580c` | CourtOps platform (Sami + future devs) |
| `role-admin` | `#2563eb` | Club admins (e.g. Geneva @ The Jar) |
| `role-staff` | `#16a34a` | Day-to-day staff |
| `role-viewer` | `#4b5563` | Read-only co-owners (e.g. Travis) |

### Surfaces & borders

| Token | Hex | Use |
|---|---|---|
| `surface-base` | `#030712` | App background |
| `surface-raised` | `#111827` | Cards, modals, inputs, sidebar |
| `surface-hover` | `#1f2937` | Hover / active states |
| `border-default` | `#1f2937` | Card borders |
| `border-strong` | `#374151` | Input borders, dividers |
| `border-subtle` | `#111827` | Near-invisible separators |

### Text

| Token | Hex | Use |
|---|---|---|
| `text-primary` | `#f9fafb` | Body text, headings |
| `text-secondary` | `#d1d5db` | Field labels, secondary copy |
| `text-tertiary` | `#9ca3af` | Captions, helper text |
| `text-muted` | `#6b7280` | Disabled, hints |

### Status

| Token | Hex (`-fg`) | Use |
|---|---|---|
| `success` (`success-fg`) | `#16a34a` (`#4ade80`) | Confirmations, active clock, "on shift" |
| `danger` (`danger-fg`) | `#dc2626` (`#f87171`) | Errors, destructive actions, overdue |
| `warning` (`warning-fg`) | `#d97706` (`#fbbf24`) | Pending review, caution states |
| `info` (`info-fg`) | `#2563eb` (`#60a5fa`) | Informational notices, admin accents |

---

## Radius

Existing usage clusters into three radii. Semantic aliases exist alongside the Tailwind defaults — use whichever reads more clearly in context.

| Semantic | Tailwind | Value | Use |
|---|---|---|---|
| `rounded-control` | `rounded-lg` | 8px | Inputs, buttons, small surfaces |
| `rounded-card` | `rounded-xl` | 12px | Cards, modals, dialog containers |
| `rounded-pill` | `rounded-full` | 9999px | Avatars, badges, status dots |

---

## Component inventory (current)

These already exist as bespoke components in [`src/components/`](../src/components/). A full design-system pass would graduate them to typed primitives (`<Button>`, `<Card>`, `<Modal>`, etc.) but they capture the existing patterns:

- [`sidebar.tsx`](../src/components/sidebar.tsx) — Responsive primary nav. Collapsible on mobile. Role badge in header. Notification bell with unread badge.
- [`toast.tsx`](../src/components/toast.tsx) — Global `ToastProvider` with `success` / `error` variants.
- [`embed-modal.tsx`](../src/components/embed-modal.tsx), [`edit-staff-modal.tsx`](../src/components/edit-staff-modal.tsx) — Modal pattern: `surface-raised` + `rounded-card` + backdrop.
- [`sop-content.tsx`](../src/components/sop-content.tsx) — Markdown renderer with safe iframe embeds.
- [`sop-suggest.tsx`](../src/components/sop-suggest.tsx) — Inline AI suggestion UI (✨ chip).
- [`calendar-month-grid.tsx`](../src/components/calendar-month-grid.tsx) — Month calendar used for availability + content.
- [`time-block-picker.tsx`](../src/components/time-block-picker.tsx), [`schedule-time-grid.tsx`](../src/components/schedule-time-grid.tsx) — Time-block grid for staff scheduling.

### Patterns observed (not yet componentized)

- **Card:** `bg-surface-raised border border-border-default rounded-card p-6`
- **Input:** `bg-surface-raised border border-border-strong rounded-control px-3 py-2 focus:ring-2 focus:ring-brand-600`
- **Primary button:** `bg-brand-600 hover:bg-brand-500 text-white rounded-control px-4 py-2`
- **Role badge:** `bg-{role}/20 text-{role}-fg rounded-pill px-2 py-0.5 text-xs`

A future PR can extract these as typed primitives. The tokens are already in place to support that work.

---

## Multi-tenant considerations

- Every club gets a subdomain. Each tenant uploads their **own logo** via Settings, stored in Supabase Storage and displayed in the sidebar header.
- The pilot brand (**The Jar**) is intentionally separate from the **CourtOps** platform brand. CourtOps tokens here describe the *platform shell*, not any individual tenant.
- A future v2 may allow tenants to override the brand accent (`--color-brand-*`) per-org. For v1, accent stays platform-owned.

---

## Out of scope (intentionally)

- Native mobile (web-responsive only)
- Light theme
- Marketing site / public-facing brand surface
- Print or email branding beyond the existing Resend invite template ([`src/lib/email.ts`](../src/lib/email.ts))

---

## Logo notes

The current [`courtops-wordmark.svg`](../public/courtops-wordmark.svg) and [`courtops-mark.svg`](../public/courtops-mark.svg) are **functional placeholders**:

- Geometric: rounded square with a horizontal divider line — abstract court split.
- Stroke `brand-600`; wordmark renders in `text-primary` on dark backgrounds.
- Wordmark uses Inter at the same weight/letter-spacing as in-app headings, but the glyphs are *live text*, not outlined paths — so they depend on Inter being available on the rendering surface. Good enough for app use and claude.design; should be converted to outlines for any cross-platform marketing use.

Replacing these with a properly designed mark + outlined wordmark is a known follow-up and a reasonable thing to ask claude.design to propose.
