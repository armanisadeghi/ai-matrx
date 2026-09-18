# VERIFY-C — the browser walk for the Graph view (Lane C)

Run this on a machine that can host the app (the build container cannot). Sign in as the
local test admin (`pnpm dev-login /marketing`), open the hostname the preview prints, and name
the build SHA in your report. Nothing here uses a fixture, mock mode, seed script or env toggle.

Zero authorship: the verifier did not write `views/GraphView.tsx`, `views/GraphViewImpl.tsx`
or `views/graph/**`. Judge against PLAN §6 "C — Graph" and the vision §2.2 / §2.7
(`common-docs/inbox/topical-map-app-requirements.md`), never against the builder's summary.

Champion bar: Miro/FigJam (zoom bands, readable cards, drag) + Semrush/Surfer topical maps
(function: cluster by facet, colour by state). Parity is the floor.

## Data

- All Green Recycling — brand `c2db36a1-…`, map `e9df6779-8e0e-45e9-a664-375e7d1ecffd`, site
  `d0aff5b6-…`: 50 active topics (+1 retired, which must NOT appear), 5,552 pages placed, 330
  proposed intents; `group_by=region` returns 255 facet values.
- Factory Playground — map `ff2010ec-f53d-4d8b-81d9-094c4ca73397`: 52 proposed topics (the
  52-node band case).

Routes: `/marketing/<brandId>/content/map/<mapId>/graph` (page host);
`?site=<siteId>` narrows counts; the flat door `/marketing/topical-maps/<mapId>` (read-only
grantee) must render the same drawing without drag-save.

## 1. Bands by VISIBLE TOPIC count (vision §2.2 — the acceptance test)

Knob defaults: `graph_band_card_max` 15, `graph_band_compact_max` 40, `graph_band_line_max` 200.

| Step | Do | Expect | Screenshot |
|---|---|---|---|
| 1.1 | Open All Green `/graph` | 50 topics visible → COMPACT band (rows: title wrapping ≤2 lines, one count, status mark). The toolbar states the band and the count in words ("compact · 50 topics visible"). No spinner-only state: loading says what it loads. | yes |
| 1.2 | Click a root topic that has ≤14 descendants | Re-frame on the branch (fitView animates), band → CARDS: every node a rectangular card whose TITLE WRAPS AND IS NEVER TRUNCATED (Arman 2026-08-20), counts line "N pages · N planned · N keywords", status fill, ring. The topic is selected in the store (outline shows it selected after a view switch) and the topic panel opens. | yes |
| 1.3 | "Back to whole map" | focus cleared, 50 visible, compact again; the selection stays. | yes |
| 1.4 | Open Factory Playground `/graph` | 52 topics → LINE band (small shapes + short labels, tree lines carry the structure). Every one is `proposed` — the proposed mark / fill is visible in the legend and on nodes. | yes |
| 1.5 | Change knobs in settings (org level): card 5 / compact 10 / line 20; reload All Green | 50 visible → SHAPES band: shapes only, label on hover and when selected. Restore the knobs afterwards. Cost of skipping: the bands are read from a constant, which the lane forbids. | yes |
| 1.6 | Zoom out with the wheel at the compact band until labels would be < 9 px on screen | Labels hide (zoom-dependent hiding is IN ADDITION to the count bands — "not zoom factor alone" means both). Zoom back in → labels return. | yes |

## 2. Regroup by facet (facet axis, capped)

| Step | Do | Expect | Screenshot |
|---|---|---|---|
| 2.1 | Regroup dropdown → `region` | The URL/store `groupBy` = region; `map_graph(group_by='region')` is called (Network tab: one RPC). Facet values are drawn as a SEPARATE clustered axis (a column beside the tree), sorted by connected-topic count, capped, with ONE "+N more" node carrying the true remainder (255 values on All Green; most have no topic edge and sit behind "+N more"). | yes |
| 2.2 | Click "+N more" | The next batch of values appears; the remainder shrinks by exactly that batch. | yes |
| 2.3 | The synthetic `all` bucket | Rendered honestly as "No region value" (or equivalent) with its edges; never as a topic; never with a uuid door. | yes |
| 2.4 | A facet value carrying a `ref` | Opens (peek + new tab) — a named record is never a dead label. A value without a ref opens the outline filtered to that value. | yes |
| 2.5 | Drag a facet-value node, reload | Its position is NOT persisted (facet positions are computed every render); topics keep theirs. | yes |
| 2.6 | Regroup → "No grouping" | Facet axis gone, tree only, one RPC. | — |

