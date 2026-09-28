"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { toast } from "@/lib/toast";
import { studyMediaService } from "@/features/education/media/service";
import type { StudyMediaRow } from "@/features/education/media/types";
import { blankMindMap, parseMindMap, trustAfterMindMapEdit, type MindMapEnvelope } from "../mindMapWrites";

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export function MindMapEditor({ media }: { media?: StudyMediaRow }) {
  const router = useRouter();
  const [draft, setDraft] = useState<MindMapEnvelope>(() => media ? parseMindMap(media.ir_envelope) : blankMindMap());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<MindMapEnvelope>) => setDraft((current) => ({ ...current, ...patch }));

  function updateNode(index: number, patch: Record<string, unknown>) {
    update({ nodes: draft.nodes.map((node, position) => position === index ? { ...node, ...patch } : node) });
  }
  function updateEdge(index: number, patch: Record<string, unknown>) {
    update({ edges: draft.edges.map((edge, position) => position === index ? { ...edge, ...patch } : edge) });
  }
  async function save() {
    let clean: MindMapEnvelope;
    try { clean = parseMindMap(draft); }
    catch (caught) {
      const message = caught instanceof Error ? caught.message : "Check the mind map.";
      setError(message); toast.error(message); return;
    }
    setSaving(true); setError(null);
    const result = media
      ? await studyMediaService.updateVersioned(media.id, media.version, { title: clean.title, ir_envelope: clean, trust: trustAfterMindMapEdit(media.trust) })
      : await studyMediaService.create({ mediaKind: "mind_map", title: clean.title, irEnvelope: clean, diagramKind: "diagram_spec", status: "ready" });
    setSaving(false);
    if (result.error || !result.data) {
      const message = result.error ?? "Could not save the mind map.";
      setError(message); toast.error(message); return;
    }
    toast.success(media ? "Mind map saved" : "Mind map created");
    router.push(`/education/mind-maps/${result.data.id}`); router.refresh();
  }
  return <>
    <EducationToolHeader title={media ? "Edit mind map" : "Write a mind map"} />
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 pb-20 pt-4">
      <section className="space-y-2"><Label htmlFor="mind-map-title">Title</Label><Input id="mind-map-title" value={draft.title} onChange={(event) => update({ title: event.target.value })} /></section>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2"><div><h2 className="text-base font-semibold">Concepts</h2><p className="text-sm text-muted-foreground">Add the ideas people should see in the map.</p></div><Button type="button" size="sm" variant="outline" onClick={() => update({ nodes: [...draft.nodes, { __kind: "diagram_node", id: newId("node"), label: "", description: "", details: "" }] })}><Plus className="mr-1 h-4 w-4" />Add concept</Button></div>
        {draft.nodes.map((node, index) => <div key={String(node.id)} className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
          <Field label="Concept" value={stringValue(node.label)} onChange={(value) => updateNode(index, { label: value })} />
          <Field label="ID" value={stringValue(node.id)} onChange={(value) => updateNode(index, { id: value })} />
          <Field label="Short explanation" value={stringValue(node.description)} onChange={(value) => updateNode(index, { description: value })} />
          <Field label="Details" value={stringValue(node.details)} onChange={(value) => updateNode(index, { details: value })} />
          <Button type="button" variant="ghost" className="justify-self-start text-destructive hover:text-destructive" onClick={() => update({ nodes: draft.nodes.filter((_, position) => position !== index), edges: draft.edges.filter((edge) => edge.source !== node.id && edge.target !== node.id) })}><Trash2 className="mr-1 h-4 w-4" />Delete concept</Button>
        </div>)}
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2"><div><h2 className="text-base font-semibold">Connections</h2><p className="text-sm text-muted-foreground">Show how two concepts relate.</p></div><Button type="button" size="sm" variant="outline" disabled={draft.nodes.length < 2} onClick={() => update({ edges: [...draft.edges, { __kind: "diagram_edge", id: newId("edge"), source: stringValue(draft.nodes[0]?.id), target: stringValue(draft.nodes[1]?.id), label: "" }] })}><Plus className="mr-1 h-4 w-4" />Add connection</Button></div>
        {draft.edges.map((edge, index) => <div key={String(edge.id)} className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
          <Field label="Connection label" value={stringValue(edge.label)} onChange={(value) => updateEdge(index, { label: value })} />
          <Field label="Connection ID" value={stringValue(edge.id)} onChange={(value) => updateEdge(index, { id: value })} />
          <NodeChoice label="From" value={stringValue(edge.source)} nodes={draft.nodes} onChange={(value) => updateEdge(index, { source: value })} />
          <NodeChoice label="To" value={stringValue(edge.target)} nodes={draft.nodes} onChange={(value) => updateEdge(index, { target: value })} />
          <Button type="button" variant="ghost" className="justify-self-start text-destructive hover:text-destructive" onClick={() => update({ edges: draft.edges.filter((_, position) => position !== index) })}><Trash2 className="mr-1 h-4 w-4" />Delete connection</Button>
        </div>)}
      </section>
      {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}<ErrorAlchemyMenu error={error} /></p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button><Button type="button" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : media ? "Save changes" : "Create mind map"}</Button></div>
    </main>
  </>;
}

function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <Label className="space-y-1"><span>{label}</span><Input value={value} onChange={(event) => onChange(event.target.value)} /></Label>; }
function NodeChoice({ label, value, nodes, onChange }: { label: string; value: string; nodes: JsonRecord[]; onChange: (value: string) => void }) { return <Label className="space-y-1"><span>{label}</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>{nodes.map((node) => <option key={String(node.id)} value={stringValue(node.id)}>{stringValue(node.label) || stringValue(node.id)}</option>)}</select></Label>; }
type JsonRecord = Record<string, unknown>;
