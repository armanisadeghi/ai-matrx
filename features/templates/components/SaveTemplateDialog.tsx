"use client";

// SaveTemplateDialog — "Save as template": an agent whose variables read the person's tables,
// those tables (rows optional) and every other agent that reads them become a template the tables'
// organization can install, listed in the gallery beside the platform's.
//
// Moved from the retired kits Save dialog (Kits → Template merge, 2026-10-05) onto the template
// doors (`saveAsTemplate.ts`). The template is saved in the organization the tables live in — the
// draft door reads them there — and the dialog says which.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { AgentListDropdown } from "@ai-matrx/agents/catalog/react";
import { Input } from "@ai-matrx/design-system/controls";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTablesEverywhere } from "@/features/unified-data/hub/useTablesEverywhere";
import { templatePreviewHref } from "@/features/make/gallery/galleryHref";
import { createClient } from "@/utils/supabase/client";
import { useScopedTemplateKnobs } from "../knobs";
import { TEMPLATES_CHANGED_EVENT } from "../events";
import { agentsReading, readSetupAgents, saveAsTemplate, tablesReadBy, type SavedTemplate, type SetupAgent } from "../saveAsTemplate";

import { Spinner } from "@/components/ui/loaders/Spinner";
import { ProTextarea } from "@/components/official/ProTextarea";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export interface SaveTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialAgentId?: string | null;
}


