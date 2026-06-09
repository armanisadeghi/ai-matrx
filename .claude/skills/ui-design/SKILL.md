---
name: ui-design
description: >-
  Build high-quality, professional, modern UI for the AI Matrx Admin app
  (Next.js 16 / React 19 / Tailwind 4). Use this whenever you are creating or
  significantly reworking ANY user-facing page, dashboard, panel, list, table,
  form, settings surface, or component — even if the user only says "build a page
  for X", "make a UI for Y", "design a dashboard", "lay this out", or "make it
  look good / professional / nicer". This is the judgment-and-quality layer: who
  the page is for, what real product to model it after, how to get density with
  clarity, how to use the app's own glass and tokens, when a table beats a card,
  and how to make sure it actually works on mobile. Read this BEFORE writing JSX
  for a new surface. (For pure Tailwind-conformance mechanics — fluid type,
  container queries, CSS animations — see the web-design migration checklist; for
  mobile mechanics see ios-mobile-first.)
---

# Building high-quality UI for AI Matrx

This app competes with Google, Microsoft, Notion, Linear, Stripe. The bar is real, working, professional interfaces that a competent paying professional uses to get a job done — not demos, not marketing pages. Optimize for their speed and clarity. Never explain the obvious to someone already inside the tool.

Below is the order of operations that reliably produces great results. Follow it before you write JSX.

---

## Rule 1 — Model it after something real. State it out loud.

This is the single most important thing in this skill, because it is the one lever that moves output the furthest.

Before you design anything, **name the specific product or screen you are modeling this UI after**, and say it in your response: *"I'm modeling this task list after macOS Reminders,"* *"I'm modeling this issues view after Linear,"* *"I'm modeling this billing page after Stripe's dashboard."* Then build toward that reference.

Why this matters: an LLM asked to "make a beautiful, modern, professional page" averages toward the most common pattern in its training data — which is the generic, slightly-AI-looking mean. Constraints and concrete references are the only things that pull output off that mean. The same request described a thousand abstract ways produces garbage; *"model it after the macOS task list"* produces something genuinely good, because the model knows that artifact cold. A real reference carries layout, density, hierarchy, and interaction decisions for free.

**Mimic** the reference's: layout and structure, information density, visual hierarchy, interaction patterns, component anatomy (how a row, a card, a toolbar is composed).

**Never mimic** its colors, fonts, or brand. Those come from *our* design system, always (Rule 3). You are borrowing the reference's *bones and behavior*, not its paint.

The reference and the persona (Rule 2) pick each other: choosing macOS Reminders already tells you this is a consumer-getting-stuff-done surface; choosing a heavyweight enterprise PM tool tells you it's for the enterprise client. Pick a reference whose audience matches your page's audience.

If you genuinely cannot pick a fitting reference, that's the signal to ask the user one sharp question — not to fall back on inventing from scratch.

---

## Rule 2 — Know who this page is for.

Every page serves one of three personas. They are **all desktop-first** (this app is used on large monitors to do work), but they want very different things. Identify the target for *this specific page*. If it's genuinely ambiguous, ask one question; otherwise infer it from the route and the data and proceed — a good agent figures this out.

- **Consumer** — a person *paying for this product* and using its dashboard to get something done (not a marketing visitor). Give slightly more visual breathing room. Rounded corners, subtle gradients, and **our glass** are welcome — but only when they don't distract from the goal. Model after polished consumer apps (macOS/iOS, Notion, Linear).
- **Enterprise Client** — a professional doing daily work in the system on a big monitor. Dense, utilitarian, high information density, sharp hierarchy. Get more on screen. Model after industry-leading enterprise tools.
- **System Admin** — managing the backend; wants maximum density, performance, and pure results. Zero aesthetic BS, zero wasted space, no narration. Model after utilitarian control panels — including this app's own `/[feature]/admin` maps ("utilitarian by design, never pretty, never fails to connect a resource").

Route group is a strong hint: `app/(core)/` ≈ consumer/enterprise product surfaces; `app/(admin)/` ≈ system admin.

Persona sets your **base density**: breathing room for consumers, tight for enterprise, tightest for admin. Everything below scales to it.

---

## Rule 3 — Borrow the reference's bones, but paint with OUR system.

The reference gives you structure. The visual language is always ours. Hardcoding colors or rolling your own glass is what makes output look off-brand and AI-generated. Everything you need already exists — see **`references/design-system-anchors.md`** for exact class names and component paths.

- **Color:** semantic classes only — `bg-card`, `bg-muted`, `bg-accent`, `text-foreground`, `text-muted-foreground`, `text-primary`, `border-border`, status colors. Never raw hex / `bg-zinc-*` / `text-gray-*`.
- **Glass is ours.** Glass is a core part of this app — use it freely, but use *our* glass: `bg-glass border border-glass-edge backdrop-blur-glass backdrop-saturate-glass shadow-glass`, or `<GlassContainer>` / `GlassPortal`. Never hand-roll `bg-white/10 backdrop-blur-md` — that's the generic frosted-on-pastel tell, not us.
- **Depth:** `--elevation-1/2/3`. **Backgrounds:** `bg-textured` for pages, `bg-card` for cards. **Icons:** Lucide only, never emoji (this is enterprise).
- **Reuse before you build.** There is already a `GenericDataTable` (filter/sort/paginate), official cards, sheets, layouts, loading skeletons, and dialog/toast primitives. Extend those. Building a one-off when a primitive exists is the doctrine violation this app cares most about — check the anchors file first.

---

## Rule 4 — Density with clarity (not empty space, not glued together).

