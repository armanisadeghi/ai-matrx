# Continued access — the departed-member portal

**The canonical documentation for this feature lives in `common-docs`, not here.** This file is a
pointer; do not grow it into a second copy.

- **What it is, how it works, what is proven:** `/Users/armanisadeghi/code/common-docs/systems/platform/continued-access/STATE.md`
- **Arman's words (never paraphrase them):** `/Users/armanisadeghi/code/common-docs/systems/platform/continued-access/VISION.md`
- **Settled rulings:** `/Users/armanisadeghi/code/common-docs/systems/platform/continued-access/DECISIONS.md`
- **What is still open:** `/Users/armanisadeghi/code/common-docs/systems/platform/continued-access/HANDOFF.md`

## The two things a frontend agent must not get wrong

1. **Render exactly the `features` array the door returns.** An aspect the organization has not
   switched on renders **nothing** — absent, not disabled, not "coming soon". Adding the next
   aspect is one entry in `portalFeatures.tsx` plus one knob in the database, and this page never
   learns a new shape.
2. **Never link this surface to anything org-scoped.** The person here has no organization
   grants — `iam.memberships.status='departed'` removes them all — so `/hr`, `/dashboard`, the org
   switcher and global search are every one of them a dead end or a leak. The route group renders
   no `AppShell` on purpose.

## Change Log

- **2026-08-29** — Canonicalized the common-docs pointers and documented the dedicated portal route group.