export function SaveTemplateDialog({ isOpen, onClose, initialAgentId }: SaveTemplateDialogProps) {
  const [agentId, setAgentId] = useState<string | null>(initialAgentId ?? null);
  const [found, setFound] = useState<{ agents: SetupAgent[]; tableIds: string[] } | { error: string } | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [includeRows, setIncludeRows] = useState(true);
  const [name, setName] = useState("");
  const [describes, setDescribes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedTemplate | null>(null);
  const tables = useTablesEverywhere();

  // The chosen agent → its tables → every agent of that organization that reads them.
  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setFound(null);
    void (async () => {
      try {
        const client = createClient();
        const [start] = await readSetupAgents(client, [agentId]);
        const tableIds = start ? tablesReadBy([start]) : [];
        if (!start || tableIds.length === 0) {
          if (!cancelled) setFound({ error: "This agent reads no tables — connect a variable to a table first" });
          return;
        }
        const { data } = await client.schema("agent").from("definition").select("organization_id").eq("id", agentId).single();
        const org = (data as { organization_id: string } | null)?.organization_id ?? null;
        const readers = org ? await agentsReading(client, org, tableIds) : [];
        const agents = [start, ...readers.filter((a) => a.id !== start.id)];
        if (!cancelled) {
          setFound({ agents, tableIds: tablesReadBy(agents) });
          setName((n) => n || `${start.name} setup`);
        }
      } catch (err) {
        if (!cancelled) setFound({ error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const rowsOf = useMemo(() => new Map(tables.rows.map((r) => [r.table_id, r])), [tables.rows]);
  const ok = found && "agents" in found ? found : null;
  const chosenAgents = ok ? ok.agents.filter((a) => !skipped.has(a.id)) : [];
  const tableIds = ok ? tablesReadBy(chosenAgents) : [];
  // The tables' organization: the draft door reads them there, and the template is saved there.
  const orgs = new Set(tableIds.map((t) => rowsOf.get(t)?.organization_id).filter(Boolean) as string[]);
  const organizationId = orgs.size === 1 ? [...orgs][0]! : null;
  const orgName = tableIds.map((t) => rowsOf.get(t)?.organization_name).find(Boolean) ?? null;
  const knobs = useScopedTemplateKnobs(organizationId);

  const save = async () => {
    if (!organizationId || !ok) return;
    if (knobs.seedRowCap === null) {
      setError(`A limit is not set: ${knobs.missing.join(", ") || "templates.seed_row_cap"}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await saveAsTemplate(createClient(), organizationId, {
        name: name.trim(),
        describes: describes.trim(),
        agents: chosenAgents,
        tableIds,
        tableNames: Object.fromEntries(tableIds.map((t) => [t, rowsOf.get(t)?.table_name ?? ""])),
        includeRows,
        rowsPerTable: knobs.seedRowCap,
      });
      setSaved(result);
      window.dispatchEvent(new Event(TEMPLATES_CHANGED_EVENT));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg" data-save-template="">
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>An agent, the tables it reads and the agents that share them</DialogDescription>
        </DialogHeader>

        {saved ? (
          <div className="space-y-3" data-save-template-saved={saved.templateId}>
            <p className="flex items-center gap-2 type-body text-foreground">
              <Check className="h-4 w-4 text-primary" /> {`Saved in ${orgName ?? "your organization"}`}
            </p>
            {saved.left.length > 0 ? (
              <ul className="space-y-1 type-secondary text-muted-foreground">
                {saved.left.map((l) => (
                  <li key={l}>{`Not carried: ${l}`}</li>
                ))}
              </ul>
            ) : null}
            <Button variant="primary" asChild>
              <Link href={templatePreviewHref(saved.templateId)} onClick={onClose}>
                Open the template
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <AgentListDropdown
              activeAgentId={agentId ?? undefined}
              onSelect={(id: string) => {
                setAgentId(id);
                setSkipped(new Set());
              }}
              triggerSlot={
                <Button type="submit" variant="outline" className="w-full justify-between" data-save-template-agent="">
                  <span className="truncate">
                    {ok?.agents[0]
                      ? `${ok.agents[0].name}${orgName ? ` · ${orgName}` : ""}`
                      : agentId
                        ? "Reading the agent…"
                        : "Choose an agent…"}
                  </span>
                </Button>
              }
            />
            {found && "error" in found ? <p className="type-body text-destructive">{found.error}<ErrorAlchemyMenu error={found.error} /></p> : null}
            {agentId && !found ? (
              <p className="flex items-center gap-2 type-body text-muted-foreground">
                <Spinner size="xs" className="text-current" /> Reading its tables
              </p>
            ) : null}
            {ok ? (
              <>
                <div className="space-y-1.5">
                  <p className="type-secondary font-medium text-muted-foreground">Agents</p>
                  {ok.agents.map((a, i) => (
                    <label key={a.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={!skipped.has(a.id)}
                        disabled={i === 0}
                        onCheckedChange={(v) =>
                          setSkipped((s) => {
                            const next = new Set(s);
                            if (v) next.delete(a.id);
                            else next.add(a.id);
                            return next;
                          })
                        }
                      />
                      <span className="truncate">{a.name}</span>
                    </label>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <p className="type-secondary font-medium text-muted-foreground">Tables</p>
                  {tableIds.map((t) => (
                    <p key={t} className="truncate type-body">
                      {rowsOf.get(t)?.table_name ?? "Table"}
                    </p>
                  ))}
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={includeRows} onCheckedChange={(v) => setIncludeRows(Boolean(v))} data-save-template-rows="" />
                    Include their rows
                  </label>
                </div>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" data-save-template-name="" />
                <ProTextarea value={describes} onChange={(e) => setDescribes(e.target.value)} placeholder="Who it is for" rows={2} />
                {orgs.size > 1 ? <p className="type-body text-destructive">These tables live in different organizations — pick agents from one</p> : null}
                {organizationId ? <p className="type-secondary text-muted-foreground">{`Saved in ${orgName ?? "its organization"}`}</p> : null}
              </>
            ) : null}
            {error ? <p className="type-body text-destructive" role="alert">{error}<ErrorAlchemyMenu error={error} /></p> : null}
          </div>
        )}

        <DialogFooter>
          {saved ? (
            <Button variant="quiet" onClick={onClose}>
              Close
            </Button>
          ) : (
            <Button icon={saving ? <Spinner size="xs" className="text-current" /> : null} variant="primary" onClick={() => void save()} disabled={!ok || !organizationId || !name.trim() || saving} data-save-template-save="">
              Save
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
