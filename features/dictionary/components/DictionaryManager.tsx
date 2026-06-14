"use client";

// DictionaryManager — the reusable CRUD surface for ONE dictionary owner, used
// at all four levels (user preferences + org / scope-type / scope edit flows).
// Clean visual table by default; an "Advanced" disclosure exposes JSON/CSV
// import-export and the inline-policy override. An "Ask the assistant" button
// launches the Dictionary Assistant chat preset to this owner.

import { useCallback, useMemo, useState } from "react";
import {
  Plus, Search, Trash2, Pencil, MessageSquare, ChevronDown, Download, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDictionary } from "@/features/dictionary/hooks/useDictionary";
import { useOpenDictionaryAssistant } from "@/features/dictionary/hooks/useOpenDictionaryAssistant";
import { DictionaryImportDialog } from "@/features/dictionary/components/DictionaryImportDialog";
import { entriesToCsv, entriesToJson, downloadTextFile } from "@/features/dictionary/utils/io";
import {
  InlinePolicyControl,
  decodeInlinePolicy,
  encodeInlinePolicy,
  type InlinePolicyValue,
} from "@/features/agents/components/context-slots-management/InlinePolicyControl";
import { DICT_LEVEL_LABELS } from "@/features/dictionary/constants";
import type { DictEntry, DictEntryDraft, DictLevel } from "@/features/dictionary/types";

interface Props {
  level: DictLevel;
  ownerId: string;
  ownerName?: string;
  canEdit?: boolean;
  /** Compact mode trims the header for embedding in an entity editor section. */
  embedded?: boolean;
}

const EMPTY_DRAFT: DictEntryDraft = {
  term: "",
  sounds_like: [],
  pronunciation: "",
  ipa: "",
  definition: "",
  category: "",
  is_active: true,
};

