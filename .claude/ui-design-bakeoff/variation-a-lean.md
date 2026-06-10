# Building UI for AI Matrx — the short version

You're building a real, working, professional interface for someone already inside the tool and paying to get a job done. Not a demo, not a marketing page. The bar is Linear / Stripe / Notion / macOS.

## The one move that matters most

**Before you write any JSX, name the real product you're modeling this screen after — out loud — and build toward it.** "I'm modeling this after macOS Reminders." "...after Linear's issue list." "...after Stripe's dashboard."

Why: "make it beautiful/modern/professional" averages to the generic, faintly-AI-looking mean. A concrete reference is the one lever that pulls output off that mean — it carries layout, density, hierarchy, and interaction decisions for free. Borrow the reference's *bones and behavior*. Never its colors or fonts — those are always ours.

## Who's it for (sets your density)

All three personas are desktop-first; pick the one for *this* page and let it set how tight you pack:
- **Consumer** (paying, getting stuff done) — a little more breathing room; rounded, subtle gradients, our glass are fine when they don't distract. Model after consumer apps.
- **Enterprise client** (daily professional work) — dense, utilitarian, high info density, sharp hierarchy. Model after enterprise tools.
- **System admin** (running the backend) — maximum density, zero wasted space, zero aesthetic BS.

Infer the persona from the route/data; ask only if genuinely ambiguous. The reference and the persona pick each other.

## Paint with our system, always

The reference gives structure; the look is ours. Read **`design-system-anchors.md`** for exact names. Non-negotiable:
- Semantic color classes only (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, status colors) — never hex or `bg-zinc-*`.
- **Our glass**, not generic frosted: `bg-glass border border-glass-edge backdrop-blur-glass backdrop-saturate-glass shadow-glass`, or `<GlassContainer>`/`GlassPortal`.
- `--elevation-1/2/3` for depth, `bg-textured` pages, `bg-card` cards, Lucide icons only, no emoji.
- **Reuse before building** — `GenericDataTable` (filter/sort/paginate), official cards/sheets/layouts, loading skeletons, `confirm()`/`toast`/`TextInputDialog` all exist. Extend them.

## A few judgments that separate good from generic

- **Density with clarity:** strict spacing scale (4/8/16/24/32); space *means* something — it groups and separates. No padding sprayed to fill, no card-in-card-in-card, no flattening distinct entity types into one "items" bucket. Secondary detail one interaction away, not buried, not all dumped at once.
- **Cut narration:** the user knows what page they're on. Kill welcome text, restated titles, how-it-works paragraphs. Keep working controls — breadcrumbs, utility bar, a clearly dominant primary action.
- **Right tool for the data:** table for homogeneous scannable records, cards/boards for heterogeneous or visual ones. If you won't reason it out, default to a good table.
- **Streaming work reveals itself:** never a blank screen or lone spinner — partial output, stage-by-stage progress, real loading skeletons (never plain "Loading…").
- **Mobile must not break.** Desktop-first, but it has to *work* on a phone — the classic failure is one stray element forcing a skinny nine-screen scroll. Check it at narrow width. (Mechanics → ios-mobile-first skill.)

## Don't look AI-generated

Purple→blue gradients, generic frosted glass on pastel, one flat typeface, centered hero stacks on a working screen, emoji headers, identical equal-padding card grids. Our glass is fine; the generic kind isn't.

Trust your judgment. A page modeled after a real product, painted in our tokens, packed to the persona's density, with the narration stripped out, is the whole game.
