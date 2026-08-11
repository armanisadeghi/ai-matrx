# SEO capabilities hub

## Contract

The site-level SEO capabilities route is an inventory and control surface, not
a fourth SEO data system. It explains and links the three systems that already
exist:

- snapshot audit metrics stored with page captures;
- catalogue analysis results and durable findings;
- provider intelligence such as Search Console, PageSpeed, backlinks, and rank
  tracking.

Every named capability must link to its canonical working destination. Live
status must come from an existing hook/service. Catalogue execution reuses
`CatalogueAnalysisPanel`, including its canonical `analyzeSite` action and
query invalidation behavior; never add a second runner here.

The managed-site overview workspace directory is the hub's required
discoverability door. The site mode header may also list it, but the feature
must remain reachable even when the mode list is condensed.

The parent marketing rules remain canonical in `features/marketing/FEATURE.md`.
This feature adds no schema, service, or duplicate registry.

## Reuse inventory

- Snapshot status: `useSiteAuditRollup`.
- Provider/search coverage: `useSiteOverview`.
- Catalogue status and execution: `CatalogueAnalysisPanel` and
  `useSiteAnalysisOverview` beneath it.
- Navigation: canonical site and portfolio routes already owned by the
  marketing module.

## No dead ends

Capability cards are links, including their counts/status statements. The
catalogue panel links counts to findings and analysis destinations and exposes
the one-click fix when analysis has never run.
