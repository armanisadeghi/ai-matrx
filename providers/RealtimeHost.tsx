// providers/RealtimeHost.tsx
//
// THE ONE `@ai-matrx/realtime` MOUNT for this app.
//
// `<RealtimeProvider>` builds exactly one `RealtimeManager`, and that manager
// owns every channel opened beneath it: unique instance topics, echo
// suppression, dedup, the decoupled handler queue, jittered reconnect with a
// stability reset, the `onBackfill` door on every recovery path, tab-sleep and
// network awareness, and diagnostics. Mounting a second provider anywhere in
// the tree would build a SECOND manager with its own channels and its own write
// ledger — the optimistic-write echo of one manager would then look remote to
// the other. There is one mount, here, in `app/Providers.tsx`.
//
// The host injects IDENTITY and nothing else (C22): the Supabase browser
// singleton every realtime consumer in this repo already shares (so the app
// opens ONE websocket) and the signed-in user id, which enables the package's
// `updated_by` echo test. Everything else is already inside the package.
//
// Doctrine: `@ai-matrx/realtime`'s README (the eight rules) + the
// `supabase-realtime` skill for this repo's remaining hand-rolled channels.

"use client";

import type { ReactNode } from "react";
import { RealtimeProvider } from "@ai-matrx/realtime/react";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

export interface RealtimeHostProps {
  children: ReactNode;
}

export function RealtimeHost({ children }: RealtimeHostProps) {
  // The manager's lifetime is `client` + `actorId` and nothing else, so this
  // must stay a plain selector read: a fresh object here would rebuild every
  // channel on every parent render.
  const userId = useAppSelector(selectUserId);

  return (
    <RealtimeProvider client={supabase} actorId={userId ?? undefined}>
      {children}
    </RealtimeProvider>
  );
}
