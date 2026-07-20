"use client";

// features/admin/relationships/components/ReachabilityInspectorClient.tsx
//
// The "why can they see this?" debugger — its own tab on the Relationships
// hub. Self-fetching via the admin_reachability_* SECURITY DEFINER RPCs
// (super-admin re-checked in the DB); no server props needed.

import { useMemo, useState } from "react";
import { Layers, RefreshCw, Search } from "lucide-react";
import { toast } from "@/lib/toast";

import { createClient } from "@/utils/supabase/client";
import { EntityTypeChip } from "@/components/entity-types/EntityTypeChip";
import { EntityTypeCombobox } from "@/components/entity-types/EntityTypeCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConveyPill } from "./shared";
import type { ReachabilityContainer, ReachabilityContent } from "../types";

export function ReachabilityInspectorClient() {
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<"contents" | "containers">("contents");
  const [entityType, setEntityType] = useState<string>("thread");
  const [entityId, setEntityId] = useState("");
  const [loading, setLoading] = useState(false);
  const [contents, setContents] = useState<ReachabilityContent[] | null>(null);
  const [containers, setContainers] = useState<ReachabilityContainer[] | null>(
    null,
  );

  async function lookup() {
    const id = entityId.trim();
    if (!id) {
      toast.error("Enter an entity UUID");
      return;
    }
    if (!entityType) {
      toast.error("Pick an entity type");
      return;
    }
    setLoading(true);
    setContents(null);
    setContainers(null);
    try {
      if (mode === "contents") {
        const { data, error } = await supabase.rpc(
          "admin_reachability_contents",
          { p_type: entityType, p_id: id },
        );
        if (error) throw error;
        setContents(data ?? []);
      } else {
        const { data, error } = await supabase.rpc(
          "admin_reachability_containers",
          { p_type: entityType, p_id: id },
        );
        if (error) throw error;
        setContainers(data ?? []);
      }
    } catch (e) {
      toast.error(
        `Lookup failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setLoading(false);
    }
  }

  const rows = mode === "contents" ? contents : containers;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Layers className="h-4 w-4" />
        Reachability inspector
        <span className="font-normal text-muted-foreground">
          — the &ldquo;why can they see this?&rdquo; debugger
        </span>
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
          <SelectTrigger className="h-8 w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="contents">
              What does this container reach?
            </SelectItem>
            <SelectItem value="containers">
              Which containers convey access to this item?
            </SelectItem>
          </SelectContent>
        </Select>
        <EntityTypeCombobox
          value={entityType || null}
          onChange={(t) => setEntityType(t)}
          placeholder="entity type…"
          className="w-52"
        />
        <Input
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          placeholder="entity UUID"
          className="h-8 w-80 font-mono text-xs"
        />
        <Button size="sm" disabled={loading} onClick={() => void lookup()}>
          {loading ? (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="mr-1.5 h-3.5 w-3.5" />
          )}
          Look up
        </Button>
      </div>

      {rows !== null ? (
        rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {mode === "contents"
              ? "This container reaches nothing."
              : "No container conveys access to this item."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {mode === "contents" ? "Item" : "Container"}
                  </TableHead>
                  <TableHead className="w-96">ID</TableHead>
                  <TableHead className="w-20">Depth</TableHead>
                  <TableHead className="w-24">Max level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const type =
                    "item_type" in row ? row.item_type : row.container_type;
                  const id = "item_id" in row ? row.item_id : row.container_id;
                  return (
                    <TableRow key={`${type}:${id}`}>
                      <TableCell>
                        <EntityTypeChip token={type} showToken />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{id}</TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {row.depth}
                      </TableCell>
                      <TableCell>
                        <ConveyPill level={row.max_level} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )
      ) : null}
    </section>
  );
}
