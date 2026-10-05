"use client";

// features/person-apps/PersonAppMount.tsx — ONE APP, MOUNTED ON THE VIEWER'S OWN SEAT.
//
// The records client is the signed-in person's (her session, her actor); the app's organization is
// where writes go. Reads span every organization she belongs to and the store answers each one.

import { lazy, Suspense, useMemo } from "react";
import Link from "next/link";
import { RecordsMount, personActor, recordsDataSource } from "@ai-matrx/records-ui";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { createClient } from "@/utils/supabase/client";
import { personApp } from "./registry";

export function PersonAppMount({ slug, path }: { slug: string; path: string[] }) {
  const app = personApp(slug);
  const userId = useAppSelector(selectUserId);
  const dataSource = useMemo(() => recordsDataSource(createClient()), []);
  const Screen = useMemo(() => (app ? lazy(app.load) : null), [app]);
  if (!app || !Screen) return <p className="p-6 text-sm text-muted-foreground">There is no app at this address.</p>;
  if (!userId) return <p className="p-6 text-sm text-muted-foreground">Signing you in…</p>;
  return (
    <RecordsMount
      letTheStoreDecideRights
      config={{ dataSource, actor: personActor(userId), organizationId: app.organizationId }}
      host={{ Link, density: "condensed" }}
    >
      <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Opening {app.name}…</p>}>
        <Screen path={path} />
      </Suspense>
    </RecordsMount>
  );
}
