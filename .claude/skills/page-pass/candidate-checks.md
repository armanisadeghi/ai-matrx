# Checks a script could run but none does yet

Not built — build one only when Arman asks. Each rule below is checked by eye
or a raw `rg` today.

1. Hover-revealed controls with no `pointer-coarse:opacity-100` (core 4; ~205 `opacity-0 group-hover` sites).
2. Emoji in rendered UI strings (core 5; only an `rg` recipe exists).
3. Raw `dispatch(openOverlay(...))` ratchet — count only goes down (core 5; ~115 sites).
4. Content text at `text-[10px]` outside an all-caps section label (core 5; ~5,650 uses to triage).
5. Non-Pro `<textarea>` ratchet (core 6; the `check:textareas` named in `surface-check` was never built).
6. Inline `fontSize` under 16px on an input or textarea (core 4).
7. A hand-rolled `useIsMobile()` Drawer branch around a plain Dialog, now redundant (core 4).
8. New imports of legacy primitives — `GenericDataTable`, `LoadingComponents` (core 2, 5).
9. A subtitle/description under the `PageHeader` title, or a body H1/hero repeating it, on a non-promotional page (core 3).
10. Bare "Loading…" text and unlabeled pulse boxes as a script, not an `rg` recipe (core 2).
11. `contentSource={{type:"raw"}}` on a surface whose manifest names an entity (core 1).
12. `matrx-touch-targets` missing on a `(core)` route root or a `DialogContent` (core 4).
13. A feature code change with no `FEATURE.md` change in the same commit (core 7).
14. Hand-styled `<button>` elements in feature code where a design-system Button/TapButton fits (core 5).
15. Hardcoded header offsets (`pt-8/10/12/14/16`) at the top of a `(core)` route body (core 3).
