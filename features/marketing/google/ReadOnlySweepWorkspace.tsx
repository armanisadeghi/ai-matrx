"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  CheckSquare2,
  ContactRound,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Tags,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import ImportTasksModal from "@/features/tasks/components/ImportTasksModal";
import {
  useConnectGoogle,
  useGoogleCalendarAgenda,
  useGoogleConnectionInventory,
  useGoogleTasksPreview,
  useTagManagerInventory,
  useYouTubeAnalyticsPreview,
} from "@/features/marketing/google/hooks";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import type { TaskItemType } from "@/components/mardown-display/blocks/tasks/TaskChecklist";
import {
  GOOGLE_CALENDAR_AGENDA_SCOPES,
  GOOGLE_CONTACTS_IMPORT_SCOPES,
  GOOGLE_SCOPE,
  GOOGLE_TAG_MANAGER_SCOPES,
  GOOGLE_TASKS_IMPORT_SCOPES,
  GOOGLE_YOUTUBE_ANALYTICS_SCOPES,
} from "@/lib/googleScopes";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { LazyGoogleAPIProvider } from "@/providers/google-provider/LazyGoogleAPIProvider";
import { useGoogleAPI } from "@/providers/google-provider/GoogleApiProvider";

type SweepCapability = "calendar" | "tasks" | "youtube" | "tag_manager";

const CAPABILITY = {
  calendar: {
    scope: GOOGLE_SCOPE.calendarEventsOwnedReadonly,
    scopes: GOOGLE_CALENDAR_AGENDA_SCOPES,
  },
  tasks: {
    scope: GOOGLE_SCOPE.tasksReadonly,
    scopes: GOOGLE_TASKS_IMPORT_SCOPES,
  },
  youtube: {
    scope: GOOGLE_SCOPE.youtubeAnalyticsReadonly,
    scopes: GOOGLE_YOUTUBE_ANALYTICS_SCOPES,
  },
  tag_manager: {
    scope: GOOGLE_SCOPE.tagManagerReadonly,
    scopes: GOOGLE_TAG_MANAGER_SCOPES,
  },
} as const;

function isoDate(daysAgo: number): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - daysAgo);
  return value.toISOString().slice(0, 10);
}

function accountLabel(connection: GoogleConnectionSummary): string {
  return connection.account_email || connection.account_name || connection.id;
}

export function ReadOnlySweepWorkspace({
  reviewMode = false,
}: {
  reviewMode?: boolean;
}) {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  if (!isSuperAdmin) {
    return (
      <main className="flex min-h-full items-center justify-center bg-background p-6">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>More read-only Google connections are coming</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-muted-foreground">
            Contacts, Calendar, Tasks, YouTube Analytics, and Tag Manager are in
            Google&apos;s approval preparation lane. They remain unavailable to
            ordinary users until verification is complete.
          </CardContent>
        </Card>
      </main>
    );
  }
  return (
    <LazyGoogleAPIProvider>
      <ReadOnlySweepWorkspaceInner reviewMode={reviewMode} />
    </LazyGoogleAPIProvider>
  );
}

