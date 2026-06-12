# UI Ground Rules — AI Matrx (shared floor for every ui-* skill)

Load this for any UI work. The posture skill you triggered (`ui-sharp` / `ui-reimagine` / `ui-refine` / `ui-dense`) decides *how* you design. This file is what's never optional regardless of posture. Read it first, every time.

---

## 1. Build it real. Never fake. — the rule that matters most

**No mock data. No stubbed buttons. No fake streams. No placeholder that pretends to work. A page is done only when it is wired to the actual data, the actual service, and the actual stream — and you have watched it run against reality.**

Why this is the top rule: a fake feature fools everyone — including you — into believing something works when it doesn't. The things that actually kill a real page are precisely the unknowns a mock hides:

- What does the server *actually* return? In what shape, in what order?
- What does an error look like — a 500, a timeout, a malformed payload?
- What happens when the stream goes **silent for 20 seconds**? When events arrive out of order? When only partial data comes back?
- What does *empty* look like? Slow network? A retry?

A mock answers none of these, so a mock-built UI is wrong in exactly the ways you can't see until a user hits them. Build against the real backend from the first line.

Every UI must therefore handle the **full reality of its data**:
- Real **loading**, **empty**, and **error** states — never a blank screen, never a lone spinner, never plain "Loading…". Use the app's loading skeletons (`components/matrx/LoadingComponents.tsx`).
- Streaming / long-running surfaces: stage-by-stage progress that handles the stream **stalling** (nothing for 10-20s), arriving **out of order**, delivering **partial** data, or **failing mid-way** — gracefully, visibly, with no dead-ends.
- Errors are **designed, not swallowed**: structured handling, a real recovery path, and loud when a recovery layer fires (a recovery firing means a real bug slipped the proactive layer).

The *only* exception: if the user **explicitly** asks for a throwaway visual mock to explore a design — not feature work — you may stub, but say so **loudly** in your output and never let it reach a real route. The default, always, is real.

## 2. Preserve (or beat) what already works

Before you redesign, inventory what the current implementation does *well* — a nice animation, a fast path, a clever affordance — and either keep it or do better. **Never silently regress working behavior.** "I reinvented it" is not a license to lose a good thing that was already there. Losing existing quality in a redesign is the single most common avoidable miss — don't make it.

## 3. Every surface and every state gets first-class care

A flashy primary screen shipped next to a neglected second screen — or a beautiful happy-path next to a broken error/empty/stall state — is a failure, not a partial success. Don't let the exciting part starve the rest. Give the unglamorous states the same craft as the hero moment.

## 4. Paint only with our system

The reference product you model gives you *structure*; the look is always ours. Hardcoding colors or hand-rolling glass is what makes UI look off-brand and AI-generated.
- Semantic color classes only (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, status colors) — never hex / `bg-zinc-*` / `text-gray-*`.
- **Our glass**, never generic frosted-on-pastel: `bg-glass border border-glass-edge backdrop-blur-glass backdrop-saturate-glass shadow-glass`, or `<GlassContainer>` / `GlassPortal`.
- `--elevation-1/2/3` for depth, `bg-textured` pages, `bg-card` cards, Lucide icons only, **no emoji** (this is enterprise).
- Exact names and paths: **`design-system-anchors.md`** (next to this file).

## 5. Reuse before you build

`GenericDataTable` (filter/sort/paginate), official cards/sheets/layouts, `LoadingComponents` skeletons, `confirm()` / `toast` / `TextInputDialog` already exist. Forking a primitive that already exists is the doctrine violation this app cares most about. Check `design-system-anchors.md` before writing a new one.

## 6. Desktop-first, but never broken on mobile

Desktop-first is correct here, but all personas occasionally pull out a phone and need to *do the thing*. The bar is **"never broken on mobile"** — the classic failure is one stray element forcing a skinny nine-screen scroll. Verify at narrow width before you finish. Mobile mechanics (viewport units, safe areas, touch targets, drawer-not-dialog) → the **ios-mobile-first** skill.

## 7. Engineering floor

Server Components by default, Client only where interaction requires. No layout shift. No banned browser dialogs (`window.confirm` / `alert` / `prompt`) anywhere a human can see — use `confirm()` / `<ConfirmDialog>` / `toast` / `<TextInputDialog>`.

## 8. Verify before you claim done

Run it. See it work against **real** data, including its error and empty paths. Do not report "done" or "verified" from a mock, a passing type-check, or a screenshot you didn't actually scrutinize. If a state is still unhandled, say so plainly — a known gap named is worth more than a false "it works."
