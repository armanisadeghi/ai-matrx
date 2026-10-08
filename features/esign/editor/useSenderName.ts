"use client";

// The signed-in person's real name for the subject line the server writes; their email when the
// account has no name — never a placeholder.
import { createSelector } from "@reduxjs/toolkit";

import { selectUserEmail, selectUserMetadata } from "@/lib/redux/selectors/userSelectors";
import { useAppSelector } from "@/lib/redux/hooks";

const selectSenderName = createSelector(
  [selectUserMetadata, selectUserEmail],
  (meta, email): string => (meta.fullName || meta.name || email || "").trim(),
);

export function useSenderName(): string {
  return useAppSelector(selectSenderName);
}