Fit a lot of *useful* information on one screen on purpose — the way Apple, Stripe, and Linear do — through a strict grid, typographic hierarchy, and deliberate spacing. Not by spraying padding, and not by gluing unrelated things together.

- Use a fixed spacing scale (4 / 8 / 16 / 24 / 32). Every gap is a decision, not a default. Space *means* something: it separates groups that differ and binds things that belong together.
- Whitespace must separate **meaningful** groups. Empty space whose only effect is to push content below the fold is a defect.
- No card-in-card-in-card. Avoid wrapping a wrapped item in another wrapper. Flatten.
- Show things as what they are. Differentiate real entity types (agents, data sources, utilities, files) by group, label, and filter — never flatten distinct things into one generic "items" bucket.
- Show what the user needs without extra clicks or scrolls. Keep secondary detail one interaction away (hover, expand, drawer), not buried, not all dumped at once.

---

## Rule 5 — Cut redundant chrome.

The user is already inside the tool. Don't narrate it.

- No "Welcome to…", no restating the page name as a title, no paragraph explaining how the feature works. If removing a text element loses nothing, remove it.
- **Keep** genuinely functional scaffolding: breadcrumbs, top utility/action bars, search, filters, and a clear primary/secondary button hierarchy so the main action is instantly obvious. (These aid navigation and action — they are not narration. That's how this reconciles with "cut chrome": kill explanatory prose, keep working controls.)

---

## Rule 6 — Pick the right tool for the data; default to a table.

There is no "always cards" or "always tables" — pick the structure that fits the job:

- **Tables / data-grids** for homogeneous, scannable record sets the user compares, sorts, and acts on row-by-row.
- **Cards / boards / galleries** when items are heterogeneous or inherently visual (media, kanban, dashboards of mixed widgets).

**But if you are not going to actually reason it through, reach for a table and make the enterprise client happy.** A good table beats a mediocre card grid almost every time.

When you do build a table, it must earn the name — use `GenericDataTable` (it has these built in): column **filtering**, column **sorting**, **pagination**, **zebra striping** for scannability, and a **dedicated actions column** (usually far right: view / edit / delete).

---

## Rule 7 — Mobile must work. It is the floor, not the axis.

Desktop-first is correct for this app. But all three personas occasionally pull out a phone and need to *do the thing* — and right now the real failure is pages that are simply **broken** on mobile: one stray sentence or element becomes a single skinny column that turns into nine screens of scrolling.

Your obligation is not "mobile-first" — it's **"never broken on mobile."** Concretely:

- Before you finish, look at the layout at a narrow width. Anything that forces a tall, useless single-column scroll (long text not wrapped/clamped, a wide row not reflowed, a fixed-width element overflowing) is a defect — fix it.
- Use the app's responsive primitives (`AdaptiveLayout` stacks on mobile; `useIsMobile()` to branch; `FloatingSheet`/drawers instead of desktop modals).
- If a surface genuinely cannot adapt, build the mobile view deliberately — but the bar is a real, usable experience on both, not a desktop layout crammed onto a phone.

For mobile **mechanics** (viewport units, safe areas, touch targets, `h-page`, `pb-safe`, drawer-not-dialog), defer to the **ios-mobile-first** skill — don't reinvent them here.

---

## Rule 8 — Long-running & streaming work reveals itself.

For async/long-running operations, never show a blank screen or a lone spinner. Stream partial output as it arrives, show stage-by-stage progress, and keep the user oriented on what's done, what's running, and what's next. Use the app's loading skeletons (`components/matrx/LoadingComponents.tsx`) — never plain "Loading…" text.

---

## Rule 9 — Avoid the AI-generated look.

These tells read as "a robot made this." Steer away:

- Purple-to-blue gradients; generic glassmorphism / frosted cards floating on pastel. *(Our glass is fine — see Rule 3. The tell is the generic kind, on the wrong background, doing nothing functional.)*
- A single default typeface with no hierarchy.
- Centered hero stacks (title + subtitle + CTA) on a working screen.
- Emoji in headers; faceless 3D illustrations; grids of identical equal-padding cards; decorative flourishes with no function.

---

## Engineering standards (non-negotiable plumbing)

- **Reusable components:** extract shared primitives; never copy-paste UI. Extend existing components before creating new ones.
- **One source for design tokens:** color/spacing/radius/type come from `globals.css` tokens, never hardcoded.
- **Next.js App Router:** Server Components by default, Client Components only where interaction requires. No layout shift.
- **Real states:** every surface has real loading, empty, and error states — never a blank screen. Structured error handling, never swallowed.
- **Banned browser dialogs:** no `window.confirm/alert/prompt`. Use `confirm()` / `<ConfirmDialog>` / `toast` / `<TextInputDialog>` (paths in the anchors file).

---

## Quick pre-flight (run through this before writing JSX)

1. **Reference:** what real product/screen am I modeling this after? (Say it.)
2. **Persona:** consumer / enterprise / admin? → sets base density.
3. **Structure:** table or cards? (If unsure → table.)
4. **Reuse:** which existing primitive (`GenericDataTable`, official cards/sheets/layouts) am I extending instead of building fresh?
5. **Tokens:** semantic colors, our glass, elevations, `bg-textured` — no hardcoded values.
6. **Chrome:** stripped narration, kept breadcrumbs/utility bar/clear primary action.
7. **Mobile:** does it stay usable at a narrow width — no nine-screen scroll?
8. **States:** loading / empty / error all real?

For exact class names and component paths, read **`references/design-system-anchors.md`**.
