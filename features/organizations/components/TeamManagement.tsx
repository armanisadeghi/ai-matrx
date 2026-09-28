"use client";

/**
 * TeamManagement — the Teams section of organization settings.
 *
 * A team is a named group of people inside one organization; a person may be on
 * several. Teams feed the access ladder's "my team or department" list default
 * and are NEVER an access boundary: everyone in the organization sees every team
 * and who is on it (common-docs /systems/platform/teams/FEATURE.md).
 *
 * Organization owners and admins create, rename, archive and restore teams and
 * link a team to an HR department; a team's own admins rename it and manage its
 * members; anyone may leave a team they were added to. Members who are on a team
 * through its HR department are shown with where that comes from, and are changed
 * in HR — "Remove" is absent for them rather than present and failing.
 *
 * Reuses: MembersPanel (the shared roster), UserSearchField (the shared account
 * picker), TextInputDialog (Dialog on desktop, Drawer on mobile), confirm().
 */

import { useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Loader2,
  MoreVertical,
  Plus,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  MembersPanel,
  type PanelMember,
} from "@/components/membership/MembersPanel";
import type { MembershipRoleOption } from "@/components/membership/types";
import { UserSearchField } from "@/features/user-search/UserSearchField";
import { UserIdentity } from "@/components/user/UserIdentity";
import { useOrganizationMembers } from "../hooks";
import {
  useHrDepartmentOptions,
  useOrganizationTeams,
  useTeamMembers,
} from "../hooks/useTeams";
import {
  addTeamMember,
  archiveTeam,
  createTeam,
  removeTeamMember,
  restoreTeam,
  setTeamHrDepartment,
  setTeamMemberRole,
  updateTeam,
  type HrDepartmentOption,
  type Team,
  type TeamRole,
} from "../service/teamsService";

const TEAM_ROLE_OPTIONS: MembershipRoleOption[] = [
  { value: "admin", label: "Team admin" },
  { value: "member", label: "Member" },
];

const NO_DEPARTMENT = "__none__";

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

interface TeamManagementProps {
  organizationId: string;
  organizationName: string;
  /** The viewer is an owner or admin of the organization. */
  canManageTeams: boolean;
}

