/**
 * THE SHAPE A CONTRACT-AHEAD `paths` AUGMENTATION MUST WEAR.
 *
 * `callApi` derives a request body with
 * `Lowercase<M> extends keyof paths[P] ? paths[P][Lowercase<M>] : never`.
 * Every entry `pnpm sync-types` writes into the generated `paths` interface
 * carries ALL eight method keys (`get?: never`, `post: …`, …) plus
 * `parameters`. An augmentation that declares only `{ post: … }` breaks that
 * derivation for EVERY path in the program, not just its own — the moment one
 * such entry merges into `paths`, `keyof paths[P]` stops narrowing and every
 * `body:` in the repo becomes `undefined` (73 type errors across 40 files on
 * 2026-09-18, all reading "Type '…' is not assignable to type 'undefined'";
 * bisected to either `features/<name>/contract-paths.ts` alone, fixed by this
 * wrapper alone).
 *
 * So a contract-ahead declaration names its real methods inside
 * `ContractAheadRoute<…>` and inherits `never` for the rest, exactly as the
 * generator would have emitted it. The self-deleting rule in those files is
 * unchanged: once the generated file carries the same key, the merge collides
 * and the augmentation file is deleted.
 */

type GeneratedRouteShape = {
  parameters: {
    query?: never;
    header?: never;
    path?: never;
    cookie?: never;
  };
  get?: never;
  put?: never;
  post?: never;
  delete?: never;
  options?: never;
  head?: never;
  patch?: never;
  trace?: never;
};

export type ContractAheadRoute<T extends object> = Omit<GeneratedRouteShape, keyof T> & T;
