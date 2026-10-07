"use client";

/**
 * Wraps a record page's `<AccessGate>` after an EMPTY SSR read: the browser
 * re-reads the row with its own (refreshed) session first. Readable → the
 * server page re-renders once with the fresh cookie and the record opens.
 * Not readable → the gate renders and answers honestly.
 * Why: `service/serverReadRecheck.ts`.
 */

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { decideServerReadRecheck } from "@/features/access-gate/service/serverReadRecheck";

type BrowserClient = ReturnType<typeof createClient>;

/** Row readers per canonical entity token. Add a token when a page adopts this. */
const ROW_READERS = {
  conversation: async (supabase: BrowserClient, id: string) => {
    const { data, error } = await supabase
      .schema("chat")
      .from("conversation")
      .select("id")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    return !error && Boolean(data);
  },
} satisfies Record<string, (supabase: BrowserClient, id: string) => Promise<boolean>>;

export type ServerReadRecheckToken = keyof typeof ROW_READERS;

/** Records this tab already re-rendered for — a second SSR miss shows the gate. */
const refreshedOnce = new Set<string>();

export function ServerReadRecheck({
  token,
  id,
  children,
  pending,
}: {
  token: ServerReadRecheckToken;
  id: string;
  /** The access gate. */
  children: ReactNode;
  /** What shows while the browser re-reads. */
  pending?: ReactNode;
}) {
  const router = useRouter();
  const key = `${token}:${id}`;
  const [showGate, setShowGate] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      let signedIn = false;
      let rowReadable = false;
      try {
        const supabase = createClient();
        const { data } = await getClaimsUser(supabase);
        signedIn = Boolean(data.user);
        if (signedIn) rowReadable = await ROW_READERS[token](supabase, id);
      } catch (error) {
        console.error(`[ServerReadRecheck] ${key}: browser re-read failed`, error);
      }
      if (!active) return;
      const verdict = decideServerReadRecheck({
        signedIn,
        rowReadable,
        alreadyRefreshed: refreshedOnce.has(key),
      });
      if (verdict === "refresh") {
        console.warn(
          `[ServerReadRecheck] ${key}: the server read came back empty but this browser can read it — re-rendering with the refreshed session`,
        );
        refreshedOnce.add(key);
        router.refresh();
        return;
      }
      setShowGate(true);
    })();
    return () => {
      active = false;
    };
  }, [key, token, id, router]);

  return <>{showGate ? children : (pending ?? null)}</>;
}
