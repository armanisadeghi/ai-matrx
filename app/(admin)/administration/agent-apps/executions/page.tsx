"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Eye,
  Filter,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import {
  fetchAgentAppErrors,
  fetchAgentAppExecutions,
  resolveAgentAppError,
  unresolveAgentAppError,
  type AgentAppErrorRow,
  type AgentAppExecutionRow,
} from "@/lib/services/agent-apps-admin-service";

const ERROR_TYPE_LABELS: Record<string, string> = {
  missing_variable: "Missing Variable",
  extra_variable: "Extra Variable",
  invalid_variable_type: "Invalid Variable Type",
  component_render_error: "Component Render Error",
  api_error: "API Error",
  rate_limit: "Rate Limit",
  other: "Other",
};

export default function AgentAppsExecutionsAdminPage() {
  return (
    <TooltipProvider>
      <div className="flex flex-col h-full bg-textured">
        <div className="flex-shrink-0 p-4 border-b border-border bg-card">
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Executions & Errors
          </h1>
          <p className="text-xs text-muted-foreground">
            Recent runs across every agent app and any errors they surfaced.
          </p>
        </div>
        <Tabs
          defaultValue="executions"
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div className="border-b border-border px-4 bg-card">
            <TabsList className="bg-transparent h-auto p-0 gap-1">
              <TabsTrigger
                value="executions"
                className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <Activity className="w-4 h-4" />
                Executions
              </TabsTrigger>
              <TabsTrigger
                value="errors"
                className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <AlertCircle className="w-4 h-4" />
                Errors
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="flex-1 overflow-hidden">
            <TabsContent
              value="executions"
              className="h-full m-0 data-[state=active]:flex data-[state=active]:flex-col"
            >
              <ExecutionsTable />
            </TabsContent>
            <TabsContent
              value="errors"
              className="h-full m-0 data-[state=active]:flex data-[state=active]:flex-col"
            >
              <ErrorsTable />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}

function ExecutionsTable() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AgentAppExecutionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [appFilter, setAppFilter] = useState("");
  const [successFilter, setSuccessFilter] = useState<
    "all" | "success" | "failed"
  >("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const successVal =
        successFilter === "all" ? undefined : successFilter === "success";
      const data = await fetchAgentAppExecutions({
        success: successVal,
        limit: 500,
      });
      setRows(data);
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to load executions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [successFilter, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!appFilter) return rows;
    const q = appFilter.toLowerCase();
    return rows.filter(
      (r) =>
        r.app_name?.toLowerCase().includes(q) ||
        r.app_slug?.toLowerCase().includes(q),
    );
  }, [rows, appFilter]);

  const stats = useMemo(() => {
    const total = rows.length;
    const success = rows.filter((r) => r.success).length;
    const failed = total - success;
    return { total, success, failed };
  }, [rows]);

  if (loading && rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <MatrxMiniLoader />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-shrink-0 p-4 border-b border-border bg-card space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="grid grid-cols-3 gap-3 min-w-[300px]">
              <Card>
                <CardContent className="p-2">
                  <div className="text-xl font-bold">{stats.total}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-2">
                  <div className="text-xl font-bold text-success">
                    {stats.success}
                  </div>
                  <div className="text-xs text-muted-foreground">Success</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-2">
                  <div className="text-xl font-bold text-destructive">
                    {stats.failed}
                  </div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </CardContent>
              </Card>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Filter by app..."
              value={appFilter}
              onChange={(e) => setAppFilter(e.target.value)}
              className="h-8 text-xs max-w-[240px]"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="h-3.5 w-3.5 mr-1" />
                  {successFilter === "all"
                    ? "All"
                    : successFilter === "success"
                      ? "Success"
                      : "Failed"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Filter by Outcome</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={successFilter === "all"}
                  onCheckedChange={() => setSuccessFilter("all")}
                >
                  All
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={successFilter === "success"}
                  onCheckedChange={() => setSuccessFilter("success")}
                >
                  Success only
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={successFilter === "failed"}
                  onCheckedChange={() => setSuccessFilter("failed")}
                >
                  Failed only
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="w-24">Status</TableHead>
              <TableHead>App</TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Identifier</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Time</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  {r.success ? (
                    <Badge
                      variant="outline"
                      className="text-success border-success/40"
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      OK
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <XCircle className="w-3 h-3 mr-1" />
                      Fail
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{r.app_name ?? "—"}</span>
                    {r.app_slug && (
                      <a
                        href={`/p/${r.app_slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground truncate max-w-[160px]">
                  {r.task_id}
                </TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground truncate max-w-[160px]">
                  {r.user_id ? `user:${r.user_id.slice(0, 8)}` : ""}
                  {r.fingerprint
                    ? `fp:${r.fingerprint.slice(0, 8)}`
                    : ""}
                  {r.ip_address ?? ""}
                </TableCell>
                <TableCell className="text-right">
                  {r.tokens_used?.toLocaleString() ?? 0}
                </TableCell>
                <TableCell className="text-right">
                  ${r.cost?.toFixed(4) ?? "0.0000"}
                </TableCell>
                <TableCell className="text-right">
                  {r.execution_time_ms
                    ? `${r.execution_time_ms.toLocaleString()}ms`
                    : "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 && !loading && (
          <div className="text-center py-12 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
            No executions match your filter.
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function ErrorsTable() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AgentAppErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvedFilter, setResolvedFilter] = useState<
    "all" | "resolved" | "unresolved"
  >("unresolved");
  const [appFilter, setAppFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<AgentAppErrorRow | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r =
        resolvedFilter === "all"
          ? undefined
          : resolvedFilter === "resolved";
      const data = await fetchAgentAppErrors({ resolved: r, limit: 500 });
      setRows(data);
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to load errors",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [resolvedFilter, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const uniqueTypes = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.error_type && s.add(r.error_type));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let f = [...rows];
    if (typeFilter.size > 0)
      f = f.filter((r) => r.error_type && typeFilter.has(r.error_type));
    if (appFilter) {
      const q = appFilter.toLowerCase();
      f = f.filter(
        (r) =>
          r.app_name?.toLowerCase().includes(q) ||
          r.app_slug?.toLowerCase().includes(q),
      );
    }
    return f;
  }, [rows, typeFilter, appFilter]);

  const stats = useMemo(() => {
    const total = rows.length;
    const resolved = rows.filter((r) => r.resolved).length;
    const unresolved = total - resolved;
    return { total, resolved, unresolved };
  }, [rows]);

  const handleOpen = (row: AgentAppErrorRow) => {
    setSelected(row);
    setResolutionNotes(row.resolution_notes ?? "");
  };

  const handleResolve = async () => {
    if (!selected) return;
    try {
      await resolveAgentAppError({
        id: selected.id,
        resolution_notes: resolutionNotes,
      });
      setSelected(null);
      await load();
      toast({ title: "Resolved", description: "Error marked resolved" });
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to resolve error",
        variant: "destructive",
      });
    }
  };

  const handleUnresolve = async () => {
    if (!selected) return;
    try {
      await unresolveAgentAppError(selected.id);
      setSelected(null);
      await load();
      toast({ title: "Unresolved", description: "Error re-opened" });
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to unresolve error",
        variant: "destructive",
      });
    }
  };

  if (loading && rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <MatrxMiniLoader />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-shrink-0 p-4 border-b border-border bg-card space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="grid grid-cols-3 gap-3 min-w-[300px]">
            <Card>
              <CardContent className="p-2">
                <div className="text-xl font-bold">{stats.total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-2">
                <div className="text-xl font-bold text-destructive">
                  {stats.unresolved}
                </div>
                <div className="text-xs text-muted-foreground">Unresolved</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-2">
                <div className="text-xl font-bold text-success">
                  {stats.resolved}
                </div>
                <div className="text-xs text-muted-foreground">Resolved</div>
              </CardContent>
            </Card>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              placeholder="Filter by app..."
              value={appFilter}
              onChange={(e) => setAppFilter(e.target.value)}
              className="h-8 text-xs max-w-[240px]"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="h-3.5 w-3.5 mr-1" />
                  Types
                  {typeFilter.size > 0 && (
                    <Badge variant="secondary" className="ml-1 h-4 px-1">
                      {typeFilter.size}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="flex items-center justify-between">
                  <span>Filter by Type</span>
                  {typeFilter.size > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-2 text-xs"
                      onClick={() => setTypeFilter(new Set())}
                    >
                      Clear
                    </Button>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {uniqueTypes.map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t}
                    checked={typeFilter.has(t)}
                    onCheckedChange={() => {
                      const next = new Set(typeFilter);
                      if (next.has(t)) next.delete(t);
                      else next.add(t);
                      setTypeFilter(next);
                    }}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {ERROR_TYPE_LABELS[t] ?? t}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="h-3.5 w-3.5 mr-1" />
                  {resolvedFilter === "all"
                    ? "All"
                    : resolvedFilter === "resolved"
                      ? "Resolved"
                      : "Unresolved"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={resolvedFilter === "all"}
                  onCheckedChange={() => setResolvedFilter("all")}
                >
                  All
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={resolvedFilter === "unresolved"}
                  onCheckedChange={() => setResolvedFilter("unresolved")}
                >
                  Unresolved
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={resolvedFilter === "resolved"}
                  onCheckedChange={() => setResolvedFilter("resolved")}
                >
                  Resolved
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-40">Type</TableHead>
              <TableHead>App</TableHead>
              <TableHead>Message</TableHead>
              <TableHead className="w-40">When</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer hover:bg-accent/40"
                onClick={() => handleOpen(r)}
              >
                <TableCell>
                  {r.resolved ? (
                    <Badge
                      variant="outline"
                      className="text-success border-success/40"
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Resolved
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Open
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {ERROR_TYPE_LABELS[r.error_type] ?? r.error_type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{r.app_name ?? "—"}</span>
                    {r.app_slug && (
                      <a
                        href={`/p/${r.app_slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-md">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-sm truncate">
                        {r.error_message ?? "No error message"}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-md">
                      {r.error_message ?? "No error message"}
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpen(r);
                    }}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 && !loading && (
          <div className="text-center py-12 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
            No errors to review.
          </div>
        )}
      </ScrollArea>

      <Dialog
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
      >
        <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selected?.resolved ? (
                <CheckCircle className="w-5 h-5 text-success" />
              ) : (
                <AlertCircle className="w-5 h-5 text-destructive" />
              )}
              Error Details
            </DialogTitle>
            <DialogDescription>
              Review and manage this error
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div>
                <Label>Error Type</Label>
                <div className="mt-1">
                  <Badge variant="outline">
                    {ERROR_TYPE_LABELS[selected.error_type] ??
                      selected.error_type}
                  </Badge>
                </div>
              </div>
              <div>
                <Label>Message</Label>
                <p className="mt-1 text-sm">
                  {selected.error_message ?? "No error message"}
                </p>
              </div>
              {selected.error_code && (
                <div>
                  <Label>Error Code</Label>
                  <code className="block mt-1 px-2 py-1 bg-muted rounded text-sm">
                    {selected.error_code}
                  </code>
                </div>
              )}
              <div>
                <Label>App</Label>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-sm">{selected.app_name}</span>
                  {selected.app_slug && (
                    <a
                      href={`/p/${selected.app_slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
              <div>
                <Label>Variables Sent</Label>
                <pre className="mt-1 p-3 bg-muted rounded text-xs overflow-x-auto">
                  {JSON.stringify(selected.variables_sent, null, 2)}
                </pre>
              </div>
              <div>
                <Label>Expected Variables</Label>
                <pre className="mt-1 p-3 bg-muted rounded text-xs overflow-x-auto">
                  {JSON.stringify(selected.expected_variables, null, 2)}
                </pre>
              </div>
              {Object.keys(selected.error_details ?? {}).length > 0 && (
                <div>
                  <Label>Error Details</Label>
                  <pre className="mt-1 p-3 bg-muted rounded text-xs overflow-x-auto">
                    {JSON.stringify(selected.error_details, null, 2)}
                  </pre>
                </div>
              )}
              <div>
                <Label>Created At</Label>
                <p className="mt-1 text-sm">
                  {new Date(selected.created_at).toLocaleString()}
                </p>
              </div>
              {!selected.resolved && (
                <div>
                  <Label htmlFor="resolution-notes">Resolution Notes</Label>
                  <Textarea
                    id="resolution-notes"
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Add notes about how this was resolved..."
                    rows={4}
                    className="mt-1 text-[16px]"
                  />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setSelected(null)}>
                  Close
                </Button>
                {selected.resolved ? (
                  <Button variant="outline" onClick={handleUnresolve}>
                    <XCircle className="w-4 h-4 mr-1" />
                    Mark Unresolved
                  </Button>
                ) : (
                  <Button onClick={handleResolve}>
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Mark Resolved
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
