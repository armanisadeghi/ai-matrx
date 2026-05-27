"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Package,
  Plus,
  Search,
  X,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "sonner";
import {
  listBundles,
  listBundleMembers,
  updateBundle,
  setBundleMemberAlias,
  addBundleMember,
  removeBundleMember,
  searchToolsForBundle,
  createBundleWithLister,
  type BundleRow,
  type BundleMemberWithTool,
} from "@/features/tool-registry/bundles/services/bundles.service";

type Filter = "active" | "all";

export function BundlesAdminPage() {
  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const loadList = async () => {
    setLoading(true);
    setError(null);
    try {
      setBundles(await listBundles({ includeInactive: filter === "all" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load bundles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadList();
  }, [filter]);

  const filtered = (() => {
    if (!search.trim()) return bundles;
    const q = search.trim().toLowerCase();
    return bundles.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.description ?? "").toLowerCase().includes(q),
    );
  })();

  const selected = bundles.find((b) => b.id === selectedId) ?? null;

  return (
    <div className="min-h-dvh flex flex-col">
      <div className="flex-shrink-0 px-6 py-3 border-b border-border flex items-center gap-3 bg-background">
        <Package className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-medium">Tool Registry · Bundles</h1>
        <Badge variant="outline" className="text-[10px]">
          {bundles.length}
        </Badge>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void loadList()}
          className="h-7 ml-auto gap-1.5 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
        <Button
          size="sm"
          onClick={() => setCreating(true)}
          className="h-7 gap-1.5 text-xs"
          title="Create a new bundle (auto-creates its lister tool)"
        >
          <Plus className="h-3.5 w-3.5" />
          New bundle
        </Button>
      </div>
      <div className="flex-1 grid grid-cols-1 md:grid-cols-[340px_1fr] gap-0 min-h-0">
        {/* List sidebar */}
        <aside className="border-r border-border bg-card flex flex-col">
          <div className="p-3 space-y-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search bundles…"
                className="pl-7 h-8 text-xs"
                style={{ fontSize: "16px" }}
              />
            </div>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant={filter === "active" ? "default" : "ghost"}
                onClick={() => setFilter("active")}
                className="h-7 text-xs flex-1"
              >
                Active
              </Button>
              <Button
                size="sm"
                variant={filter === "all" ? "default" : "ghost"}
                onClick={() => setFilter("all")}
                className="h-7 text-xs flex-1"
              >
                All
              </Button>
            </div>
          </div>
          {error && (
            <div className="m-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </div>
          )}
          <div className="flex-1 overflow-auto">
            {filtered.length === 0 && !loading && (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                No bundles match.
              </div>
            )}
            <ul>
              {filtered.map((b) => {
                const isSel = b.id === selectedId;
                return (
                  <li key={b.id}>
                    <button
                      onClick={() => setSelectedId(b.id)}
                      className={`w-full text-left px-3 py-2 border-b border-border/50 hover:bg-muted/40 transition-colors ${isSel ? "bg-muted" : ""} ${b.is_active ? "" : "opacity-60"}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs truncate">{b.name}</span>
                        <Badge
                          variant={b.is_system ? "default" : "secondary"}
                          className="text-[10px] flex-shrink-0"
                        >
                          {b.is_system ? "system" : "personal"}
                        </Badge>
                      </div>
                      {b.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {b.description}
                        </p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
        {/* Detail panel */}
        <div className="overflow-auto">
          {selected ? (
            <BundleDetail
              key={selected.id}
              bundle={selected}
              onChanged={() => void loadList()}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground p-12">
              {filtered.length === 0
                ? "No bundles to show."
                : "Pick a bundle from the list."}
            </div>
          )}
        </div>
      </div>
      {creating && (
        <NewBundleDialog
          existingNames={new Set(bundles.map((b) => b.name))}
          onClose={() => setCreating(false)}
          onCreated={(newId) => {
            setCreating(false);
            void loadList().then(() => setSelectedId(newId));
          }}
        />
      )}
    </div>
  );
}

// ─── New bundle dialog ───────────────────────────────────────────────────────

function NewBundleDialog({
  existingNames,
  onClose,
  onCreated,
}: {
  existingNames: Set<string>;
  onClose: () => void;
  onCreated: (bundleId: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSystem, setIsSystem] = useState(false);
  const [busy, setBusy] = useState(false);

  const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;
  const nameValid = NAME_RE.test(name);
  const nameClash = existingNames.has(name);
  const listerName = name ? `bundle:list_${name}` : "bundle:list_<name>";

  const submit = async () => {
    if (!nameValid || nameClash) return;
    setBusy(true);
    try {
      const result = await createBundleWithLister({
        name,
        description,
        isSystem,
      });
      // The 2026 refactor simplified create_bundle_with_lister to return only
      // the new bundle id; we already know the bundle name from the form, and
      // the lister tool is only created if a name was passed (we don't pass
      // one here, so no lister is auto-created — that's an explicit step).
      toast.success(`Bundle ${name} created`);
      onCreated(result.bundle_id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New bundle</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Bundle name (globally unique)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              placeholder="e.g. browser-tools, search-pack, my-favorites"
              className="font-mono text-sm h-9"
              style={{ fontSize: "16px" }}
              disabled={busy}
              autoFocus
            />
            {!nameValid && name.length > 0 && (
              <p className="text-[11px] text-destructive">
                Lowercase letters / digits / hyphens / underscores. Must start with a letter or digit.
              </p>
            )}
            {nameClash && (
              <p className="text-[11px] text-destructive">
                <code className="font-mono">{name}</code> already exists.
              </p>
            )}
            {nameValid && !nameClash && (
              <p className="text-[11px] text-muted-foreground">
                Lister will be auto-created as{" "}
                <code className="bg-muted px-1 py-0.5 rounded font-mono">{listerName}</code>
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What does this bundle group together? Shown to admins and in the picker."
              style={{ fontSize: "16px" }}
              disabled={busy}
            />
          </div>
          <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3">
            <Switch
              checked={isSystem}
              onCheckedChange={setIsSystem}
              disabled={busy}
            />
            <div className="space-y-0.5">
              <Label className="text-xs">System bundle</Label>
              <p className="text-[11px] text-muted-foreground">
                {isSystem
                  ? "Visible to all users; not tied to a creator. Use for vendor / company-wide bundles."
                  : "Personal bundle owned by you. Only you (and explicit shares) see it."}
              </p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Members can be added after creation from the bundle's detail panel.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy || !nameValid || nameClash}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create bundle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail ──────────────────────────────────────────────────────────────────

function BundleDetail({
  bundle,
  onChanged,
}: {
  bundle: BundleRow;
  onChanged: () => void;
}) {
  const [members, setMembers] = useState<BundleMemberWithTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(bundle.name);
  const [description, setDescription] = useState(bundle.description);
  const [isActive, setIsActive] = useState(bundle.is_active);
  const [metadataJson, setMetadataJson] = useState(JSON.stringify(bundle.metadata ?? {}, null, 2));
  const [savingMeta, setSavingMeta] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setMembers(await listBundleMembers(bundle.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [bundle.id]);

  const onSaveMeta = async () => {
    let metadata: Record<string, unknown>;
    try {
      metadata = JSON.parse(metadataJson || "{}");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid metadata JSON");
      return;
    }
    setSavingMeta(true);
    try {
      await updateBundle(bundle.id, {
        name,
        description,
        is_active: isActive,
        metadata: metadata as never,
      });
      toast.success("Bundle saved");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingMeta(false);
    }
  };

  const onSaveAlias = async (toolId: string, alias: string) => {
    try {
      await setBundleMemberAlias(bundle.id, toolId, alias);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Alias save failed");
    }
  };

  const onRemove = async (m: BundleMemberWithTool) => {
    const ok = await confirm({
      title: `Remove ${m.tool?.name ?? "tool"} from bundle?`,
      description:
        "Agents loading this bundle will no longer see this tool under its alias.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await removeBundleMember(bundle.id, m.member.tool_id);
      await load();
      toast.success("Removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remove failed");
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Identity */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Identity</h2>
          <Button size="sm" onClick={() => void onSaveMeta()} disabled={savingMeta}>
            {savingMeta ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Name (globally unique)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="font-mono text-sm h-8"
              style={{ fontSize: "16px" }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Active</Label>
            <div className="flex items-center h-8">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            style={{ fontSize: "16px" }}
          />
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span>
            Type:{" "}
            <Badge variant={bundle.is_system ? "default" : "secondary"} className="text-[10px]">
              {bundle.is_system ? "system" : "personal"}
            </Badge>
          </span>
          {bundle.lister_tool_id && (
            <span className="font-mono">
              Lister tool ID: <code className="bg-muted px-1 py-0.5 rounded">{bundle.lister_tool_id}</code>
            </span>
          )}
          {!bundle.lister_tool_id && (
            <span>
              No lister assigned —{" "}
              <em>create a tool named <code className="bg-muted px-1 py-0.5 rounded">bundle:list_{bundle.name}</code> and link it via the metadata jsonb (`lister_tool_id`).</em>
            </span>
          )}
        </div>
      </section>

      {/* Metadata */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Metadata (JSON)</h2>
        </div>
        <Textarea
          value={metadataJson}
          onChange={(e) => setMetadataJson(e.target.value)}
          rows={5}
          className="font-mono text-xs"
          style={{ fontSize: "13px" }}
        />
      </section>

      {/* Members */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">Members</h2>
            <Badge variant="outline" className="text-[10px]">{members.length}</Badge>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          <Button size="sm" onClick={() => setAdding(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add tool
          </Button>
        </div>
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </div>
        )}
        {!loading && members.length === 0 && (
          <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
            No tools in this bundle yet.
          </div>
        )}
        {members.length > 0 && (
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tool</TableHead>
                  <TableHead className="w-[260px]">Local alias</TableHead>
                  <TableHead className="w-[80px] text-right">Sort</TableHead>
                  <TableHead className="w-[80px] text-right">—</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <MemberRow
                    key={m.member.tool_id}
                    item={m}
                    onAliasChange={onSaveAlias}
                    onRemove={() => void onRemove(m)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      {adding && (
        <AddMemberDialog
          bundleId={bundle.id}
          existingToolIds={new Set(members.map((m) => m.member.tool_id))}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function MemberRow({
  item,
  onAliasChange,
  onRemove,
}: {
  item: BundleMemberWithTool;
  onAliasChange: (toolId: string, alias: string) => void;
  onRemove: () => void;
}) {
  const [alias, setAlias] = useState(item.member.local_alias);
  const [dirty, setDirty] = useState(false);
  return (
    <TableRow className={item.tool?.is_active === false ? "opacity-60" : ""}>
      <TableCell className="text-xs">
        <div className="font-mono">{item.tool?.name ?? <em>unknown</em>}</div>
        {item.tool?.description && (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
            {item.tool.description}
          </p>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <Input
            value={alias}
            onChange={(e) => {
              setAlias(e.target.value);
              setDirty(e.target.value !== item.member.local_alias);
            }}
            className="h-7 text-xs font-mono"
            style={{ fontSize: "13px" }}
          />
          {dirty && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onAliasChange(item.member.tool_id, alias);
                setDirty(false);
              }}
              className="h-7 text-xs px-2"
            >
              Save
            </Button>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right text-xs tabular-nums">{item.member.sort_order}</TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          aria-label="Remove from bundle"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function AddMemberDialog({
  bundleId,
  existingToolIds,
  onClose,
  onAdded,
}: {
  bundleId: string;
  existingToolIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; description: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selectedTool, setSelectedTool] = useState<{ id: string; name: string } | null>(null);
  const [alias, setAlias] = useState("");
  const [sort, setSort] = useState(100);

  useEffect(() => {
    let cancelled = false;
    setSearching(true);
    void searchToolsForBundle(query)
      .then((rows) => {
        if (!cancelled) setResults(rows.filter((r) => !existingToolIds.has(r.id)));
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Search failed");
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, existingToolIds]);

  const onPick = (tool: { id: string; name: string }) => {
    setSelectedTool(tool);
    // Default alias: local part of canonical (after the colon if namespaced)
    const localPart = tool.name.includes(":") ? tool.name.split(":", 2)[1] : tool.name;
    setAlias(localPart);
  };

  const onAdd = async () => {
    if (!selectedTool || !alias.trim()) {
      toast.error("Pick a tool and set an alias");
      return;
    }
    setBusy(true);
    try {
      await addBundleMember({
        bundleId,
        toolId: selectedTool.id,
        localAlias: alias.trim(),
        sortOrder: sort,
      });
      toast.success(`${selectedTool.name} added`);
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Add failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add tool to bundle</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!selectedTool && (
            <>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search tools by canonical name…"
                  className="pl-7 h-8 text-xs"
                  style={{ fontSize: "16px" }}
                  autoFocus
                />
              </div>
              <div className="max-h-[40vh] overflow-auto rounded-md border border-border bg-card divide-y divide-border">
                {searching && (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" />
                    Searching…
                  </div>
                )}
                {!searching && results.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    No tools match (or all matches are already in this bundle).
                  </div>
                )}
                {results.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => onPick({ id: r.id, name: r.name })}
                    className="w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors"
                  >
                    <div className="font-mono text-xs">{r.name}</div>
                    {r.description && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                        {r.description}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
          {selectedTool && (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 flex items-center justify-between">
                <code className="font-mono text-xs">{selectedTool.name}</code>
                <Button variant="ghost" size="sm" onClick={() => setSelectedTool(null)} className="h-6 text-xs">
                  Change
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Local alias (within bundle)</Label>
                  <Input
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                    className="font-mono text-sm h-8"
                    style={{ fontSize: "16px" }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Sort order</Label>
                  <Input
                    type="number"
                    value={sort}
                    onChange={(e) => setSort(Number(e.target.value) || 0)}
                    className="h-8"
                    style={{ fontSize: "16px" }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void onAdd()} disabled={busy || !selectedTool || !alias.trim()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
