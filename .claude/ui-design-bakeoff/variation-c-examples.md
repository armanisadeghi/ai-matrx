# Building UI for AI Matrx — by example

You're building real, working, professional interfaces for people already inside the tool, paying to get work done. The standard is Linear, Stripe, Notion, macOS — not demos, not marketing pages. The way to hit that standard reliably is to copy how great products solve the same problem, then dress it in our design system.

## The method: model → persona → reuse → polish

Work it in this order every time.

### 1. Model it after a real product (say which, out loud)

The single biggest quality lever. "Make it modern and beautiful" produces generic AI output; **"model this after macOS Reminders"** produces something genuinely good, because the model knows that artifact cold and inherits its layout, density, hierarchy, and interactions. So before any JSX, name the reference and build toward it. Borrow its *bones and behavior* — never its colors or fonts (those are ours).

**Reference ↔ persona map** (they pick each other):

| If the page is for... | It's a... | Model it after... | Density |
|---|---|---|---|
| Someone paying, getting a task done | Consumer | macOS Reminders/Notes, Notion, Linear, iOS | Roomier; rounded, subtle gradients, our glass OK |
| A professional doing daily work in the system | Enterprise client | Linear, Stripe dashboard, an industry-leading enterprise tool | Dense, utilitarian, sharp hierarchy |
| Someone running the backend | System admin | A control panel / the app's own `/[feature]/admin` maps | Maximum density, zero aesthetic BS, no wasted space |

All three are desktop-first. Infer the persona from the route and data; ask only if truly ambiguous.

### 2. Worked examples of the method

**Task list → model after macOS Reminders (consumer).** A single calm column of rows, generous row height, a soft section header, the add-affordance inline at the top, completion as a quiet circle that fills — not a dense grid. Quick actions appear on row hover, not always-on. That reference decides 90% of your layout before you write a line.

**Records to compare and act on → model after Linear's issue list (enterprise).** A real data table: tight rows, scannable columns, sort + filter in the header, zebra striping, a far-right actions column, pagination at the bottom. Reach for `GenericDataTable` — it already does filter/sort/paginate. Don't invent a card grid for homogeneous rows.

**Billing / usage → model after Stripe's dashboard (enterprise).** A dense top row of metric cards (equal weight, *not* equal-padding-clones — each labeled and typographically distinct), a primary chart, then a detailed table below. Hierarchy via type scale and our elevation tokens, not boxes-in-boxes.

**A long-running job → model after a CI run / a good installer.** Stage-by-stage list, each stage showing pending / running / done distinctly, partial results streaming in as they land. Never a blank screen or a lone spinner; never plain "Loading…" — use the app's loading skeletons.

### 3. Reuse before you build (these exist — read `design-system-anchors.md`)

`GenericDataTable` (filter/sort/paginate), official cards/sheets/layouts, `LoadingComponents` skeletons, `confirm()`/`toast`/`TextInputDialog`. Forking a primitive that already exists is the mistake this app cares most about.

### 4. Paint only with our system

The reference gives structure; the look is always ours:
- Semantic colors only — `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, status colors. Never hex / `bg-zinc-*`.
- **Our glass**, never generic frosted: `bg-glass border border-glass-edge backdrop-blur-glass backdrop-saturate-glass shadow-glass`, or `<GlassContainer>`/`GlassPortal`.
- `--elevation-1/2/3` depth, `bg-textured` pages, `bg-card` cards, Lucide only, no emoji.

## Quality habits the examples all share

- **Density with clarity:** spacing scale 4/8/16/24/32; whitespace separates *meaningful* groups and binds related ones — it's never sprayed to fill space or pushed content below the fold. No card-in-card-in-card. Show distinct entity types as distinct (grouped, labeled, filterable), not one generic "items" bucket. Secondary detail one interaction away.
- **Cut narration:** the user is already here — no welcome text, no restated page title, no how-it-works paragraph. Keep working chrome: breadcrumbs, utility bar, an obviously-dominant primary action.
- **Mobile must work:** desktop-first, but never *broken* on a phone — the classic failure is one stray element becoming a skinny nine-screen scroll. Verify at narrow width. (Mechanics → ios-mobile-first skill.)
- **Don't look AI-made:** avoid purple→blue gradients, generic frosted glass on pastel, one flat typeface, centered hero stacks on a working screen, emoji headers, grids of identical equal-padding cards.

Pick the reference, match the persona, reuse our primitives, paint in our tokens. That sequence is what turns "build me a page" into something that looks like a real product made it.
