// features/agents/org-chart/components/OrgBoxPicker.tsx
//
// Choose ANY box for the org chart: an agent (the one canonical agent picker),
// a person (the organization roster), a team, or a position — including a new
// position typed right here. Returns a box id (`type:entityId`).

"use client";

import { useEffect, useState } from "react";
import { Briefcase, Plus, UsersRound } from "lucide-react";
import { AgentListInlinePicker } from "@ai-matrx/agents/catalog/react";
import { Button, Field, SearchField, Tabs } from "@ai-matrx/design-system/controls";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrgPositions } from "@/features/agents/redux/orchestras/selectors";
import { createOrgPosition, loadOrgPositions } from "@/features/agents/redux/orchestras/orgChartThunks";
import { selectOrganizationId, selectOrganizationName } from "@/lib/redux/slices/appContextSlice";
import { OrganizationPickerPopover } from "@/features/organizations/components/OrganizationPickerPopover";
import { toast } from "@/lib/toast";
import { boxId, parseBoxId, type OrgBoxType } from "../constants";
import { loadOrgDirectory, type OrgMember, type OrgTeam } from "../useBoxIdentity";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
const TAB_LABEL: Record<OrgBoxType, string> = {
  agent: "Agents",
  membership: "People",
  team: "Teams",
  position: "Positions",
};

function Row({
  icon,
  title,
  detail,
  onPick,
}: {
  icon: React.ReactNode;
  title: string;
  detail?: string | null;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted"
    >
      <span
        data-matrx-pill="off" // an avatar circle, not a label capsule
        className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-foreground/70"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate type-body text-foreground">{title}</span>
        {detail && <span className="block truncate type-secondary text-muted-foreground">{detail}</span>}
      </span>
    </button>
  );
}

