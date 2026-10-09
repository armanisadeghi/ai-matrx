"use client";

// The signed-in person's real name for the subject line the server writes; the part of their email before the @ when the
// account has no name (exactly what the delivered email says) — never a placeholder.
import { createSelector } from "@reduxjs/toolkit";

import { selectUserEmail, selectUserMetadata } from "@/lib/redux/selectors/userSelectors";
import { useAppSelector } from "@/lib/redux/hooks";

const selectSenderName = createSelector(
  [selectUserMetadata, selectUserEmail],
  (meta, email): string => (meta.fullName || meta.name || (email ?? "").split("@")[0] || "").trim(), // same order as esign.envelope_sender, which names the sender in the delivered email
);

export function useSenderName(): string {
  return useAppSelector(selectSenderName);
}
