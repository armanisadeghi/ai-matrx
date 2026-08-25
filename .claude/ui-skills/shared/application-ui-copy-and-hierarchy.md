# Application UI copy and hierarchy

Application routes are working environments, not articles or marketing pages. Every visible word and block earns space by helping the user decide, act, understand state, or avoid a mistake.

## One title authority

- **Name the page once.** If `PageHeader`, a tab, window title, or panel chrome names the surface, the body does not repeat it as another H1 or hero.
- **No app-route hero sections.** Start with controls, status, or meaningful content—not a second title, welcome copy, or decorative introduction.
- **Headings describe real structure.** A section heading distinguishes content below it; it never restates the page name.

## No novels in app chrome

- **Subtitles are absent by default.** Keep one short line only when it changes how the user proceeds.
- **Inline help is one short sentence.** Move deeper explanation to a tooltip, help popover, drawer, or documentation.
- **Delete generic narration.** “Welcome to…”, “This page allows you to…”, “Use this section to…”, and “Dashboard overview” add no operational value.
- **Put guidance beside the decision.** Constraints belong next to the relevant field or action, not in a page-opening paragraph.

Ask of every sentence: **does it help the user make a decision or avoid a mistake?** If not, remove it.

## Work before decoration

- **Show meaningful work above the fold at 1280×800.** Identity, primary actions, status, and the first real data/work area outrank prose and empty space.
- **Do not card every thought.** Prefer one coherent workspace over a grid of decorative cards containing a label, icon, and sentence.
- **Do not stack chrome.** A component with its own border, background, header, or padding does not receive another decorative wrapper.
- **Keep dashboards compact.** Avoid oversized typography, centered hero spacing, invented gradients, ornamental icon blocks, and low-information KPI tiles.

## What survives compression

Preserve consequential information:

- Legal, security, privacy, billing, and destructive-action warnings
- Domain rules or constraints a user needs to make a correct decision
- Onboarding for a genuinely unfamiliar workflow
- Empty, error, recovery, and irreversible-action explanations

Compress or relocate useful guidance; do not silently delete meaning.

## The modification boundary

When modifying an existing page, automatically clean obvious reversible violations across the same visible page: duplicate titles, generic intro prose, excessive whitespace, repeated chrome, machine labels, and clearly broken responsive presentation.

Do not use cleanup as authority to redesign unrelated workflows, remove capabilities, change data semantics, or sweep other routes. Preserve working behavior. If copy contains real product meaning but is too long, keep the meaning and move it to the smallest appropriate help surface.
