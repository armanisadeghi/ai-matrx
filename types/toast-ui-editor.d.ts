// @toast-ui/editor@3.2.2 ships real types at `types/index.d.ts` (declared via
// its package.json `types` field), but its `exports` map has no `types`
// condition — so under `moduleResolution: "bundler"` TS resolves the `import`
// condition straight to `dist/esm/index.js` and never finds the sibling types
// file, surfacing as "implicitly has an 'any' type" (TS7016) on every import
// from the bare package specifier. This re-exports the package's own
// (correct) types rather than hand-duplicating them, so it stays in sync with
// whatever version of @toast-ui/editor is installed.
declare module "@toast-ui/editor" {
  export * from "../node_modules/@toast-ui/editor/types/index";
  export { default } from "../node_modules/@toast-ui/editor/types/index";
  // `export *` does not surface names that types/index.d.ts re-exports via a
  // bare `export { ... }` clause over its own imports (WidgetRule et al.) —
  // re-export the ones consumers actually import explicitly.
  export type { WidgetRule, WidgetRuleMap } from "../node_modules/@toast-ui/editor/types/editor";
}
