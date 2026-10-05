"use client";

// features/block-state/BlockStateNotice.tsx
//
// A refused or failed save is never silent: this line stays under the block
// until the answers are saved. Signed-out (a shared view) says so plainly.

import { useAppSelector } from "@/lib/redux/hooks";
import { selectBlockStateError } from "./redux/blockStatesSlice";

export function BlockStateNotice({ rowKey }: { rowKey: string | null }) {
  const error = useAppSelector((state) => selectBlockStateError(state, rowKey));
  if (!error) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-destructive">
      {error.signedOut
        ? "Sign in to keep your answers. Nothing here is saved."
        : "Your answers are not saved. We will retry on your next change."}
    </p>
  );
}
