"use client";

/**
 * features/sharing/components/AddEveryoneInOrg.tsx
 *
 * "ADD EVERYONE IN <ORGANIZATION>" — THE HONEST REPLACEMENT FOR "SHARE WITH ORGANIZATION".
 *
 * Owner ruling (Arman, 2026-09-23): access is personal. Permission is granted to a PERSON, never
 * to an organization. The Share dialog used to carry a "Share with Organization" tab that wrote
 * one grant to a whole organization; the store now refuses that with "Shares name a person, not
 * an organization." (lane SHARE-PEOPLE-ONLY, 2026-09-25).
 *
 * The convenience it offered, giving everybody on a team the thing at once, lives here instead.
 * The person picks one of THEIR organizations. Its CURRENT members are listed by name, each with
 * a checkbox and all ticked. Pressing the button grants each ticked PERSON through the same door
 * the single-person share uses. Nobody who joins later is included, and the panel says so in one
 * sentence.
 */

import { readOrganizationMemberRows } from "@/features/organizations/service/orgMemberRows";
import React, { useEffect, useState } from "react";
import { Building2, CheckCircle, Loader2, Users, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNavTree } from "@/features/agent-context/hooks/useNavTree";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import type {
  PermissionLevel,
  ShareActionResult,
} from "@/utils/permissions/types";

/** One current member of the chosen organization, as the dialog shows them. */
export interface OrgMemberPerson {
  userId: string;
  email: string;
  name: string;
}

export interface AddEveryoneInOrgProps {
  /** Grants ONE person. The same door the single-person share uses. */
  grantPerson: (
    person: OrgMemberPerson,
    level: PermissionLevel,
  ) => Promise<ShareActionResult>;
  /** The level picked in the People tab. Everyone added here gets it. */
  level: PermissionLevel;
  /** People who already hold a grant on this thing. They are shown, not re-granted. */
  alreadySharedUserIds?: string[];
  /** Called once after a run that granted at least one person. */
  onDone?: () => void;
  /**
   * The organization the thing lives in, when the dialog knows it. It is chosen first, so "Add
   * everyone in <that organization>" is one press away; any other organization the person
   * belongs to stays one pick away.
   */
  defaultOrgId?: string;
}

type Outcome = { ok: boolean; say: string };

async function readMembers(orgId: string): Promise<OrgMemberPerson[]> {
  // THE ONE ROSTER READ (joined in flight, reused for 30 s).
  const data = await readOrganizationMemberRows(orgId);
  return data.map((row) => ({
    userId: row.user_id,
    email: row.user_email ?? "",
    name: row.user_display_name || row.user_email || "Unnamed person",
  }));
}

