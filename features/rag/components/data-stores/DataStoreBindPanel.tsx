"use client";

/**
 * DataStoreBindPanel — bind / unbind a document to one or more data stores.
 *
 * Drops into the PDF Workspace's "Data Stores" sub-tab. Lets the user:
 *  - see every store they own / are a member of
 *  - toggle membership for the active document (writes
 *    rag.data_store_members rows)
 *  - create a fresh store inline (org-less; admin / org pickers live in
 *    a fuller management surface, future Phase 4F)
 *
 * RLS handles all filtering — the user only sees stores they're allowed
 * to see, and inserts/deletes succeed only when their auth.uid() matches
 * the store's created_by (or org membership predicate).
 */

import React, { useState } from "react";
import { Database, Plus, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useDataStores,
  useDocumentDataStores,
} from "@/features/rag/hooks/useDataStores";

interface DataStoreBindPanelProps {
  processedDocumentId: string;
  documentName: string;
}

export function DataStoreBindPanel({
  processedDocumentId,
  documentName,
}: DataStoreBindPanelProps) {
  const { stores, loading, error, refresh, createStore } = useDataStores();
  const {
    memberOf,
    bind,
    unbind,
    loading: membershipLoading,
  } = useDocumentDataStores(processedDocumentId);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const handleToggle = async (storeId: string) => {
    setBusy(storeId);
    try {
      if (memberOf.has(storeId)) await unbind(storeId);
      else await bind(storeId);
    } finally {
      setBusy(null);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    const made = await createStore({ name });
    if (made) {
      setNewName("");
      setCreating(false);
      // Auto-bind the document to the brand-new store — most likely intent.
      await bind(made.id);
      refresh();
    }
  };

  return (
    <div className="p-3 space-y-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Database className="w-3.5 h-3.5 text-primary" />
        <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
          Data Stores
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-1">
          · binding for <span className="font-medium">{documentName}</span>
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[10px] px-2 ml-auto"
          onClick={() => setCreating((c) => !c)}
        >
          <Plus className="w-2.5 h-2.5 mr-0.5" />
          New store
        </Button>
      </div>

      {creating && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 border border-primary/30 bg-primary/5 rounded-md">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Store name (e.g. Tax 2024)"
            className="h-7 text-xs"
            style={{ fontSize: "16px" }}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
              if (e.key === "Escape") setCreating(false);
            }}
          />
          <Button
            size="sm"
            className="h-7 text-[10px]"
            onClick={() => void handleCreate()}
            disabled={!newName.trim()}
          >
            Create + bind
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[10px]"
            onClick={() => setCreating(false)}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {error && (
        <div className="text-[10px] text-destructive border border-destructive/30 bg-destructive/10 rounded px-2 py-1.5">
          {error}
        </div>
      )}

      {loading && stores.length === 0 ? (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70 p-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading data stores…
        </div>
      ) : stores.length === 0 ? (
        <div className="px-3 py-3 border border-dashed border-border rounded-md bg-muted/20 text-[11px] text-muted-foreground leading-snug">
          No data stores yet. Create one to bind this document — agent retrieval
          (<code>knowledge_search</code>) requires an explicit store id.
        </div>
      ) : (
        <div className="space-y-1">
          {stores.map((s) => {
            const isMember = memberOf.has(s.id);
            const isBusy = busy === s.id || membershipLoading;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => void handleToggle(s.id)}
                disabled={isBusy}
                className={cn(
                  "w-full flex items-start gap-2 px-2.5 py-2 rounded-md border transition-colors text-left disabled:opacity-50",
                  isMember
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-card hover:bg-accent/30",
                )}
              >
                <div
                  className={cn(
                    "shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5",
                    isMember ? "bg-primary/20" : "bg-muted",
                  )}
                >
                  {isMember ? (
                    <Check className="w-3 h-3 text-primary" />
                  ) : (
                    <Database className="w-3 h-3 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium leading-tight truncate">
                    {s.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {s.memberCount.toLocaleString()} members
                    {s.shortCode && ` · ${s.shortCode}`}
                    {s.organizationId && " · org"}
                  </p>
                  {s.description && (
                    <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
                      {s.description}
                    </p>
                  )}
                </div>
                {isBusy && (
                  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                )}
              </button>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/70 pt-1 leading-snug">
        Members are written to <code>rag.data_store_members</code> with{" "}
        <code>source_kind = 'processed_document'</code>. Agents call
        <code className="mx-1">rag.search_data_store(store_id, query)</code>— no
        store id, no retrieval.
      </p>
    </div>
  );
}