export function OrgBoxPicker({
  onPick,
  exclude = [],
  types = ["agent", "membership", "team", "position"],
  initialType = "agent",
  organizationId,
}: {
  onPick: (boxId: string) => void;
  /** Box ids that can't be chosen here (the box itself, its current place). */
  exclude?: readonly string[];
  /** Which tabs to offer. */
  types?: readonly OrgBoxType[];
  initialType?: OrgBoxType;
  /** Only people and teams of this organization (a position is filled from its own). */
  organizationId?: string;
}) {
  const dispatch = useAppDispatch();
  const [tab, setTab] = useState<OrgBoxType>(types.includes(initialType) ? initialType : types[0]);
  const [query, setQuery] = useState("");
  const [teams, setTeams] = useState<OrgTeam[] | null>(null);
  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const positions = useAppSelector(selectOrgPositions);
  // A new position is a WRITE, so it lands in the organization being worked in —
  // shown, and chosen right here when none is (never a silent wait on a gate).
  const writeOrgId = useAppSelector(selectOrganizationId);
  const writeOrgName = useAppSelector(selectOrganizationName);
  const excluded = new Set(exclude);
  const excludedAgents = exclude.map(parseBoxId).filter((b) => b.type === "agent").map((b) => b.id);
  const q = query.trim().toLowerCase();
  const hit = (...parts: Array<string | null | undefined>) => !q || parts.some((p) => p?.toLowerCase().includes(q));

  useEffect(() => {
    dispatch(loadOrgPositions());
  }, [dispatch]);
  useEffect(() => {
    if (tab === "agent" || tab === "position" || (teams && members)) return;
    void loadOrgDirectory().then((d) => {
      setLoadError(d.failed.length ? `Some people and teams could not load (${d.failed.join(", ")}).` : null);
      setTeams(
        [...d.teams.values()]
          .filter((t) => !organizationId || t.organizationId === organizationId)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setMembers(
        [...d.members.values()]
          .filter((m) => !organizationId || m.organizationId === organizationId)
          .sort((a, b) => a.name.localeCompare(b.name) || a.organizationName.localeCompare(b.organizationName)),
      );
    });
  }, [tab, teams, members, organizationId]);

  const createPosition = async () => {
    const name = newName.trim();
    if (!name) return;
    if (!writeOrgId) return;
    setCreating(true);
    try {
      const res = await dispatch(createOrgPosition({ organizationId: writeOrgId, name }));
      if ("error" in res) toast.error(res.error);
      else onPick(boxId("position", res.id));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex h-[26rem] flex-col gap-2">
      {types.length > 1 && (
        <Tabs
          aria-label="What to choose"
          value={tab}
          onValueChange={(v) => {
            setTab(v);
            setQuery("");
          }}
          data={types.map((t) => ({ value: t, label: TAB_LABEL[t] }))}
        />
      )}

      {tab === "agent" ? (
        <AgentListInlinePicker
          consumerId="org-chart-box-picker"
          onSelect={(id: string) => onPick(boxId("agent", id))}
          showPinnedAgent={false}
          excludeAgentIds={excludedAgents}
          className="min-h-0 flex-1 rounded-md border border-border bg-card"
        />
      ) : (
        <>
          <SearchField
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Find ${TAB_LABEL[tab].toLowerCase()}`}
            aria-label={`Find ${TAB_LABEL[tab].toLowerCase()}`}
          />
          {loadError && (
            <div className="flex items-center gap-2 type-secondary text-destructive">
              <span className="min-w-0 flex-1 truncate" title={loadError}>{loadError}</span>
              <Button variant="link" onClick={() => {
                  setLoadError(null);
                  void loadOrgDirectory(true).then(() => {
                    setTeams(null);
                    setMembers(null);
                  });
                }}>
                Retry
              </Button>
            <ErrorAlchemyMenu error={loadError} /></div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-card p-1">
            {tab === "membership" &&
              (members === null ? (
                <p className="p-3 type-body text-muted-foreground">Loading people…</p>
              ) : (
                members
                  .filter((m) => !excluded.has(boxId("membership", m.membershipId)) && hit(m.name, m.email, m.organizationName))
                  .map((m) => (
                    <Row
                      key={m.membershipId}
                      icon={
                        m.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- a 28px roster avatar
                          <img src={m.avatarUrl} alt="" className="h-7 w-7 object-cover" />
                        ) : (
                          <span className="type-meta font-semibold">{m.name.slice(0, 2).toUpperCase()}</span>
                        )
                      }
                      title={m.name}
                      detail={m.organizationName}
                      onPick={() => onPick(boxId("membership", m.membershipId))}
                    />
                  ))
              ))}
            {tab === "team" &&
              (teams === null ? (
                <p className="p-3 type-body text-muted-foreground">Loading teams…</p>
              ) : teams.length === 0 ? (
                <p className="p-3 type-body text-muted-foreground">No teams yet. Create one in organization settings.</p>
              ) : (
                teams
                  .filter((t) => !excluded.has(boxId("team", t.id)) && hit(t.name, t.description))
                  .map((t) => (
                    <Row
                      key={t.id}
                      icon={<UsersRound className="h-3.5 w-3.5" />}
                      title={t.name}
                      detail={`${t.memberCount} ${t.memberCount === 1 ? "member" : "members"}`}
                      onPick={() => onPick(boxId("team", t.id))}
                    />
                  ))
              ))}
            {tab === "position" && (
              <>
                {positions
                  .filter((p) => !excluded.has(boxId("position", p.id)) && hit(p.name, p.description))
                  .map((p) => (
                    <Row
                      key={p.id}
                      icon={<Briefcase className="h-3.5 w-3.5" />}
                      title={p.name}
                      detail={p.filledByUserId ? "Filled" : "Open position"}
                      onPick={() => onPick(boxId("position", p.id))}
                    />
                  ))}
                {positions.length === 0 && (
                  <p className="p-3 type-body text-muted-foreground">No positions yet. Name the first one below.</p>
                )}
              </>
            )}
          </div>
          {tab === "position" && (
            <>
            <div className="flex items-center gap-1.5 type-secondary text-muted-foreground">
              <span>{writeOrgId ? `Creates in ${writeOrgName ?? "your organization"}` : "Choose where new positions go"}</span>
              <OrganizationPickerPopover
                trigger={
                  <Button variant="link">
                    {writeOrgId ? "Change" : "Choose organization"}
                  </Button>
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <Field
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createPosition();
                  }
                }}
                placeholder="New position, e.g. SEO Lead"
                aria-label="New position name"
                className="flex-1"
              />
              <Button
                type="button"
                variant="primary"
                icon={<Plus className="h-4 w-4" />}
                disabled={!newName.trim() || creating || !writeOrgId}
                onClick={() => void createPosition()}
              >
                Create
              </Button>
            </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
