"use client";

import { count } from "../format";

// SaveKitDialog — "Save as kit": a person's own setup (an agent whose variables read
// their tables, those tables, the workflows that use them) becomes a kit their
// organization can install. Built only from what the person can already read; the
// kit is a catalog row their organization owns.
//
// Steps: agent → data → details → walkthrough → workflows → review.
// Edit mode (`editKitKey`) reopens a saved kit's details and walkthrough only.

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronDown, Loader2, Plus, Share2, Trash2 } from "lucide-react";
import { AgentListDropdown } from "@ai-matrx/agents/catalog/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { useOpenShareModal } from "@/features/overlays/openers/shareModal";
import { createClient } from "@/utils/supabase/client";
import { toast } from "@/lib/toast";
import { cn } from "@/utils/cn";
import { KIT_ROUTES, KIT_SAVE, KIT_WORD, KITS_CHANGED_EVENT } from "../constants";
import { kitRecordsClient } from "../installer";
import { publishKit, updateKit } from "../publish";
import { buildManifest, draftGuide, type Snapshot } from "../serialize";
import { fetchKit } from "../service";
import { agentForkableByOrg, detectSetup, type Detected } from "../snapshot";
import type { KitGuideStep, KitManifest } from "../types";
import { ErrorNotice } from "./ErrorNotice";
import { KIT_ICON_CHOICES, KitIcon } from "./KitIcon";

type Step = "agent" | "data" | "details" | "guide" | "workflows" | "review";
const STEPS: { id: Step; label: string }[] = [
  { id: "agent", label: "Agent" },
  { id: "data", label: "Data" },
  { id: "details", label: "Details" },
  { id: "guide", label: "Walkthrough" },
  { id: "workflows", label: "Workflows" },
  { id: "review", label: "Review" },
];
const EDIT_STEPS: Step[] = ["details", "guide", "review"];

export interface SaveKitDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialAgentId?: string | null;
  editKitKey?: string | null;
}

interface Details {
  name: string;
  tagline: string;
  description: string;
  category: string;
  icon: string;
  teaches: string;
  agentName: string;
  agentDescription: string;
  tryItInput: string;
}

const EMPTY_DETAILS: Details = {
  name: "",
  tagline: "",
  description: "",
  category: "",
  icon: "package",
  teaches: "",
  agentName: "",
  agentDescription: "",
  tryItInput: "",
};

