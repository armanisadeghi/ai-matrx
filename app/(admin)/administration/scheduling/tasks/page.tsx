// app/(authenticated)/(admin-auth)/administration/scheduling/tasks/page.tsx

"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchAllTasksAdmin,
  type AdminTaskRow,
} from "@/lib/services/scheduling-admin-service";
import { humanizeRelative, humanizeTrigger } from "@/features/scheduling/utils/triggerHumanize";

export default function AdminTasksPage() {
  const [rows, setRows] = useState<AdminTaskRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [enabledFilter, setEnabledFilter] = useState<"any" | "enabled" | "disabled">("any");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllTasksAdmin({
        search: search.trim() || undefined,
        enabled:
          enabledFilter === "any"
            ? null
            : enabledFilter === "enabled"
              ? true
              : false,
        limit: 200,
      });
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">All tasks</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => load()}
          disabled={loading}
        >
          <RefreshCw
            className={loading ? "h-3.5 w-3.5 mr-1.5 animate-spin" : "h-3.5 w-3.5 mr-1.5"}
          />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Search title…"
            className="pl-7 h-8 w-64"
          />
        </div>
        <Select
          value={enabledFilter}
          onValueChange={(v) =>
            setEnabledFilter(v as "any" | "enabled" | "disabled")
          }
        >
          <SelectTrigger className="w-36 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any state</SelectItem>
            <SelectItem value="enabled">Enabled</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => load()}>
          Apply
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!rows ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No tasks match.
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Title</th>
                <th className="text-left px-3 py-2">Owner</th>
                <th className="text-left px-3 py-2">Trigger</th>
                <th className="text-left px-3 py-2">Next</th>
                <th className="text-left px-3 py-2">Updated</th>
                <th className="text-left px-3 py-2">State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-border hover:bg-accent/20"
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.title}</div>
                    {r.description && (
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {r.description}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.user_email ?? r.user_id.slice(0, 8)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.trigger
                      ? humanizeTrigger(
                          r.trigger.type,
                          r.trigger.config as Record<string, unknown>,
                        )
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {humanizeRelative(r.next_due_at)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {humanizeRelative(r.updated_at)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={r.enabled ? "secondary" : "outline"}
                      className="text-[10px]"
                    >
                      {r.enabled ? "Enabled" : "Paused"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