function ReadOnlySweepWorkspaceInner({ reviewMode }: { reviewMode: boolean }) {
  const google = useGoogleAPI();
  const inventory = useGoogleConnectionInventory();
  const connect = useConnectGoogle();
  const calendar = useGoogleCalendarAgenda();
  const tasks = useGoogleTasksPreview();
  const youtube = useYouTubeAnalyticsPreview();
  const tagManager = useTagManagerInventory();
  const [accepted, setAccepted] = useState<
    Partial<Record<SweepCapability, boolean>>
  >({});
  const [selectedConnections, setSelectedConnections] = useState<
    Partial<Record<SweepCapability, string>>
  >({});
  const [youtubeChannelId, setYoutubeChannelId] = useState("");
  const [taskImportOpen, setTaskImportOpen] = useState(false);

  const connections = (inventory.data?.connections ?? []).filter(
    (connection) => connection.health === "connected",
  );
  const resources = inventory.data?.resources ?? [];

  const connectionsFor = (capability: SweepCapability) =>
    connections.filter((connection) =>
      connection.scopes.includes(CAPABILITY[capability].scope),
    );

  const selectedConnection = (capability: SweepCapability) => {
    const candidates = connectionsFor(capability);
    const selected = selectedConnections[capability];
    return (
      candidates.find((connection) => connection.id === selected) ??
      candidates[0] ??
      null
    );
  };

  const authorize = async (capability: SweepCapability) => {
    try {
      if (!accepted[capability]) {
        throw new Error("Confirm the read-only disclosure first.");
      }
      const code = await google.requestAuthorizationCode(
        [...CAPABILITY[capability].scopes],
        undefined,
        { forceConsent: reviewMode },
      );
      const result = await connect.mutateAsync({
        code,
        owner: { type: "user" },
      });
      setSelectedConnections((current) => ({
        ...current,
        [capability]: result.connectionId,
      }));
      setAccepted((current) => ({ ...current, [capability]: false }));
      await inventory.refetch();
      toast.success("Google read-only access saved");
    } catch (error) {
      toast.error("Google authorization did not finish", {
        description: error instanceof Error ? error.message : "Try again.",
      });
    }
  };

  const googleTasks = useMemo<TaskItemType[]>(
    () =>
      (tasks.data?.task_lists ?? []).map((list) => ({
        id: `google-list-${list.task_list_id}`,
        title: list.title,
        type: "section",
        children: list.tasks.map((task) => ({
          id: `google-task-${list.task_list_id}-${task.task_id}`,
          title: task.title,
          type: "task",
          checked: task.status === "completed",
        })),
      })),
    [tasks.data],
  );

  const loadCalendar = async () => {
    const connection = selectedConnection("calendar");
    if (!connection) return;
    await calendar.mutateAsync({
      connectionId: connection.id,
      organizationId: connection.organization_id,
      days: 14,
    });
  };

  const loadTasks = async () => {
    const connection = selectedConnection("tasks");
    if (!connection) return;
    await tasks.mutateAsync({
      connectionId: connection.id,
      organizationId: connection.organization_id,
    });
  };

  const loadYouTube = async () => {
    const connection = selectedConnection("youtube");
    if (!connection || !youtubeChannelId) return;
    await youtube.mutateAsync({
      connectionId: connection.id,
      organizationId: connection.organization_id,
      channelId: youtubeChannelId,
      startDate: isoDate(29),
      endDate: isoDate(0),
    });
  };

  const loadTagManager = async () => {
    const connection = selectedConnection("tag_manager");
    if (!connection) return;
    await tagManager.mutateAsync({
      connectionId: connection.id,
      organizationId: connection.organization_id,
    });
  };

  const youtubeConnection = selectedConnection("youtube");
  const youtubeChannels = resources.filter(
    (resource) =>
      resource.resource_type === "youtube_channel" &&
      resource.connection_id === youtubeConnection?.id,
  );

  return (
    <main className="min-h-full bg-background px-4 py-6 text-foreground sm:px-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <Badge variant="outline">Google read-only connections</Badge>
            {reviewMode ? <Badge>Reviewer view</Badge> : null}
          </div>
          <h1 className="text-2xl font-semibold">
            Connect the Google data you choose
          </h1>
          <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
            Each feature asks only for the read permission it needs. AI Matrx
            never edits Google contacts, calendars, tasks, YouTube content, or
            Tag Manager configuration through these connections.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/marketing/connections/google">
              Manage or disconnect Google accounts
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ContactRound className="h-5 w-5" /> Google Contacts import
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Read contacts, preview field mapping and duplicates, then import
                only the records you select. AI Matrx never changes Google
                Contacts.
              </p>
              <code className="block break-all rounded bg-muted p-2 text-xs">
                {GOOGLE_CONTACTS_IMPORT_SCOPES.at(-1)}
              </code>
              <Button asChild className="min-h-11">
                <Link href="/crm/import">Open Google Contacts import</Link>
              </Button>
            </CardContent>
          </Card>

          <CapabilityCard
            icon={<CalendarDays className="h-5 w-5" />}
            title="Primary calendar agenda"
            capability="calendar"
            scope={CAPABILITY.calendar.scope}
            disclosure="Read upcoming events from my primary calendar for a 14-day agenda. AI Matrx cannot create, edit, share, or delete calendar events."
            accepted={Boolean(accepted.calendar)}
            onAccepted={(value) =>
              setAccepted((current) => ({ ...current, calendar: value }))
            }
            connections={connectionsFor("calendar")}
            selectedId={selectedConnection("calendar")?.id ?? ""}
            onSelect={(value) =>
              setSelectedConnections((current) => ({
                ...current,
                calendar: value,
              }))
            }
            onAuthorize={() => void authorize("calendar")}
            onLoad={() => void loadCalendar()}
            loading={connect.isPending || calendar.isPending}
            resultLabel="Load 14-day agenda"
          >
            {calendar.data ? (
              <ResultList empty="No upcoming events were found.">
                {calendar.data.events.map((event) => (
                  <li key={event.event_id} className="rounded border p-3">
                    <div className="font-medium">{event.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {event.starts_at
                        ? new Date(event.starts_at).toLocaleString()
                        : "No start time"}
                      {event.location ? ` · ${event.location}` : ""}
                    </div>
                  </li>
                ))}
              </ResultList>
            ) : null}
          </CapabilityCard>

          <CapabilityCard
            icon={<CheckSquare2 className="h-5 w-5" />}
            title="Google Tasks import"
            capability="tasks"
            scope={CAPABILITY.tasks.scope}
            disclosure="Read my Google task lists and tasks so I can preview and import selected items. AI Matrx never completes, edits, or deletes the source tasks."
            accepted={Boolean(accepted.tasks)}
            onAccepted={(value) =>
              setAccepted((current) => ({ ...current, tasks: value }))
            }
            connections={connectionsFor("tasks")}
            selectedId={selectedConnection("tasks")?.id ?? ""}
            onSelect={(value) =>
              setSelectedConnections((current) => ({
                ...current,
                tasks: value,
              }))
            }
            onAuthorize={() => void authorize("tasks")}
            onLoad={() => void loadTasks()}
            loading={connect.isPending || tasks.isPending}
            resultLabel="Preview Google Tasks"
          >
            {tasks.data ? (
              <div className="space-y-3">
                <ResultList empty="No Google Tasks were found.">
                  {tasks.data.task_lists.flatMap((list) =>
                    list.tasks.map((task) => (
                      <li
                        key={`${list.task_list_id}:${task.task_id}`}
                        className="rounded border p-3"
                      >
                        <div className="font-medium">{task.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {list.title}
                        </div>
                      </li>
                    )),
                  )}
                </ResultList>
                {googleTasks.some((list) => list.children?.length) ? (
                  <Button
                    className="min-h-11"
                    onClick={() => setTaskImportOpen(true)}
                  >
                    Choose tasks to import into AI Matrx
                  </Button>
                ) : null}
              </div>
            ) : null}
          </CapabilityCard>

          <CapabilityCard
            icon={<BarChart3 className="h-5 w-5" />}
            title="YouTube channel performance"
            capability="youtube"
            scope={CAPABILITY.youtube.scope}
            disclosure="Read non-monetary performance metrics for the owned channel I select. AI Matrx cannot upload, edit, comment, manage, or read revenue data."
            accepted={Boolean(accepted.youtube)}
            onAccepted={(value) =>
              setAccepted((current) => ({ ...current, youtube: value }))
            }
            connections={connectionsFor("youtube")}
            selectedId={youtubeConnection?.id ?? ""}
            onSelect={(value) => {
              setSelectedConnections((current) => ({
                ...current,
                youtube: value,
              }));
              setYoutubeChannelId("");
            }}
            onAuthorize={() => void authorize("youtube")}
            onLoad={() => void loadYouTube()}
            loading={connect.isPending || youtube.isPending}
            resultLabel="Load 30-day performance"
            loadDisabled={!youtubeChannelId}
            extraControl={
              youtubeConnection ? (
                <select
                  aria-label="Owned YouTube channel"
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm"
                  value={youtubeChannelId}
                  onChange={(event) => setYoutubeChannelId(event.target.value)}
                >
                  <option value="">Choose an owned channel</option>
                  {youtubeChannels.map((channel) => (
                    <option key={channel.id} value={channel.resource_ref}>
                      {channel.display_name}
                    </option>
                  ))}
                </select>
              ) : null
            }
          >
            {youtube.data ? (
              <ResultList empty="No YouTube Analytics rows were returned.">
                {youtube.data.days.map((day) => (
                  <li
                    key={day.day}
                    className="grid grid-cols-2 gap-2 rounded border p-3 text-xs sm:grid-cols-4"
                  >
                    <span>
                      <strong>{day.day}</strong>
                    </span>
                    <span>{day.views.toLocaleString()} views</span>
                    <span>
                      {day.estimated_minutes_watched.toLocaleString()} minutes
                    </span>
                    <span>+{day.subscribers_gained} subscribers</span>
                  </li>
                ))}
              </ResultList>
            ) : null}
          </CapabilityCard>

          <CapabilityCard
            icon={<Tags className="h-5 w-5" />}
            title="Tag Manager inventory"
            capability="tag_manager"
            scope={CAPABILITY.tag_manager.scope}
            disclosure="Read my Tag Manager accounts, containers, and workspaces for an inventory. AI Matrx cannot create tags, change versions, publish, or modify access."
            accepted={Boolean(accepted.tag_manager)}
            onAccepted={(value) =>
              setAccepted((current) => ({ ...current, tag_manager: value }))
            }
            connections={connectionsFor("tag_manager")}
            selectedId={selectedConnection("tag_manager")?.id ?? ""}
            onSelect={(value) =>
              setSelectedConnections((current) => ({
                ...current,
                tag_manager: value,
              }))
            }
            onAuthorize={() => void authorize("tag_manager")}
            onLoad={() => void loadTagManager()}
            loading={connect.isPending || tagManager.isPending}
            resultLabel="Load Tag Manager inventory"
          >
            {tagManager.data ? (
              <ResultList empty="No Tag Manager containers were found.">
                {tagManager.data.accounts.flatMap((account) =>
                  account.containers.map((container) => (
                    <li
                      key={`${account.account_id}:${container.container_id}`}
                      className="rounded border p-3"
                    >
                      <div className="font-medium">{container.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {account.name} ·{" "}
                        {container.public_id ?? container.container_id} ·{" "}
                        {container.workspaces.length} workspace
                        {container.workspaces.length === 1 ? "" : "s"}
                      </div>
                    </li>
                  )),
                )}
              </ResultList>
            ) : null}
          </CapabilityCard>
        </div>
      </div>

      <ImportTasksModal
        isOpen={taskImportOpen}
        onClose={() => setTaskImportOpen(false)}
        tasks={googleTasks}
        checkboxState={Object.fromEntries(
          googleTasks.flatMap((list) =>
            (list.children ?? []).map((task) => [
              task.id,
              Boolean(task.checked),
            ]),
          ),
        )}
      />
    </main>
  );
}

function CapabilityCard({
  icon,
  title,
  scope,
  disclosure,
  accepted,
  onAccepted,
  connections,
  selectedId,
  onSelect,
  onAuthorize,
  onLoad,
  loading,
  resultLabel,
  loadDisabled = false,
  extraControl,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  capability: SweepCapability;
  scope: string;
  disclosure: string;
  accepted: boolean;
  onAccepted: (value: boolean) => void;
  connections: GoogleConnectionSummary[];
  selectedId: string;
  onSelect: (value: string) => void;
  onAuthorize: () => void;
  onLoad: () => void;
  loading: boolean;
  resultLabel: string;
  loadDisabled?: boolean;
  extraControl?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <code className="block break-all rounded bg-muted p-2 text-xs">
          {scope}
        </code>
        <label className="flex min-h-11 items-start gap-3 rounded border p-3 text-sm">
          <Checkbox
            checked={accepted}
            onCheckedChange={(value) => onAccepted(value === true)}
            aria-label={`Confirm ${title} read-only disclosure`}
          />
          <span>{disclosure}</span>
        </label>
        <Button
          className="min-h-11"
          variant="outline"
          onClick={onAuthorize}
          disabled={!accepted || loading}
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Authorize {title}
        </Button>
        {connections.length ? (
          <>
            <select
              aria-label={`${title} Google account`}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm"
              value={selectedId}
              onChange={(event) => onSelect(event.target.value)}
            >
              {connections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {accountLabel(connection)}
                </option>
              ))}
            </select>
            {extraControl}
            <Button
              className="min-h-11"
              onClick={onLoad}
              disabled={loading || loadDisabled}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {resultLabel}
            </Button>
          </>
        ) : null}
        {children}
      </CardContent>
    </Card>
  );
}

function ResultList({
  empty,
  children,
}: {
  empty: string;
  children: React.ReactNode;
}) {
  const values = Array.isArray(children)
    ? children.flat().filter(Boolean)
    : children
      ? [children]
      : [];
  return values.length ? (
    <ul className="max-h-72 space-y-2 overflow-y-auto">{children}</ul>
  ) : (
    <p className="rounded border border-dashed p-3 text-sm text-muted-foreground">
      {empty}
    </p>
  );
}
