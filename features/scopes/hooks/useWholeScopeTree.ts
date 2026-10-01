// features/scopes/hooks/useWholeScopeTree.ts
//
// THE WHOLE TREE, FOR A READER THAT NEEDS EVERY SCOPE (lane SCOPES-TREE-PAGED). Boot paints the
// skeleton first; this hook asks for the whole tree the moment such a reader mounts (otherwise it
// lands at idle after boot) and answers it with `status` meaning exactly what `useScopeTree` meant:
// "ready" = every scope of every type is in. Readers converted to the paged reads use
// `ensureScopeSkeleton` / `ensureTypeScopes` / `searchScopes` instead.

"use client";

import { useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useScopeTree, type UseScopeTreeReturn } from "@/features/scopes/hooks/useScopeTree";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";

export function useWholeScopeTree(): UseScopeTreeReturn {
  const dispatch = useAppDispatch();
  const tree = useScopeTree();
  useEffect(() => {
    void dispatch(ensureScopeTree());
  }, [dispatch]);
  return tree;
}