export function SaveKitDialog({ isOpen, onClose, initialAgentId, editKitKey }: SaveKitDialogProps) {
  const userId = useAppSelector(selectUserId);
  const org = useOrganizationRequired();
  const organizationId = org.organizationState === "ready" ? org.organizationId : null;
  const { organizations } = useUserOrganizations();
  const orgName = organizations.find((o) => o.id === organizationId)?.name ?? "your organization";
  const openShare = useOpenShareModal();
  const editing = !!editKitKey;

  const [step, setStep] = useState<Step>(editing ? "details" : "agent");
  const [agentId, setAgentId] = useState<string | null>(initialAgentId ?? null);
  const [detected, setDetected] = useState<Detected | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [includeRows, setIncludeRows] = useState<Record<string, boolean>>({});
  const [includeWorkflows, setIncludeWorkflows] = useState<Record<string, boolean>>({});
  const [details, setDetails] = useState<Details>(EMPTY_DETAILS);
  const [guide, setGuide] = useState<KitGuideStep[]>([]);
  const [editingManifest, setEditingManifest] = useState<KitManifest | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Edit mode: load the saved kit.
  useEffect(() => {
    if (!editKitKey) return;
    let cancelled = false;
    void fetchKit(createClient(), editKitKey).then(({ kit, error }) => {
      if (cancelled) return;
      if (!kit) {
        setDetectError(error ?? `There is no saved ${KIT_WORD.oneLower} called "${editKitKey}".`);
        return;
      }
      const m = kit.manifest;
      setEditingManifest(m);
      setDetails({
        name: m.name,
        tagline: m.tagline,
        description: m.description,
        category: m.category,
        icon: m.icon,
        teaches: m.teaches.join("\n"),
        agentName: m.agents[0]?.name ?? "",
        agentDescription: m.agents[0]?.description ?? "",
        tryItInput: m.agents[0]?.try_it?.user_input ?? "",
      });
      setGuide(m.guide);
    });
    return () => {
      cancelled = true;
    };
  }, [editKitKey]);

  // Create mode: read the setup once an agent is picked.
  useEffect(() => {
    if (editing || !agentId || !organizationId) return;
    let cancelled = false;
    setDetecting(true);
    setDetectError(null);
    setDetected(null);
    detectSetup(kitRecordsClient(organizationId, userId), organizationId, agentId)
      .then((d) => {
        if (cancelled) return;
        setDetected(d);
        setIncludeRows(Object.fromEntries(d.tables.map((t) => [t.id, true])));
        setIncludeWorkflows(Object.fromEntries(d.workflows.map((w) => [w.id, true])));
        setDetails((cur) => ({
          ...cur,
          name: cur.name || `${d.agent.name} ${KIT_WORD.one}`,
          agentName: cur.agentName || d.agent.name,
          agentDescription: cur.agentDescription || (d.agent.description ?? ""),
          category: cur.category || "My organization",
          teaches:
            cur.teaches ||
            d.bindings
              .map((b) => {
                const t = d.tables.find((x) => x.id === b.binding.table_id);
                return t ? `{{${b.variable}}} reads the ${t.name} table on every run — change a row, not the prompt.` : "";
              })
              .filter(Boolean)
              .join("\n"),
        }));
        const snap: Snapshot = {
          agent: { id: d.agent.id, name: d.agent.name, variableDefinitions: d.agent.variableDefinitions },
          tables: d.tables,
          workflows: d.workflows,
        };
        setGuide((cur) => (cur.length > 0 ? cur : draftGuide(snap, d.agent.name)));
      })
      .catch((err: unknown) => {
        if (!cancelled) setDetectError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setDetecting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editing, agentId, organizationId, userId, attempt]);

  const build = () => {
    if (editing && editingManifest) {
      const agent0 = editingManifest.agents[0];
      const manifest: KitManifest = {
        ...editingManifest,
        name: details.name.trim(),
        tagline: details.tagline.trim(),
        description: details.description.trim(),
        category: details.category.trim() || "My organization",
        icon: details.icon,
        teaches: details.teaches.split("\n").map((t) => t.trim()).filter(Boolean),
        guide,
        agents: agent0
          ? [
              {
                ...agent0,
                name: details.agentName.trim() || agent0.name,
                description: details.agentDescription.trim(),
                try_it: details.tryItInput.trim() ? { ...agent0.try_it, user_input: details.tryItInput.trim() } : agent0.try_it,
              },
              ...editingManifest.agents.slice(1),
            ]
          : editingManifest.agents,
      };
      return { manifest, notes: [] as string[] };
    }
    if (!detected) return null;
    const snap: Snapshot = {
      agent: { id: detected.agent.id, name: detected.agent.name, variableDefinitions: detected.agent.variableDefinitions },
      tables: detected.tables.map((t) => ({ ...t, rows: includeRows[t.id] ? t.rows : [] })),
      workflows: detected.workflows.filter((w) => includeWorkflows[w.id]),
    };
    return buildManifest(snap, {
      key: "draft",
      name: details.name.trim(),
      tagline: details.tagline.trim(),
      description: details.description.trim(),
      category: details.category.trim() || "My organization",
      icon: details.icon,
      teaches: details.teaches.split("\n").map((t) => t.trim()).filter(Boolean),
      guide,
      agentName: details.agentName.trim() || detected.agent.name,
      agentDescription: details.agentDescription.trim(),
      ...(details.tryItInput.trim() ? { tryIt: { user_input: details.tryItInput.trim() } } : {}),
    });
  };

  const save = async () => {
    if (!organizationId || !userId) return;
    const built = build();
    if (!built) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (editing && editKitKey) {
        await updateKit(editKitKey, built.manifest);
        setSavedKey(editKitKey);
      } else {
        const key = await publishKit({ manifest: built.manifest, organizationId, userId });
        setSavedKey(key);
      }
      toast.success(`"${built.manifest.name}" is saved for ${orgName}.`);
      window.dispatchEvent(new CustomEvent(KITS_CHANGED_EVENT));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const steps = editing ? STEPS.filter((s) => EDIT_STEPS.includes(s.id)) : STEPS;
  const index = steps.findIndex((s) => s.id === step);
  const canNext =
    step === "agent"
      ? !!detected && detected.bindings.length > 0
      : step === "details"
        ? details.name.trim().length > 0 && details.tagline.trim().length > 0
        : true;

  const forkable = detected && organizationId ? agentForkableByOrg(detected.agent, organizationId) : null;
  const built = step === "review" ? build() : null;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${KIT_WORD.oneLower}` : `Save as ${KIT_WORD.oneLower}`}</DialogTitle>
          <DialogDescription>
            {editing
              ? `Change how this ${KIT_WORD.oneLower} is described. Its tables, agent and workflows stay as they were saved.`
              : `Turn an agent that reads your tables into a ${KIT_WORD.oneLower} anyone in ${orgName} can install in one click.`}
          </DialogDescription>
        </DialogHeader>

        {/* Step rail */}
        {!savedKey && (
          <ol className="flex flex-wrap items-center gap-1 text-[11px]">
            {steps.map((s, i) => (
              <li key={s.id} className="flex items-center gap-1">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 font-medium",
                    i === index ? "bg-foreground text-background" : i < index ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
                {i < steps.length - 1 && <span className="text-muted-foreground/40">·</span>}
              </li>
            ))}
          </ol>
        )}

        <div className="min-h-[260px] space-y-4 py-1">
          {org.organizationState !== "ready" ? (
            <OrganizationContextNotice state={org.organizationState} what={`Saving a ${KIT_WORD.oneLower}`} compact />
          ) : savedKey ? (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-success/30 bg-success/5 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Check className="h-4 w-4 text-success" />
                Saved. Everyone in {orgName} can now find it under {KIT_WORD.many}.
              </p>
              <div className="flex gap-2">
                <Button asChild size="sm">
                  <Link href={KIT_ROUTES.detail(savedKey)} onClick={onClose}>
                    Open the {KIT_WORD.oneLower}
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={KIT_ROUTES.gallery} onClick={onClose}>
                    All {KIT_WORD.manyLower}
                  </Link>
                </Button>
              </div>
            </div>
          ) : step === "agent" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Which agent does this {KIT_WORD.oneLower} share? It needs at least one variable connected to one of your tables.</p>
              <AgentListDropdown
                activeAgentId={agentId ?? undefined}
                onSelect={(id: string) => setAgentId(id)}
                triggerSlot={
                  <Button variant="outline" className="w-full justify-between">
                    <span className="truncate">{detected?.agent.name ?? (agentId ? "Reading the agent…" : "Choose an agent…")}</span>
                    <ChevronDown className="h-4 w-4 opacity-60" />
                  </Button>
                }
              />
              {detecting && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Reading the agent, the tables it reads and the workflows that use it…
                </p>
              )}
              {detectError && <ErrorNotice title="The setup could not be read." error={detectError} onRetry={() => setAttempt((n) => n + 1)} />}
              {detected && detected.bindings.length === 0 && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground">
                  <p>{detected.agent.name} has no variable connected to a table yet, so there is nothing to share as a {KIT_WORD.oneLower}.</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Connect a variable to one of your tables on the agent, or start from a{" "}
                    <Link href={KIT_ROUTES.gallery} className="text-primary hover:underline" onClick={onClose}>
                      {KIT_WORD.oneLower} that already does
                    </Link>
                    .
                  </p>
                </div>
              )}
              {detected && detected.bindings.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {detected.bindings.map((b) => (
                    <li key={b.variable} className="flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 text-success" />
                      <code className="rounded bg-muted px-1 font-mono text-xs">{`{{${b.variable}}}`}</code>
                      <span className="text-muted-foreground">reads</span>
                      <span>{detected.tables.find((t) => t.id === b.binding.table_id)?.name ?? "a table"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : step === "data" && detected ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                These tables come with the {KIT_WORD.oneLower}. Their rows are copied in as example data unless you turn it off (up to {KIT_SAVE.seedRowCap} rows each).
              </p>
              {detected.tables.map((t) => (
                <label key={t.id} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
                  <Checkbox
                    checked={!!includeRows[t.id]}
                    onCheckedChange={(v) => setIncludeRows((cur) => ({ ...cur, [t.id]: v === true }))}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {t.name}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {count(t.fields.length, "column")} · {t.capped ? `${t.rows.length}+ rows` : count(t.rows.length, "row")}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {includeRows[t.id] ? "Include its rows as example data" : "Include the empty table only"}
                      {t.reason === "related" ? " — added because another table points at it" : ""}
                      {t.capped ? ` — only the first ${KIT_SAVE.seedRowCap} rows are included` : ""}
                    </p>
                  </div>
                  <Link href={KIT_ROUTES.table(t.id)} target="_blank" className="shrink-0 text-xs text-primary hover:underline">
                    Open
                  </Link>
                </label>
              ))}
              {forkable && !forkable.ok && (
                <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <div className="min-w-0">
                    <p className="text-foreground">{forkable.why}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => openShare({ resourceType: "agent", resourceId: detected.agent.id, resourceName: detected.agent.name })}
                    >
                      <Share2 className="mr-1.5 h-3.5 w-3.5" />
                      Share the agent with the organization
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : step === "details" ? (
            <div className="grid gap-3">
              <Field label="Name">
                <Input value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} />
              </Field>
              <Field label="Tagline (one line, for the gallery card)">
                <Input value={details.tagline} onChange={(e) => setDetails({ ...details, tagline: e.target.value })} />
              </Field>
              <Field label="Description">
                <Textarea rows={3} value={details.description} onChange={(e) => setDetails({ ...details, description: e.target.value })} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Category">
                  <Input value={details.category} onChange={(e) => setDetails({ ...details, category: e.target.value })} />
                </Field>
                <Field label="The agent copy's name">
                  <Input value={details.agentName} onChange={(e) => setDetails({ ...details, agentName: e.target.value })} />
                </Field>
              </div>
              <Field label="Icon">
                <div className="flex flex-wrap gap-1.5">
                  {KIT_ICON_CHOICES.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setDetails({ ...details, icon: name })}
                      className={cn("rounded-xl p-0.5 ring-2 ring-transparent", details.icon === name && "ring-primary")}
                      aria-label={name}
                      aria-pressed={details.icon === name}
                    >
                      <KitIcon name={name} tintKey={details.name || "kit"} size="sm" />
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="The tricks it teaches (one per line)">
                <Textarea rows={3} value={details.teaches} onChange={(e) => setDetails({ ...details, teaches: e.target.value })} />
              </Field>
              <Field label="An example message for “Try it” (optional)">
                <Input value={details.tryItInput} onChange={(e) => setDetails({ ...details, tryItInput: e.target.value })} />
              </Field>
            </div>
          ) : step === "guide" ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">A short walkthrough people read after installing. Drafted from what was found — edit freely.</p>
              {guide.map((g, i) => (
                <div key={i} className="flex gap-2 rounded-lg border border-border bg-card p-2">
                  <span className="mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background">{i + 1}</span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Input value={g.title} placeholder="Title" onChange={(e) => setGuide(guide.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                    <Textarea rows={2} value={g.body} placeholder="What to look at or do" onChange={(e) => setGuide(guide.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} />
                  </div>
                  <Button size="icon" variant="ghost" aria-label="Remove this step" onClick={() => setGuide(guide.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setGuide([...guide, { title: "", body: "" }])}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add a step
              </Button>
            </div>
          ) : step === "workflows" && detected ? (
            <div className="space-y-2">
              {detected.workflows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No workflow in {orgName} uses this agent or its tables, so the {KIT_WORD.oneLower} carries none.</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">These workflows use the agent or its tables. Included ones are recreated on install, pointed at the new copies.</p>
                  {detected.workflows.map((w) => (
                    <label key={w.id} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
                      <Checkbox
                        checked={!!includeWorkflows[w.id]}
                        onCheckedChange={(v) => setIncludeWorkflows((cur) => ({ ...cur, [w.id]: v === true }))}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{w.name}</p>
                        {w.description && <p className="text-xs text-muted-foreground">{w.description}</p>}
                      </div>
                      <Link href={KIT_ROUTES.workflow(w.id)} target="_blank" className="shrink-0 text-xs text-primary hover:underline">
                        Open
                      </Link>
                    </label>
                  ))}
                </>
              )}
            </div>
          ) : step === "review" && built ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
                <KitIcon name={built.manifest.icon} tintKey={built.manifest.name} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{built.manifest.name}</p>
                  <p className="text-xs text-muted-foreground">{built.manifest.tagline}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {built.manifest.tables.length} {built.manifest.tables.length === 1 ? "table" : "tables"} ·{" "}
                    {count(built.manifest.tables.reduce((n, t) => n + t.records.length, 0), "example row")} · 1 agent ·{" "}
                    {built.manifest.workflows.length} {built.manifest.workflows.length === 1 ? "workflow" : "workflows"} ·{" "}
                    {(built.manifest.agents[0]?.bindings.length ?? 0) === 1 ? "1 connected variable" : `${built.manifest.agents[0]?.bindings.length ?? 0} connected variables`}
                  </p>
                </div>
              </div>
              {built.notes.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-foreground">
                  {built.notes.map((n) => (
                    <li key={n} className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                      {n}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                {editing
                  ? "Saving replaces this kit's description and walkthrough. Installs already made are not changed."
                  : `Saving publishes it to ${orgName}: every member can see it and install it into an organization they set. It copies your example rows into the ${KIT_WORD.oneLower} as they are now; your tables and agent are not changed. Only you can edit or unpublish it.`}
              </p>
              {saveError && <ErrorNotice title="It was not saved." error={saveError} />}
            </div>
          ) : null}
        </div>

        {!savedKey && org.organizationState === "ready" && (
          <DialogFooter className="gap-2">
            {index > 0 && (
              <Button variant="ghost" onClick={() => setStep(steps[index - 1]!.id)} disabled={saving}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back
              </Button>
            )}
            {step !== "review" ? (
              <Button onClick={() => setStep(steps[index + 1]!.id)} disabled={!canNext}>
                Next
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={() => void save()} disabled={saving || !details.name.trim()}>
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                {editing ? "Save changes" : `Save for ${orgName}`}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
