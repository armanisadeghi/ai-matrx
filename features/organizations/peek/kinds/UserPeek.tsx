"use client";

/**
 * UserPeek — a quick read-only profile of a PLATFORM USER (a member), for any
 * surface that names a person by account id: @-mention chips, comment authors,
 * "shared by", activity rows.
 *
 * Access is personal (Arman, 2026-09-23): the person opens when the viewer
 * shares ANY organization with them — never only the active one. The database
 * decides (`people_you_share_an_organization_with`, through
 * features/organizations/people/visiblePeople.ts). Someone the viewer shares
 * no organization with reads as "not someone you can see" — nothing revealed.
 *
 * There is no profile route a member may open for another member, so the
 * footer carries no Open door; emailing the person is a secondary action in
 * the body.
 */

import React from "react";
import { Mail, UserRound } from "lucide-react";
import { resolveVisiblePerson, type VisiblePerson } from "@/features/organizations/people/visiblePeople";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

type State = { status: "loading" } | { status: "found"; person: VisiblePerson } | { status: "unavailable" };

export default function UserPeek({ id, open, onClose }: PeekProps) {
  const [state, setState] = React.useState<State>({ status: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    resolveVisiblePerson(id)
      .then((person) => {
        if (!cancelled) setState(person ? { status: "found", person } : { status: "unavailable" });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const person = state.status === "found" ? state.person : null;
  const name = person?.name || "Person";

  return (
    <PeekDialog
      open={open}
      onClose={onClose}
      title={name}
      icon={<UserRound className="h-4 w-4 text-violet-600 dark:text-violet-400" />}
      href={null}
      loading={state.status === "loading"}
    >
      {person ? (
        <div className="space-y-3" data-user-peek="">
          <div className="flex items-center gap-3">
            {person.avatarUrl ? (
              <img src={person.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                {name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{name}</p>
              {person.role ? <p className="text-xs capitalize text-muted-foreground">{person.role}</p> : null}
            </div>
          </div>
          {person.organizationName ? (
            <PeekField label="Shared organization">
              <span className="text-sm text-muted-foreground">{person.organizationName}</span>
            </PeekField>
          ) : null}
          {person.email ? (
            <PeekField label="Email">
              <a href={`mailto:${person.email}`} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                <Mail className="h-3.5 w-3.5" aria-hidden />
                {person.email}
              </a>
            </PeekField>
          ) : null}
          {person.joinedAt ? (
            <PeekField label="Member since">
              <span className="text-sm text-muted-foreground">{new Date(person.joinedAt).toLocaleDateString()}</span>
            </PeekField>
          ) : null}
        </div>
      ) : state.status === "unavailable" ? (
        <p className="text-sm text-muted-foreground" data-user-peek-unavailable="">
          This person isn&apos;t someone you share an organization with.
        </p>
      ) : null}
    </PeekDialog>
  );
}
