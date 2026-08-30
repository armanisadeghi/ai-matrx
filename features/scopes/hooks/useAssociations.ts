// features/scopes/hooks/useAssociations.ts
//
// RE-EXPORT (W5 swap, 2026-08-29): the implementation lives in
// `@ai-matrx/associations/react` (useSyncExternalStore over the package's
// /core cache — the Redux `associationsByKey` fragments are DELETED). The
// host binding is `features/scopes/host/` + `<AssociationsHost>` in
// app/Providers.tsx. Signatures are byte-compatible with the pre-swap hook.

export {
  useAssociations,
  useEntityRelationships,
  type AssociationWriteResult,
  type UseAssociationsArgs,
  type UseAssociationsReturn,
} from "@ai-matrx/associations/react";