## 3. Legend and encoding (`graph_encoding`, `intent_colors`)

| Step | Do | Expect | Screenshot |
|---|---|---|---|
| 3.1 | Read the legend panel | It states in words what size / fill / ring / hue mean NOW (default: size = pages, fill = status, ring = tier, hue = the grouped facet). With `region` grouping on, each value has a hue swatch. | yes |
| 3.2 | Set the `graph_encoding` knob to `{"size":"keywords","fill":"status","ring":"tier","hue":"grouped_facet"}` and reload | Node size now follows keyword_count; the legend says "size = keywords". Restore afterwards. | — |
| 3.3 | Set `graph_encoding.size` to `"bogus"` and reload | The legend prints an honest line that `bogus` is not a value it knows; the Error Inspector (AdminIndicator) shows a captured error; nothing is blank. Restore. | yes |
| 3.4 | Toggle encoding mode → "convergence" | Fill switches to the intent tone per topic from `intent_colors`; the legend shows the six swatches (in place / leaving / arriving / delete / missing / planned) and a progress line "colouring N of 5,552 pages…" until every page is listed, then the rollup. Topics with 0 pages and >0 planned draw `planned` (purple dashed); 0/0 draw `missing` (gray dashed). With `?site=d0aff5b6-…`, the 330 proposed intents make at least one topic show a leaving/arriving tone. | yes |
| 3.5 | Toggle back → "structure" | Status fill returns; the mode survives a view switch (store, not component state). | — |

## 4. Drag, persistence, auto-layout

| Step | Do | Expect | Screenshot |
|---|---|---|---|
| 4.1 | Drag a topic node, release | No snap-back while the write is in flight; on failure the RPC's own sentence appears in a toast and the node returns. | — |
| 4.2 | Reload the page | The dragged topic is where it was dropped (`seo.map_topic.layout`). `auto_layout` for that node is now false in `map_graph`. | yes |
| 4.3 | "Auto-arrange" | Every visible topic re-lays (dagre, top-down); reload → the dragged node's stored position is back (auto-arrange is view-only, it does not write 50 layouts). | — |
| 4.4 | Set `graph_auto_layout` false, reload | Stored positions used; topics with no stored layout still do not stack at (0,0). Restore. | — |
| 4.5 | Minimap, fit, zoom controls | All present, themed in light AND dark (no white boxes in dark mode). | yes ×2 (light, dark) |

## 5. Doors, read-only, mobile, errors

| Step | Do | Expect | Screenshot |
|---|---|---|---|
| 5.1 | Click any topic | Selects + focuses + opens the topic panel (window or drawer per `detail_panel`); the outline, after switching views, shows the same selection. Nothing navigates away. | — |
| 5.2 | Share read-only door `/marketing/topical-maps/<mapId>` as a record-only grantee | The drawing renders; nodes are not draggable; regroup / encoding / focus still work; no write control is present (absent, not disabled). | yes |
| 5.3 | A non-member | Refused with the same denial a nonexistent id gets (`AccessGate`), never a blank canvas. | yes |
| 5.4 | 375×812 | Toolbar wraps, legend collapses, pinch/pan work, no horizontal page scroll; inputs ≥16px. | yes |
| 5.5 | Force a failed read (e.g. an invented `?site=` uuid) | `TopicalMapFailed` prints the function's own sentence with its SQLSTATE (42501 `map_graph_denied`), unaltered. | yes |
| 5.6 | Network tab across steps 1–4 | `map_graph` is called once per (groupBy, siteId); a drag calls only the layout write; switching to outline and back does not refetch the tree. | — |

## Report back

Terminal truth first: which steps passed, which did not, with the screenshot for each row marked
"yes". Name the build SHA, the knob values in effect, light/dark, and any RPC sentence seen.
Anything in this file the drawing cannot do is a MISSING item, reported as such — never
reworded into a pass.
