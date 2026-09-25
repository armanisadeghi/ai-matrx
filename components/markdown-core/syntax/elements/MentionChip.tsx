"use client";

// A mention chip — `@[Dana](user:<uuid>)` / `@[Tue, Sep 30](date:2026-09-30)`
// (RC-B11's stored form). A person resolves against the members the viewer
// may see (people-resolver.ts): found → a chip that opens an email to them;
// not found (outside the viewer's organization, signed out, refused) → the
// label as plain text, honestly — never a chip that goes nowhere.

import { useContext, useEffect, useState, type ReactNode } from "react";
import { ReactReduxContext } from "react-redux";
import { AtSign, CalendarDays } from "lucide-react";
import type { MentionedPerson } from "./people-resolver";

type Resolver = typeof import("./people-resolver");
let resolverModule: Promise<Resolver> | null = null;
const loadResolver = () => (resolverModule ??= import("./people-resolver"));

function useActiveOrgId(): string | null {
  const ctx = useContext(ReactReduxContext);
  const state = ctx?.store?.getState() as { appContext?: { organization_id?: string | null } } | undefined;
  return state?.appContext?.organization_id ?? null;
}

export function MentionChip(props: { "data-kind"?: string; "data-id"?: string; "data-label"?: string; children?: ReactNode }) {
  const kind = props["data-kind"];
  const id = String(props["data-id"] ?? "");
  const label = String(props["data-label"] ?? "");
  const orgId = useActiveOrgId();
  const [person, setPerson] = useState<{ key: string; value: MentionedPerson | null } | null>(null);
  const key = `${orgId ?? ""}|${id}`;

  useEffect(() => {
    if (kind !== "person") return;
    let live = true;
    loadResolver()
      .then((m) => m.resolvePerson(id, orgId))
      .then((value) => {
        if (live) setPerson({ key, value });
      })
      .catch(() => {
        if (live) setPerson({ key, value: null });
      });
    return () => {
      live = false;
    };
  }, [kind, id, orgId, key]);

  if (kind === "date") {
    return (
      <time dateTime={id} data-mention="date" className="mx-0.5 inline-flex items-center gap-0.5 rounded bg-muted px-1 text-foreground">
        <CalendarDays className="h-3 w-3" aria-hidden />
        {label}
      </time>
    );
  }
  const settled = person && person.key === key ? person.value : undefined;
  if (settled === undefined) {
    return <span data-mention="resolving">@{label}</span>;
  }
  if (!settled) {
    return (
      <span data-mention="unresolved" title="Not someone you can see in this organization">
        @{label}
      </span>
    );
  }
  const chip = (
    <>
      <AtSign className="h-3 w-3" aria-hidden />
      {settled.name}
    </>
  );
  return settled.email ? (
    <a
      href={`mailto:${settled.email}`}
      data-mention="person"
      title={`${settled.name} · ${settled.email}${settled.role ? ` · ${settled.role}` : ""}`}
      className="mx-0.5 inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 text-primary no-underline hover:bg-primary/20"
    >
      {chip}
    </a>
  ) : (
    <span data-mention="person" title={settled.name} className="mx-0.5 inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 text-primary">
      {chip}
    </span>
  );
}
