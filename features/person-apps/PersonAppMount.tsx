"use client";

// features/person-apps/PersonAppMount.tsx — ONE APP, MOUNTED ON THE VIEWER'S OWN SEAT.
//
// The records client is the signed-in person's (her session, her actor); the app's organization is
// where writes go. Reads span every organization she belongs to and the store answers each one.

import { lazy, Suspense, useMemo, type ComponentType, type LazyExoticComponent } from "react";
import Link from "next/link";
import { RecordsMount, personActor, recordsDataSource } from "@ai-matrx/records-ui";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { createClient } from "@/utils/supabase/client";
import { personApp, type PersonApp, type PersonAppProps } from "./registry";

const SCREENS = new Map<string, LazyExoticComponent<ComponentType<PersonAppProps>>>();
function screenOf(app: PersonApp) {
  let screen = SCREENS.get(app.slug);
  if (!screen) SCREENS.set(app.slug, (screen = lazy(app.load)));
  return screen;
}

export function PersonAppMount({ slug, path }: { slug: string; path: string[] }) {
  const app = personApp(slug);
  const userId = useAppSelector(selectUserId);
  const dataSource = useMemo(() => recordsDataSource(createClient()), []);
  if (!app) return <p className="p-6 text-sm text-muted-foreground">There is no app at this address.</p>;
  if (!userId) return <p className="p-6 text-sm text-muted-foreground">Signing you in…</p>;
  const Screen = screenOf(app);
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