export function DictionaryManager({ level, ownerId, ownerName, canEdit = true, embedded }: Props) {
  const { entries, status, settings, busy, upsert, remove, saveInlinePolicy } = useDictionary(
    level,
    ownerId,
  );
  const { open: openAssistant } = useOpenDictionaryAssistant();

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ draft: DictEntryDraft; soundsLikeText: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.term.toLowerCase().includes(q) ||
        e.sounds_like.some((s) => s.toLowerCase().includes(q)) ||
        (e.category ?? "").toLowerCase().includes(q) ||
        (e.definition ?? "").toLowerCase().includes(q),
    );
  }, [entries, query]);

  const openEditor = useCallback((entry?: DictEntry) => {
    if (entry) {
      setEditing({
        draft: { ...entry },
        soundsLikeText: entry.sounds_like.join(", "),
      });
    } else {
      setEditing({ draft: { ...EMPTY_DRAFT }, soundsLikeText: "" });
    }
  }, []);

  const saveEntry = useCallback(async () => {
    if (!editing) return;
    const term = editing.draft.term.trim();
    if (!term) {
      toast.error("Term is required");
      return;
    }
    const draft: DictEntryDraft = {
      ...editing.draft,
      term,
      sounds_like: editing.soundsLikeText
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    };
    await upsert([draft]);
    setEditing(null);
    toast.success(editing.draft.id ? "Entry updated" : "Entry added");
  }, [editing, upsert]);

  const doImport = useCallback(
    async (drafts: DictEntryDraft[]) => {
      await upsert(drafts);
    },
    [upsert],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const deleteSelected = useCallback(async () => {
    const ids = confirmDelete ?? [];
    if (ids.length === 0) return;
    await remove(ids);
    setSelected(new Set());
    setConfirmDelete(null);
    toast.success(`Deleted ${ids.length} entr${ids.length === 1 ? "y" : "ies"}`);
  }, [confirmDelete, remove]);

  // Inline-policy local state (loaded from settings).
  const inlineValue: InlinePolicyValue = useMemo(
    () => decodeInlinePolicy(settings.max_inline_chars),
    [settings.max_inline_chars],
  );
  const [inlineDraft, setInlineDraft] = useState<InlinePolicyValue | null>(null);
  const effectiveInline = inlineDraft ?? inlineValue;

  const saveInline = useCallback(async () => {
    const encoded = encodeInlinePolicy(effectiveInline);
    if ("error" in encoded) {
      toast.error(encoded.error);
      return;
    }
    await saveInlinePolicy(encoded.maxInlineChars);
    setInlineDraft(null);
    toast.success("Inline policy saved");
  }, [effectiveInline, saveInlinePolicy]);

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${entries.length} term${entries.length === 1 ? "" : "s"}…`}
            className="pl-8 h-9"
            style={{ fontSize: "16px" }}
          />
        </div>
        {canEdit && (
          <Button size="sm" className="gap-1.5" onClick={() => openEditor()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => void openAssistant({ level, ownerId, ownerName })}
        >
          <MessageSquare className="h-4 w-4" /> Ask assistant
        </Button>
        {selected.size > 0 && canEdit && (
          <Button
            size="sm"
            variant="destructive"
            className="gap-1.5"
            onClick={() => setConfirmDelete([...selected])}
          >
            <Trash2 className="h-4 w-4" /> Delete {selected.size}
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border border-border">
        <div className="grid grid-cols-[28px_1.4fr_1.4fr_1fr_28px] gap-2 px-3 py-2 border-b border-border text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span />
          <span>Term</span>
          <span>Pronunciation</span>
          <span>Category</span>
          <span />
        </div>
        <ScrollArea className={cn(embedded ? "max-h-[340px]" : "max-h-[520px]")}>
          {status === "loading" && entries.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {entries.length === 0
                ? "No entries yet. Add your first term, import a file, or ask the assistant."
                : "No matches."}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((e) => (
                <li
                  key={e.id}
                  className={cn(
                    "grid grid-cols-[28px_1.4fr_1.4fr_1fr_28px] gap-2 px-3 py-2 items-center text-sm",
                    !e.is_active && "opacity-50",
                  )}
                >
                  <Checkbox
                    checked={selected.has(e.id)}
                    onCheckedChange={() => toggleSelect(e.id)}
                    disabled={!canEdit}
                    aria-label={`Select ${e.term}`}
                  />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{e.term}</div>
                    {e.sounds_like.length > 0 && (
                      <div className="text-[11px] text-muted-foreground truncate">
                        ≈ {e.sounds_like.join(", ")}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 truncate text-muted-foreground">
                    {e.pronunciation || (e.ipa ? `/${e.ipa}/` : "—")}
                  </div>
                  <div className="min-w-0 truncate text-muted-foreground">{e.category || "—"}</div>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => openEditor(e)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Edit ${e.term}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <span />
                  )}
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </div>

      {/* Advanced */}
      <div className="rounded-md border border-border">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
        >
          <span>Advanced</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", advancedOpen && "rotate-180")} />
        </button>
        {advancedOpen && (
          <div className="space-y-5 border-t border-border px-3 py-3">
            {/* Import / Export */}
            <div className="space-y-1.5">
              <Label className="text-xs">Import / export</Label>
              <div className="flex flex-wrap gap-2">
                {canEdit && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setImportOpen(true)}>
                    <Upload className="h-4 w-4" /> Import CSV / JSON
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={entries.length === 0}
                  onClick={() => downloadTextFile("dictionary.csv", entriesToCsv(entries), "text/csv")}
                >
                  <Download className="h-4 w-4" /> Export CSV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={entries.length === 0}
                  onClick={() =>
                    downloadTextFile("dictionary.json", entriesToJson(entries), "application/json")
                  }
                >
                  <Download className="h-4 w-4" /> Export JSON
                </Button>
              </div>
            </div>

            {/* Inline policy */}
            {canEdit && (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Inline policy</Label>
                  <p className="text-[11px] text-muted-foreground">
                    How much of this {DICT_LEVEL_LABELS[level].toLowerCase()} dictionary is injected
                    inline into agent context vs retrieved on demand. The 200-char default is usually
                    right.
                  </p>
                </div>
                <InlinePolicyControl value={effectiveInline} onChange={setInlineDraft} />
                {inlineDraft && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveInline} disabled={busy}>
                      Save policy
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setInlineDraft(null)}>
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Entry editor */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.draft.id ? "Edit entry" : "Add entry"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <Field label="Term" required>
                <Input
                  value={editing.draft.term}
                  onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, term: e.target.value } })}
                  placeholder="Rejuvina"
                  style={{ fontSize: "16px" }}
                />
              </Field>
              <Field label="Pronunciation (respelling)">
                <Input
                  value={editing.draft.pronunciation ?? ""}
                  onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, pronunciation: e.target.value } })}
                  placeholder="reh-juh-VEE-nah"
                  style={{ fontSize: "16px" }}
                />
              </Field>
              <Field label="IPA (optional)">
                <Input
                  value={editing.draft.ipa ?? ""}
                  onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, ipa: e.target.value } })}
                  placeholder="ɹɛdʒəˈvinə"
                  style={{ fontSize: "16px" }}
                />
              </Field>
              <Field label="Sounds like (comma-separated mishearings)">
                <Input
                  value={editing.soundsLikeText}
                  onChange={(e) => setEditing({ ...editing, soundsLikeText: e.target.value })}
                  placeholder="rejuvena, rejuvinah"
                  style={{ fontSize: "16px" }}
                />
              </Field>
              <Field label="Definition (helps the AI know when it applies)">
                <Textarea
                  value={editing.draft.definition ?? ""}
                  onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, definition: e.target.value } })}
                  className="min-h-[60px]"
                  style={{ fontSize: "16px" }}
                />
              </Field>
              <Field label="Category">
                <Input
                  value={editing.draft.category ?? ""}
                  onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, category: e.target.value } })}
                  placeholder="Products"
                  style={{ fontSize: "16px" }}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={editing.draft.is_active ?? true}
                  onCheckedChange={(v) => setEditing({ ...editing, draft: { ...editing.draft, is_active: v } })}
                />
                Active
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEntry} disabled={busy}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DictionaryImportDialog open={importOpen} onOpenChange={setImportOpen} onImport={doImport} />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete entries?"
        description={`This removes ${confirmDelete?.length ?? 0} entr${(confirmDelete?.length ?? 0) === 1 ? "y" : "ies"} from this dictionary.`}
        confirmLabel="Delete"
        variant="destructive"
        busy={busy}
        onConfirm={deleteSelected}
      />
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}
