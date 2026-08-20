"use client";

// Feature Registry admin — /administration/utilities/taxonomy.
// Reads/writes platform.taxonomy_node via the super-admin RPCs. Two views:
// Tree (working CRUD) and Map (the platform at a glance). Doctrine:
// common-docs/policies/feature-registry.md — the DATABASE is the source of truth.

import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid, ListTree, Plus, RefreshCw, Search } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import NodeDialog, { type NodeDialogState } from "./NodeDialog";
import TaxonomyMap from "./TaxonomyMap";
import TaxonomyTree from "./TaxonomyTree";
import {
  buildTree,
  type TaxonomyRow,
  type TaxonomyStatus,
  type TaxonomyTreeNode,
} from "./types";

export default function TaxonomyAdminClient() {
  const { toast } = useToast();
  const [rows, setRows] = useState<TaxonomyRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<"tree" | "map">("tree");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaxonomyStatus | "all">("all");
  const [dialog, setDialog] = useState<NodeDialogState | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_taxonomy_list");
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setRows((data ?? []) as unknown as TaxonomyRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tree = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    const matches = (node: TaxonomyRow) =>
      (statusFilter === "all" || node.status === statusFilter) &&
      (q === "" ||
        node.slug.includes(q) ||
        node.name.toLowerCase().includes(q) ||
        (node.notes ?? "").toLowerCase().includes(q));
    const full = buildTree(rows);
    if (q === "" && statusFilter === "all") return full;
    // Keep a node when it matches or any descendant matches.
    const prune = (nodes: TaxonomyTreeNode[]): TaxonomyTreeNode[] =>
      nodes
        .map((node) => ({ ...node, children: prune(node.children) }))
        .filter((node) => matches(node) || node.children.length > 0);
    return prune(full);
  }, [rows, query, statusFilter]);

  const counts = useMemo(() => {
    if (!rows) return null;
    const by = (level: string) => rows.filter((r) => r.level === level);
    return {
      domains: by("domain").length,
      features: by("feature").length,
      subfeatures: by("subfeature").length,
      proposed: rows.filter((r) => r.status === "proposed").length,
      canonical: rows.filter((r) => r.status === "canonical").length,
    };
  }, [rows]);

  const handleDelete = async (node: TaxonomyTreeNode) => {
    if (!window.confirm(`Delete ${node.level} "${node.name}" (${node.slug})?`)) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_taxonomy_delete", { p_id: node.id });
    if (error) {
      toast({ title: "Delete refused", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Deleted ${node.slug}` });
    void load();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Feature Registry</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            The platform taxonomy — Domain, Feature, Sub-feature — live from{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              platform.taxonomy_node
            </code>
            {counts && (
              <>
                {" · "}
                {counts.domains} domains · {counts.features} features ·{" "}
                {counts.subfeatures} sub-features · {counts.canonical} canonical ·{" "}
                {counts.proposed} proposed
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" title="Refresh" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            onClick={() => setDialog({ mode: "create", level: "domain", parentId: null })}
          >
            <Plus className="mr-1.5 h-4 w-4" /> New domain
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={view} onValueChange={(v) => setView(v as "tree" | "map")}>
          <TabsList>
            <TabsTrigger value="tree">
              <ListTree className="mr-1.5 h-4 w-4" /> Tree
            </TabsTrigger>
            <TabsTrigger value="map">
              <LayoutGrid className="mr-1.5 h-4 w-4" /> Map
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search nodes…"
            className="w-56 pl-8"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as TaxonomyStatus | "all")}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="canonical">Canonical</SelectItem>
            <SelectItem value="proposed">Proposed</SelectItem>
            <SelectItem value="legacy">Legacy</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loadError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load the registry: {loadError}
        </div>
      )}
      {!rows && !loadError && (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
      {rows &&
        (view === "tree" ? (
          <TaxonomyTree nodes={tree} onOpenDialog={setDialog} onDelete={handleDelete} />
        ) : (
          <TaxonomyMap nodes={tree} onOpenDialog={setDialog} />
        ))}

      <NodeDialog
        state={dialog}
        rows={rows ?? []}
        onClose={() => setDialog(null)}
        onSaved={() => void load()}
      />
    </div>
  );
}
