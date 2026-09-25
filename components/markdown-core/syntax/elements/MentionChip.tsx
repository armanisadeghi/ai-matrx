"use client";

// A mention chip — `@[Dana](user:<uuid>)` / `@[Tue, Sep 30](date:2026-09-30)`
// (RC-B11's stored form). A person resolves against everyone the viewer shares
// ANY organization with (features/organizations/people/visiblePeople.ts — the
// database decides; access is personal, never the active org): found → a chip
// that opens the platform's person peek (`user` in features/organizations/peek
// — profile, role, email as a secondary action); not found (no shared
// organization, signed out, refused) → the label as plain text, honestly —
// never a chip that goes nowhere.

import { useEffect, useState, type ReactNode } from "react";
import { AtSign, CalendarDays } from "lucide-react";
import { ResourcePeekHost } from "@/features/organizations/peek/ResourcePeekHost";
import type { VisiblePerson } from "@/features/organizations/people/visiblePeople";

type Resolver = typeof import("@/features/organizations/people/visiblePeople");
let resolverModule: Promise<Resolver> | null = null;
const loadResolver = () => (resolverModule ??= import("@/features/organizations/people/visiblePeople"));

export function MentionChip(props: { "data-kind"?: string; "data-id"?: string; "data-label"?: string; children?: ReactNode }) {
  const kind = props["data-kind"];
  const id = String(props["data-id"] ?? "");
  const label = String(props["data-label"] ?? "");
  const [person, setPerson] = useState<{ key: string; value: VisiblePerson | null } | null>(null);
  const [peekOpen, setPeekOpen] = useState(false);
  const key = id;

  useEffect(() => {
    if (kind !== "person") return;
    let live = true;
    loadResolver()
      .then((m) => m.resolveVisiblePerson(id))
      .then((value) => {
        if (live) setPerson({ key, value });
      })
      .catch(() => {
        if (live) setPerson({ key, value: null });
      });
    return () => {
      live = false;
    };
  }, [kind, id, key]);

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
      <span data-mention="unresolved" title="Not someone you share an organization with">
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
  return (
    <>
      <button
        type="button"
        onClick={() => setPeekOpen(true)}
        data-mention="person"
        title={`${settled.name}${settled.role ? ` · ${settled.role}` : ""}`}
        className="mx-0.5 inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 align-baseline text-primary hover:bg-primary/20"
      >
        {chip}
      </button>
      {peekOpen ? <ResourcePeekHost kind="user" id={settled.userId} onClose={() => setPeekOpen(false)} /> : null}
    </>
  );
}
