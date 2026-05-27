"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchAgentVersionHistory,
  fetchAgentVersionSnapshot,
  promoteAgentVersion,
} from "@/features/agents/redux/agent-definition/thunks";
import type { AgentVersionHistoryItem } from "@/features/agents/redux/agent-definition/thunks";
import {
  selectAgentById,
  selectVersionsByParentAgentId,
} from "@/features/agents/redux/agent-definition/selectors";
import SearchableSelect from "@/components/matrx/SearchableSelect";
import type { Option } from "@/components/matrx/SearchableSelect";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Clock,
  ArrowUpCircle,
  CheckCircle2,
  GitCompareArrows,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast-service";
import { AgentDiffViewer } from "./AgentDiffViewer";
import { VersionHistoryTimeline } from "./VersionHistoryTimeline";
import { VersionIdBadge } from "./VersionIdBadge";

interface AgentVersionDiffPageProps {
  agentId: string;
  initialVersion?: number;
}

export function AgentVersionDiffPage({
  agentId,
  initialVersion,
}: AgentVersionDiffPageProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [versions, setVersions] = useState<AgentVersionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Left side (the version being inspected)
  const [leftVersion, setLeftVersion] = useState<number | null>(
    initialVersion ?? null,
  );
  // Right side (defaults to "current", can be overridden)
  const [rightVersion, setRightVersion] = useState<"current" | number>(
    "current",
  );
  const [rightSnapshotLoading, setRightSnapshotLoading] = useState(false);

  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [showPromoteDialog, setShowPromoteDialog] = useState(false);
  const initialTabParam = searchParams?.get("tab");
  const [activeTab, setActiveTab] = useState<"compare" | "history">(
    initialTabParam === "history" ? "history" : "compare",
  );

  // Sync activeTab → URL (?tab=history, or remove for compare)
  useEffect(() => {
    if (!pathname) return;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    const current = params.get("tab");
    if (activeTab === "history" && current !== "history") {
      params.set("tab", "history");
    } else if (activeTab === "compare" && current === "history") {
      params.delete("tab");
    } else {
      return;
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const liveAgent = useAppSelector((state) => selectAgentById(state, agentId));
  const snapshotRecords = useAppSelector((state) =>
    selectVersionsByParentAgentId(state, agentId),
  );

  const leftSnapshot = leftVersion
    ? snapshotRecords.find((r) => r.version === leftVersion)
    : null;

  const rightAgent =
    rightVersion === "current"
      ? liveAgent
      : (snapshotRecords.find((r) => r.version === rightVersion) ?? null);

  // Fetch version history on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    dispatch(fetchAgentVersionHistory({ agentId, limit: 100 }))
      .unwrap()
      .then((data) => {
        if (!cancelled) {
          setVersions(data);
          if (!leftVersion && data.length > 0) {
            if (initialVersion) {
              setLeftVersion(initialVersion);
            } else {
              // The newest version in history mirrors current, so pick the second one
              // (first version that differs from the live agent's version number)
              const currentVer = liveAgent?.version;
              const bestDefault =
                currentVer != null
                  ? data.find((v) => v.version_number !== currentVer)
                  : data.length > 1
                    ? data[1]
                    : data[0];
              setLeftVersion(
                bestDefault?.version_number ?? data[0].version_number,
              );
            }
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? "Failed to load versions");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  // Fetch left snapshot when selected
  useEffect(() => {
    if (!leftVersion) return;
    if (snapshotRecords.some((r) => r.version === leftVersion)) return;
    setSnapshotLoading(true);
    dispatch(fetchAgentVersionSnapshot({ agentId, version: leftVersion }))
      .unwrap()
      .finally(() => setSnapshotLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftVersion, agentId]);

  // Fetch right snapshot when overridden to a specific version
  useEffect(() => {
    if (rightVersion === "current") return;
    if (snapshotRecords.some((r) => r.version === rightVersion)) return;
    setRightSnapshotLoading(true);
    dispatch(fetchAgentVersionSnapshot({ agentId, version: rightVersion }))
      .unwrap()
      .finally(() => setRightSnapshotLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightVersion, agentId]);

  const handlePromote = async () => {
    if (!leftVersion) return;
    setPromoting(true);
    try {
      const result = await dispatch(
        promoteAgentVersion({ agentId, version: leftVersion }),
      ).unwrap();
      if (result.success) {
        toast.success(`Promoted v${leftVersion} to current`);
      } else {
        toast.error(result.error ?? "Failed to promote version");
      }
    } catch {
      toast.error("Failed to promote version");
    } finally {
      setPromoting(false);
      setShowPromoteDialog(false);
    }
  };

  // Build version options for SearchableSelect
  const leftVersionOptions: Option[] = versions.map((v) => ({
    value: v.version_number.toString(),
    label: `v${v.version_number}${v.change_note ? ` — ${v.change_note}` : ""}`,
  }));

  const rightVersionOptions: Option[] = [
    {
      value: "current",
      label: `Current Version${liveAgent?.version != null ? ` (v${liveAgent.version})` : ""}`,
    },
    ...versions.map((v) => ({
      value: v.version_number.toString(),
      label: `v${v.version_number}${v.change_note ? ` — ${v.change_note}` : ""}`,
    })),
  ];

  const handleLeftVersionChange = (opt: Option) => {
    startTransition(() => setLeftVersion(parseInt(opt.value, 10)));
  };

  const handleRightVersionChange = (opt: Option) => {
    startTransition(() => {
      if (opt.value === "current") {
        setRightVersion("current");
      } else {
        setRightVersion(parseInt(opt.value, 10));
      }
    });
  };

  // Navigate to a diff from the history timeline
  const handleHistoryCompare = (
    version: number,
    compareToVersion: number | "current",
  ) => {
    setLeftVersion(version);
    setRightVersion(compareToVersion);
    setActiveTab("compare");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="text-sm">Loading version history...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-destructive text-sm">
        {error}
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No version history found for this agent.
      </div>
    );
  }

  const selectedVersionItem = versions.find(
    (v) => v.version_number === leftVersion,
  );

  const leftLabel = leftSnapshot
    ? `Version ${leftSnapshot.version}`
    : "Select a version";
  const rightLabel =
    rightVersion === "current"
      ? `Current Version${liveAgent?.version != null ? ` (v${liveAgent.version})` : ""}`
      : `Version ${rightVersion}`;

  const isAnyLoading = snapshotLoading || rightSnapshotLoading;

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "compare" | "history")}
        className="flex flex-col h-full"
      >
        {/* Toolbar */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-border bg-card/50">
          <TabsList className="h-7 p-0.5 bg-muted/50">
            <TabsTrigger
              value="compare"
              className="h-6 px-2 text-xs gap-1 data-[state=active]:bg-background"
            >
              <GitCompareArrows className="w-3 h-3" />
              Compare
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="h-6 px-2 text-xs gap-1 data-[state=active]:bg-background"
            >
              <History className="w-3 h-3" />
              History
            </TabsTrigger>
          </TabsList>

          {activeTab === "compare" && (
            <>
              <div className="w-[220px]">
                <SearchableSelect
                  options={leftVersionOptions}
                  value={leftVersion?.toString() ?? undefined}
                  onChange={handleLeftVersionChange}
                  placeholder="Select version..."
                  searchPlaceholder="Search versions..."
                />
              </div>
              <span className="text-xs text-muted-foreground">vs</span>
              <div className="w-[260px]">
                <SearchableSelect
                  options={rightVersionOptions}
                  value={rightVersion.toString()}
                  onChange={handleRightVersionChange}
                  placeholder="Compare to..."
                  searchPlaceholder="Search versions..."
                />
              </div>

              {selectedVersionItem && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    {new Date(selectedVersionItem.changed_at).toLocaleString()}
                  </div>
                  <VersionIdBadge versionId={selectedVersionItem.version_id} />
                </div>
              )}

              <div className="flex-1" />

              {liveAgent?.version != null &&
                leftVersion != null &&
                leftVersion !== liveAgent.version && (
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-1.5 h-8"
                    onClick={() => setShowPromoteDialog(true)}
                    disabled={promoting}
                  >
                    {promoting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ArrowUpCircle className="w-3.5 h-3.5" />
                    )}
                    Promote v{leftVersion}
                  </Button>
                )}

              {liveAgent?.version != null &&
                leftVersion === liveAgent.version && (
                  <Badge
                    variant="secondary"
                    className="gap-1 text-xs text-emerald-600 dark:text-emerald-400"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Current Version
                  </Badge>
                )}
            </>
          )}
        </div>

        {/* Compare tab */}
        <TabsContent value="compare" className="flex-1 overflow-hidden mt-0">
          {isAnyLoading ? (
            <div className="flex-1 p-4 space-y-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : leftSnapshot && rightAgent ? (
            <AgentDiffViewer
              oldAgent={leftSnapshot}
              newAgent={rightAgent}
              oldLabel={leftLabel}
              newLabel={rightLabel}
              className="h-full"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Select a version to see differences
            </div>
          )}
        </TabsContent>

        {/* History tab */}
        <TabsContent value="history" className="flex-1 overflow-y-auto mt-0">
          <VersionHistoryTimeline
            agentId={agentId}
            versions={versions}
            currentVersion={liveAgent?.version ?? null}
            onCompare={handleHistoryCompare}
          />
        </TabsContent>
      </Tabs>

      <AlertDialog open={showPromoteDialog} onOpenChange={setShowPromoteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Promote Version</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the current agent configuration with the content
              from v{leftVersion}. The current configuration will be saved as a
              new version in the history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={promoting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePromote} disabled={promoting}>
              {promoting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Promote v{leftVersion}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
