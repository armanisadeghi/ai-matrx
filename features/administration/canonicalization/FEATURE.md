# Canonicalization administration

The `/administration/database/canonicalization/*` routes read the audit snapshot and expose summary, findings, candidate, dependency, impact, and verification views. `CanonicalizationLayoutClient` owns route navigation; each view keeps its existing audit-specific controls and data source.

Converted table views use `@ai-matrx/design-system/data-table` for the grid, summary, and footer; other views still use `AdminAuditTable`. The shared package owns its inner top spacing and contributes no bottom inset. A route may add an intentional outer inset, but it must not duplicate table padding. The seven full-height table wrappers in `components/` use horizontal padding only; this lets each footer reach the bottom of its available panel.

## Change log

- **2026-09-28** — Removed duplicate bottom padding from the seven full-height canonicalization table wrappers after measuring the by-schema table and page shell together. Shared KPI and totals rendering is owned by the design-system package.
