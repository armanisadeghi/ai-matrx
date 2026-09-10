---
name: Route rules for app/(core)
description: A strict set of rules to be followed for all actions in this route and all child routes.
alwaysApply: true
---

# Required Rules

This route has a set of pre-defined rules that cannot be broken, bent or overlooked. Any suggestion that something should be done against these rules, must be directly approved by Lead Developer Arman Sadeghi. (Must be a direct approval, not a passive suggestion)

This route: app/(core)

# Required Skills:

The following skills are required before proceeding. Read them. Apply them.

- `.claude/skills/ssr-zero-layout-shift/SKILL.md` — also owns everything from `nextjs-ssr-architecture` (`.claude/skills/nextjs-ssr-architecture/SKILL.md` is now a retired pointer to it)

# Caching:
- **`'use cache'` is NOT available** — `cacheComponents` is off in `next.config.js`, so the directive is a build error. Dynamic rendering by default; per-request dedup is React `cache()`. Any `'use cache'` guidance in a skill does not apply here. Law: `CLAUDE.md` § Core invariants (machine-verified by `pnpm check:doc-claims`).

# Empty record reads:
- **`authInterrupts` is ON — never `notFound()` on an empty single-record read.** Render `<AccessGate token id/>`, or refuse with `requireAccess(type, id, level, { forbid: true })`. Read `features/access-gate/FEATURE.md`.

# Metadata and SEO:
- Guidelines: `app/(core)/_read_first_route_rules/metadata-and-seo.md`