export function TeamManagement({
  organizationId,
  organizationName,
  canManageTeams,
}: TeamManagementProps) {
  const [showArchived, setShowArchived] = useState(false);
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const teams = useOrganizationTeams(organizationId, showArchived);
  const departments = useHrDepartmentOptions(organizationId, canManageTeams);

  const liveCount = teams.data.filter((t) => !t.archivedAt).length;

  if (teams.loading && teams.data.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (teams.error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="text-sm text-red-800 dark:text-red-200">{teams.error}</p>
        <Button onClick={teams.refresh} variant="outline" size="sm" className="mt-2">
          Retry
        </Button>
        <ErrorAlchemyMenu error={teams.error} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground flex-1">
          {liveCount === 0
            ? canManageTeams
              ? "No teams yet. Put the people who work together on a team — a crew, a department, a practice group — and every list's My team view shows what they made."
              : "No teams yet. An owner or admin of this organization creates them; once you are on one, every list's My team view shows what your team made."
            : `${liveCount} team${liveCount === 1 ? "" : "s"}`}
        </p>
        {canManageTeams && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </Button>
        )}
        {canManageTeams && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New team
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {teams.data.map((team) => (
          <TeamRow
            key={team.id}
            team={team}
            organizationId={organizationId}
            canManageTeams={canManageTeams}
            departments={departments.data}
            open={openTeamId === team.id}
            onToggle={() =>
              setOpenTeamId((current) => (current === team.id ? null : team.id))
            }
            onChanged={teams.refresh}
          />
        ))}
      </div>

      <TextInputDialog
        open={creating}
        onOpenChange={(o) => !busy && setCreating(o)}
        title="New team"
        description={`A team or department inside ${organizationName}. You add people next.`}
        placeholder="Team name, e.g. Front desk"
        confirmLabel="Create team"
        busy={busy}
        onConfirm={async (name) => {
          setBusy(true);
          try {
            const id = await createTeam({ organizationId, name });
            setCreating(false);
            setShowArchived(false);
            setOpenTeamId(id);
            teams.refresh();
            toast.success(`Created ${name.trim()}`);
          } catch (e) {
            toast.error(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function TeamRow({
  team,
  organizationId,
  canManageTeams,
  departments,
  open,
  onToggle,
  onChanged,
}: {
  team: Team;
  organizationId: string;
  canManageTeams: boolean;
  departments: HrDepartmentOption[];
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [describing, setDescribing] = useState(false);
  const [busy, setBusy] = useState(false);
  const archived = Boolean(team.archivedAt);

  const run = async (work: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast.success(done);
      onChanged();
      return true;
    } catch (e) {
      toast.error(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const hasMenu = (team.canManage && !archived) || canManageTeams;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={archived}
          aria-expanded={open}
          className="flex flex-1 min-w-0 items-center gap-3 text-left disabled:cursor-default"
        >
          {archived ? (
            <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm truncate">{team.name}</span>
              {/* An archived team counts nobody today; its members come back with it. */}
              {!archived && (
                <Badge variant="secondary" className="text-xs">
                  {team.memberCount} {team.memberCount === 1 ? "person" : "people"}
                </Badge>
              )}
              {team.hrDepartmentName && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Building2 className="h-3 w-3" />
                  {team.hrDepartmentName}
                </Badge>
              )}
              {team.myRole && !archived && (
                <Badge variant="outline" className="text-xs">
                  {team.myRole === "admin" ? "You're a team admin" : "You're on it"}
                </Badge>
              )}
              {archived && (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  Archived
                </Badge>
              )}
            </div>
            {team.description && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {team.description}
              </p>
            )}
          </div>
        </button>

        {hasMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" disabled={busy} aria-label={`${team.name} actions`}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {team.canManage && !archived && (
                <DropdownMenuItem onClick={() => setRenaming(true)}>Rename</DropdownMenuItem>
              )}
              {team.canManage && !archived && (
                <DropdownMenuItem onClick={() => setDescribing(true)}>
                  {team.description ? "Edit description" : "Add a description"}
                </DropdownMenuItem>
              )}
              {team.canManage && !archived && team.description && (
                <DropdownMenuItem
                  onClick={() => run(() => updateTeam(team.id, team.name, ""), "Description removed")}
                >
                  Remove description
                </DropdownMenuItem>
              )}
              {canManageTeams && !archived && (
                <DropdownMenuItem
                  className="text-red-600 dark:text-red-400"
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Archive ${team.name}?`,
                      description:
                        "It leaves the team list, and its members stop counting as teammates in lists set to show \"my team or department\". Nobody loses access to anything, nothing is deleted, and an owner or admin can restore it with its members.",
                      confirmLabel: "Archive",
                      variant: "destructive",
                    });
                    if (ok) await run(() => archiveTeam(team.id), `Archived ${team.name}`);
                  }}
                >
                  Archive
                </DropdownMenuItem>
              )}
              {canManageTeams && archived && (
                <DropdownMenuItem
                  onClick={() => run(() => restoreTeam(team.id), `Restored ${team.name}`)}
                >
                  Restore
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {open && !archived && (
        <div className="border-t p-3">
          <TeamDetail
            team={team}
            organizationId={organizationId}
            canManageTeams={canManageTeams}
            departments={departments}
            onTeamChanged={onChanged}
          />
        </div>
      )}

      <TextInputDialog
        open={renaming}
        onOpenChange={(o) => !busy && setRenaming(o)}
        title="Rename team"
        defaultValue={team.name}
        placeholder="Team name"
        confirmLabel="Rename"
        busy={busy}
        onConfirm={async (name) => {
          if (await run(() => updateTeam(team.id, name, team.description ?? ""), "Renamed")) {
            setRenaming(false);
          }
        }}
      />
      <TextInputDialog
        open={describing}
        onOpenChange={(o) => !busy && setDescribing(o)}
        title={`What ${team.name} does`}
        description="Shown under the team's name."
        defaultValue={team.description ?? ""}
        placeholder="e.g. Greets patients, answers the phones and books appointments."
        multiline
        rows={3}
        confirmLabel="Save"
        busy={busy}
        onConfirm={async (description) => {
          if (await run(() => updateTeam(team.id, team.name, description), "Saved")) {
            setDescribing(false);
          }
        }}
      />
    </div>
  );
}

function TeamDetail({
  team,
  organizationId,
  canManageTeams,
  departments,
  onTeamChanged,
}: {
  team: Team;
  organizationId: string;
  canManageTeams: boolean;
  departments: HrDepartmentOption[];
  onTeamChanged: () => void;
}) {
  const viewerId = useAppSelector(selectUserId);
  const members = useTeamMembers(team.id);
  const [busy, setBusy] = useState(false);

  const changed = () => {
    members.refresh();
    onTeamChanged();
  };

  const act = async (work: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast.success(done);
      changed();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const panelMembers: PanelMember[] = members.data.map((m) => ({
    id: m.userId,
    userId: m.userId,
    role: m.role,
    joinedAt: m.listedSince,
    user: {
      id: m.userId,
      email: m.email ?? "",
      displayName: m.displayName ?? undefined,
      avatarUrl: m.avatarUrl ?? undefined,
    },
  }));
  const byUser = new Map(members.data.map((m) => [m.userId, m]));
  const mine = viewerId ? byUser.get(viewerId) : undefined;

  return (
    <div className="space-y-4">
      {canManageTeams && departments.length > 0 ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <Label className="text-sm sm:w-48 shrink-0">Members from HR</Label>
          <Select
            value={team.hrDepartmentId ?? NO_DEPARTMENT}
            disabled={busy}
            onValueChange={(value) => {
              const next = value === NO_DEPARTMENT ? null : value;
              const name = departments.find((d) => d.id === next)?.name;
              void act(
                () => setTeamHrDepartment(team.id, next),
                next
                  ? `Everyone in ${name} and its sub-departments is now on ${team.name}`
                  : `${team.name} no longer takes members from HR`,
              );
            }}
          >
            <SelectTrigger className="sm:max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_DEPARTMENT}>No HR department</SelectItem>
              {team.hrDepartmentId &&
                !departments.some((d) => d.id === team.hrDepartmentId) && (
                  // Linked to a department HR has since archived or deactivated: it feeds nobody.
                  <SelectItem value={team.hrDepartmentId}>
                    A department HR no longer uses (feeds nobody)
                  </SelectItem>
                )}
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : team.hrDepartmentName ? (
        <p className="text-xs text-muted-foreground">
          Everyone in the HR department {team.hrDepartmentName} is on this team automatically.
        </p>
      ) : null}

      {team.canManage && (
        <AddTeamMember
          organizationId={organizationId}
          teamName={team.name}
          excludeUserIds={members.data.map((m) => m.userId)}
          disabled={busy}
          onAdd={(userId, label) => act(() => addTeamMember(team.id, userId), `Added ${label}`)}
        />
      )}

      {members.error ? (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">
            {members.error}
            <ErrorAlchemyMenu error={members.error} operation="List this team's members" />
          </p>
          <Button onClick={members.refresh} variant="outline" size="sm" className="mt-2">
            Retry
          </Button>
        </div>
      ) : members.loading && members.data.length === 0 ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : members.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nobody is on {team.name} yet.
          {team.canManage ? " Add people above." : ""}
        </p>
      ) : (
        <MembersPanel
          members={panelMembers}
          roleOptions={TEAM_ROLE_OPTIONS}
          operationLoading={busy}
          containerNoun="team"
          removeConsequence="They stay in the organization and keep everything they could open; lists just stop showing their work under My team for this team."
          copyContainer={{ noun: "team", id: team.id, name: team.name }}
          canManageMember={() => team.canManage}
          canRemoveMember={(m) => byUser.get(m.userId)?.isListed ?? false}
          isLastOwner={() => false}
          onChangeRole={(m, role) =>
            act(
              () => setTeamMemberRole(team.id, m.userId, role as TeamRole),
              role === "admin"
                ? `${m.user?.displayName ?? m.user?.email} is now a team admin`
                : `${m.user?.displayName ?? m.user?.email} is now a member`,
            )
          }
          onRemove={(m) =>
            act(
              () => removeTeamMember(team.id, m.userId),
              byUser.get(m.userId)?.isFromHr
                ? `${m.user?.displayName ?? m.user?.email} was added by hand and also works in ${team.hrDepartmentName ?? "the linked HR department"}, so they stay on ${team.name} as a member through HR`
                : `Removed ${m.user?.displayName ?? m.user?.email} from ${team.name}`,
            )
          }
          renderMemberExtra={(m) =>
            byUser.get(m.userId)?.isFromHr ? (
              <Badge
                variant="outline"
                className="text-xs gap-1 whitespace-nowrap"
                title={`On this team because they work in ${team.hrDepartmentName ?? "its HR department"}. Change their department in HR to take them off.`}
              >
                <Building2 className="h-3 w-3" />
                From HR
              </Badge>
            ) : null
          }
        />
      )}

      {mine?.isListed && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={async () => {
              const ok = await confirm({
                title: `Leave ${team.name}?`,
                description: mine.isFromHr
                  ? "You stay on this team through your HR department; leaving only removes the place you were added by hand."
                  : `People on ${team.name} stop counting as your teammates in lists set to show "my team or department". You can be added back any time.`,
                confirmLabel: "Leave team",
              });
              if (ok) await act(() => removeTeamMember(team.id, mine.userId), `You left ${team.name}`);
            }}
          >
            Leave team
          </Button>
        </div>
      )}
    </div>
  );
}

function AddTeamMember({
  organizationId,
  teamName,
  excludeUserIds,
  disabled,
  onAdd,
}: {
  organizationId: string;
  teamName: string;
  excludeUserIds: string[];
  disabled: boolean;
  onAdd: (userId: string, label: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const { members, loading } = useOrganizationMembers(organizationId);
  const excluded = new Set(excludeUserIds);
  const candidates = members.filter((m) => !excluded.has(m.userId));
  const q = query.trim().toLowerCase();
  const matches = q
    ? candidates
        .filter(
          (m) =>
            (m.user?.email ?? "").toLowerCase().includes(q) ||
            (m.user?.displayName ?? "").toLowerCase().includes(q),
        )
        .slice(0, 6)
    : [];

  const add = async (userId: string, label: string) => {
    await onAdd(userId, label);
    setQuery("");
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-muted-foreground shrink-0" />
        <UserSearchField
          value={query}
          onValueChange={setQuery}
          onUserSelect={(user) =>
            void add(user.id, user.displayName ?? user.email ?? "them")
          }
          candidates={candidates.map((m) => ({
            id: m.userId,
            email: m.user?.email ?? null,
            displayName: m.user?.displayName ?? null,
            avatarUrl: m.user?.avatarUrl ?? null,
            phone: null,
            adminLevel: null,
            organizations: [],
            source: m.role,
            createdAt: null,
            lastSignInAt: null,
          }))}
          excludeUserIds={excludeUserIds}
          title={`Add people to ${teamName}`}
          placeholder={
            loading
              ? "Loading this organization's members…"
              : candidates.length === 0
                ? "Everyone in this organization is already on this team"
                : "Add someone from this organization…"
          }
          disabled={disabled || loading || candidates.length === 0}
          className="flex-1"
          inputClassName="h-9"
          ariaLabel={`Browse this organization's members to add to ${teamName}`}
        />
      </div>
      {q && (
        <div className="rounded-md border divide-y">
          {matches.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground">
              Nobody in this organization matches "{query.trim()}" who isn't already on the team.
            </p>
          ) : (
            matches.map((m) => {
              const label = m.user?.displayName ?? m.user?.email ?? "this person";
              return (
                <div key={m.userId} className="flex items-center gap-2 p-2">
                  <UserIdentity
                    user={{
                      id: m.userId,
                      email: m.user?.email ?? "",
                      displayName: m.user?.displayName,
                      avatarUrl: m.user?.avatarUrl,
                    }}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => void add(m.userId, label)}
                  >
                    Add
                  </Button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
