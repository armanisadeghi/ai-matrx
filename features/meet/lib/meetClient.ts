"use client";

// features/meet/lib/meetClient.ts
//
// 🚨 THE ONE CROSSING BETWEEN THIS APP'S SUPABASE CLIENT AND `@ai-matrx/meet`,
// AND IT IS A PACKAGE DEFECT THIS FILE IS STANDING IN FOR — not a host quirk,
// not a preference, and not something to copy anywhere else.
//
// WHAT IS WRONG (verified against `@ai-matrx/meet` 0.2.0, 2026-09-08):
// `MeetProviderProps.client` and `RepositoryOptions.client` are typed as the
// package's RICH internal `SupabaseLike`. Checking this app's real
// `SupabaseClient<Database>` — built from generated types — against that shape
// makes tsc chase PostgREST's schema machinery until it bails with
//   TS2589 "Type instantiation is excessively deep and possibly infinite"
// followed by a page of "not assignable", on the exact line the package README
// tells every consumer to write.
//
// `@ai-matrx/messaging` ALREADY LEARNED THIS AND WROTE IT DOWN. Its public prop
// is the deliberately SHALLOW `MessagingSupabaseClient` (method names and
// arity, results as `unknown`), narrowed to the rich shape ONCE inside the
// package — and its own header says the only alternative was "the cast this
// package's own header forbids". `@ai-matrx/meet` has the same two entry points
// and did not apply the lesson, so the sibling defect is live.
//
// THE SECOND HALF OF THE SAME DEFECT: the package ships `dist/index.d.ts` and
// `dist/react.d.ts` as two independent declaration files that RE-DECLARE every
// branded type (`UserId`, `RoomName`, `CallCenter`, …) rather than one
// re-exporting the other. So `UserId` from `@ai-matrx/meet` is not assignable
// to `UserId` from `@ai-matrx/meet/react`. This repo's rule for that half is
// mechanical and needs no cast: **in any file that imports from
// `@ai-matrx/meet/react`, import EVERYTHING from `@ai-matrx/meet/react`** —
// `react.ts` re-exports the whole core, so one entry means one set of types.
//
// BOTH HALVES ARE FIXED IN THE PACKAGE, NOT HERE, and they belong to register
// item **MRI-A5** (`@ai-matrx/meet` 0.3.0, the breaking release). When it lands
// with a shallow public client type, this file is DELETED and every caller
// passes `supabase` directly. Do not grow it, and do not add a second crossing
// somewhere else: one lie in one place is findable.

import type { MeetProviderProps } from "@ai-matrx/meet/react";
import { supabase } from "@/utils/supabase/client";

/** The app's ONE Supabase browser singleton, at the package's boundary. */
export function meetClient(): NonNullable<MeetProviderProps["client"]> {
  return supabase as unknown as NonNullable<MeetProviderProps["client"]>;
}
