# Settings integrations surface verification

- Target: `http://localhost:3001/user-settings/integrations`, authenticated as the routine local admin fixture.
- Candidate code commit: `b625a83fc69d8c6f1324c49aa1310f098718c1fe`; verified as an ancestor of the served checkout. The managed preview reported `/Users/armanisadeghi/code/matrx-frontend`, and `.next-preview/dev/server/app-paths-manifest.json` contained `/(core)/user-settings/[[...path]]/page`.
- Mobile viewport: 375 x 812. `document.documentElement.scrollWidth` equaled `window.innerWidth` (375 px). Settings search, settings rows, breadcrumb trigger, page Refresh, GitHub Refresh, Manage access, and Disconnect controls measured at least 44 px high. Search text measured 16 px.
- Desktop viewport: 1280 x 800. Light and dark captures are included.
- Context menu: the v3 menu identified `matrx-user/settings`; Surface Context Admin reported 25 declared values, 20 supplied values, and `contract honored`. The mobile drawer path was exercised at mobile width and captured.
- Workflows exercised: integration search and clear, GitHub integration detail expansion, GitHub account disconnect confirmation/cancel, MCP GitHub disconnect confirmation/cancel, and real Appearance theme controls (Dark then restored to Light). No connection was mutated.
- Destructive-action copy stated the exact lost access and credential consequences before confirmation.
- Final settled Browser console contained zero warning/error entries. Error Inspector was cleared after the expected navigation-abort control-flow entry and remained at 0 distinct / 0 total in the settled normal state.
- Static evidence: target ESLint clean; `pnpm type-check` clean; focused Jest suites passed (2 suites, 9 tests); `check:surface-drift`, `check:surface-routes`, `check:surface-overlays`, `check:surface-impact matrx-user/settings`, `check:route-metadata:strict`, `check:scroll-chain:strict`, and focused P4 scan clean.
- The surface is an ordinary settings/data-grid surface with no primary RichDocument and no fixed AI worker, so document export/copy and AI streaming branches are not applicable.