export function AddEveryoneInOrg({
  grantPerson,
  level,
  alreadySharedUserIds = [],
  onDone,
  defaultOrgId,
}: AddEveryoneInOrgProps) {
  const { orgs } = useNavTree();
  const me = useAppSelector(selectUserId);
  const [open, setOpen] = useState(false);
  const [orgId, setOrgId] = useState("");
  const [members, setMembers] = useState<OrgMemberPerson[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});

  const orgName = orgs.find((o) => o.id === orgId)?.name ?? "this organization";
  const already = new Set(alreadySharedUserIds);

  useEffect(() => {
    if (!open || !orgId) return;
    let cancelled = false;
    setMembers(null);
    setLoadError(null);
    setOutcomes({});
    readMembers(orgId)
      .then((rows) => {
        if (cancelled) return;
        const others = rows.filter((m) => m.userId !== me);
        setMembers(others);
        // All on by default, except people who already have it.
        setTicked(
          new Set(others.filter((m) => !already.has(m.userId)).map((m) => m.userId)),
        );
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setLoadError(
            err instanceof Error ? err.message : "The member list could not be read.",
          );
      });
    return () => {
      cancelled = true;
    };
    // `already` is read once per organization pick on purpose: a grant made here must not
    // untick the row it just granted while the results are on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orgId, me]);

  const toggle = (userId: string, on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(userId);
      else next.delete(userId);
      return next;
    });

  const chosen = (members ?? []).filter((m) => ticked.has(m.userId));

  const run = async () => {
    setRunning(true);
    const next: Record<string, Outcome> = {};
    let granted = 0;
    for (const person of chosen) {
      try {
        const result = await grantPerson(person, level);
        next[person.userId] = result.success
          ? { ok: true, say: "Shared" }
          : { ok: false, say: result.error || "Not shared" };
        if (result.success) granted += 1;
      } catch (err: unknown) {
        next[person.userId] = {
          ok: false,
          say: err instanceof Error ? err.message : "Not shared",
        };
      }
      setOutcomes({ ...next });
    }
    setRunning(false);
    setTicked(new Set());
    if (granted > 0) onDone?.();
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-full h-9"
        onClick={() => {
          // Start on the thing's own organization when the person is in it.
          if (!orgId && defaultOrgId && orgs.some((o) => o.id === defaultOrgId))
            setOrgId(defaultOrgId);
          setOpen(true);
        }}
      >
        <Users className="w-4 h-4 mr-2" />
        Add everyone in an organization
      </Button>
    );
  }

  return (
    <div
      className="space-y-2.5 p-3 bg-muted/30 rounded-lg border"
      data-add-everyone-in-org
    >
      <div>
        <h3 className="text-sm font-medium mb-1">
          Add everyone in {orgId ? orgName : "an organization"}
        </h3>
        <p className="text-xs text-muted-foreground">
          Each person below is given access by name. People who join later are
          not added.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="add-everyone-org" className="text-xs">
          Organization
        </Label>
        <Select value={orgId} onValueChange={setOrgId} disabled={running}>
          <SelectTrigger id="add-everyone-org" className="h-9">
            <SelectValue placeholder="Choose one of your organizations" />
          </SelectTrigger>
          <SelectContent>
            {orgs.map((org) => (
              <SelectItem key={org.id} value={org.id}>
                <div className="flex items-center gap-2">
                  <Building2 className="w-3 h-3" />
                  <span>{org.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {orgId && loadError ? (
        <p className="text-xs text-destructive">
          The people in {orgName} could not be listed: {loadError}
        </p>
      ) : null}
      {orgId && !loadError && members === null ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" /> Listing the people in{" "}
          {orgName}…
        </div>
      ) : null}
      {members && members.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nobody else is in {orgName}.
        </p>
      ) : null}

      {members && members.length > 0 ? (
        <ul className="space-y-1 max-h-56 overflow-y-auto" aria-label={`People in ${orgName}`}>
          {members.map((m) => {
            const has = already.has(m.userId);
            const outcome = outcomes[m.userId];
            return (
              <li
                key={m.userId}
                className="flex items-center gap-2 text-sm"
                data-member={m.email}
              >
                <Checkbox
                  id={`add-everyone-${m.userId}`}
                  checked={ticked.has(m.userId)}
                  disabled={running || has || !!outcome?.ok}
                  onCheckedChange={(v) => toggle(m.userId, v === true)}
                />
                <label
                  htmlFor={`add-everyone-${m.userId}`}
                  className="flex-1 min-w-0"
                >
                  <span className="block truncate">{m.name}</span>
                  {m.email && m.email !== m.name ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {m.email}
                    </span>
                  ) : null}
                </label>
                {has && !outcome ? (
                  <span className="text-xs text-muted-foreground">
                    Already has access
                  </span>
                ) : null}
                {outcome ? (
                  <span
                    className={`flex items-center gap-1 text-xs ${outcome.ok ? "text-green-700 dark:text-green-400" : "text-destructive"}`}
                  >
                    {outcome.ok ? (
                      <CheckCircle className="w-3 h-3" />
                    ) : (
                      <XCircle className="w-3 h-3" />
                    )}
                    {outcome.say}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {members && members.length > 0 && chosen.length === 0 && !running ? (
        <p className="text-xs text-muted-foreground">
          {Object.values(outcomes).some((o) => o.ok) ||
          members.every((m) => already.has(m.userId))
            ? `Everyone listed in ${orgName} has access now.`
            : "Tick the people to add."}
        </p>
      ) : null}
      {members && members.length > 0 && (chosen.length > 0 || running) ? (
        <Button
          type="button"
          onClick={run}
          disabled={running || chosen.length === 0}
          className="w-full h-9"
        >
          {running ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Sharing…
            </>
          ) : (
            <>
              <Users className="w-4 h-4 mr-2" />
              Share with {chosen.length}{" "}
              {chosen.length === 1 ? "person" : "people"}
            </>
          )}
        </Button>
      ) : null}
    </div>
  );
}
