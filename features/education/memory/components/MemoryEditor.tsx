"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Label } from "@/components/ui/label";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import { coerceMemoryAidPartial, MNEMONIC_TECHNIQUES, type MemoryAidPayload } from "@/features/content-ir/kinds/memory-aid";
import { studyMediaService } from "@/features/education/media/service";
import type { StudyMediaRow } from "@/features/education/media/types";
import { parseMemoryAid } from "../memoryWrites";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationMemoryScope } from "@/features/surfaces/manifests/education-memory.manifest";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { collectionWriteHandlers } from "@/features/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import { parseCreateMemoryAids, parseMemoryIds, parseUpdateMemoryAids } from "../memoryWrites";

const SURFACE_NAME = "matrx-user/education-memory";
const blank = (): MemoryAidPayload => ({
  __kind: "memory_aid", title: "", strategy_note: "", mnemonics: [], analogies: [],
  memory_palace: { __kind: "memory_palace", applicable: false, theme: "", loci: [] },
});

export function MemoryEditor({ media, isOwner = false }: { media?: StudyMediaRow; isOwner?: boolean }) {
  const router = useRouter();
  const [currentMedia, setCurrentMedia] = useState(media);
  const [aid, setAid] = useState<MemoryAidPayload>(() => media ? coerceMemoryAidPartial(media.ir_envelope) : blank());
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const update = (patch: Partial<MemoryAidPayload>) => setAid((current) => ({ ...current, ...patch }));
  const getScope = () => createEducationMemoryScope({
    view: currentMedia ? "detail" : "new", aid_loaded: !!currentMedia, aid_id: currentMedia?.id,
    aid_title: aid.title, aid_is_owner: isOwner, aid_content: aid as unknown as Record<string, unknown>,
    mnemonics: aid.mnemonics, analogies: aid.analogies,
    memory_palace: aid.memory_palace as unknown as Record<string, unknown>,
  });
  const getWriteHandlers = () => collectionWriteHandlers({
    plural: "memory_aids", singular: "memory aid",
    create: {
      parse: parseCreateMemoryAids,
      run: async (content) => {
        const result = await studyMediaService.create({ mediaKind: "memory_aid", title: content.title,
          irEnvelope: content, status: "ready" });
        if (result.error || !result.data) throw new Error(result.error ?? "Could not create memory aid.");
        return { id: result.data.id, name: result.data.title };
      }, nameOf: (content) => content.title,
    },
    update: currentMedia ? {
      parse: (value) => parseUpdateMemoryAids(value, [currentMedia]),
      run: async (plan) => {
        const result = await studyMediaService.updateVersioned(plan.id, plan.version, { title: plan.aid.title, ir_envelope: plan.aid });
        if (result.error || !result.data) throw new Error(result.error ?? "Could not update memory aid.");
        setAid(plan.aid);
        setCurrentMedia(result.data);
        return { id: result.data.id, name: result.data.title };
      }, nameOf: (plan) => plan.aid.title, changedOf: (plan) => plan.changed,
    } : undefined,
    delete: currentMedia && isOwner ? {
      parse: (value) => parseMemoryIds(value, "delete_memory_aids", [currentMedia]).map(() => currentMedia),
      run: async (row) => {
        const result = await studyMediaService.softDelete(row.id);
        if (result.error) throw new Error(result.error);
        router.push("/education/memory");
        return { id: row.id, name: row.title };
      }, nameOf: (row) => row.title,
    } : undefined,
  }, refuseSurfaceWrite);

  async function save() {
    let clean: MemoryAidPayload;
    try { clean = parseMemoryAid(aid); }
    catch (error) { const message = error instanceof Error ? error.message : "Check your memory aid."; setErrorMessage(message); toast.error(message); return; }
    setErrorMessage(null);
    setSaving(true);
    const result = currentMedia
      ? await studyMediaService.updateVersioned(currentMedia.id, currentMedia.version, { title: clean.title, ir_envelope: clean })
      : await studyMediaService.create({
          mediaKind: "memory_aid", title: clean.title, irEnvelope: clean, status: "ready",
        });
    setSaving(false);
    if (result.error || !result.data) { const message = result.error ?? "Could not save memory aid."; setErrorMessage(message); toast.error(message); return; }
    toast.success(media ? "Memory aid saved" : "Memory aid created");
    router.push(`/education/memory/${result.data.id}`);
    router.refresh();
  }

  return <SurfaceRuntimeProvider surfaceName={SURFACE_NAME} getScope={getScope} getWriteHandlers={getWriteHandlers}>
    <EducationToolHeader title={media ? "Edit memory aid" : "New memory aid"} />
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-20 pt-4">
      <div className="space-y-2">
        <Label htmlFor="memory-title">Title</Label>
        <Input id="memory-title" value={aid.title} onChange={(event) => update({ title: event.target.value })} data-surface-value="aid_title" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="memory-strategy">How to use these aids</Label>
        <ProTextarea id="memory-strategy" value={aid.strategy_note ?? ""} onChange={(event) => update({ strategy_note: event.target.value })} />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-base font-semibold">Mnemonics</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => update({ mnemonics: [...aid.mnemonics, { __kind: "mnemonic", technique: "sentence", target: "", device: "", explanation: "" }] })}><Plus className="mr-1 h-4 w-4" />Add mnemonic</Button></div>
        {aid.mnemonics.map((row, i) => <div key={i} className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between"><span className="text-sm font-medium">Mnemonic {i + 1}</span><Button type="button" variant="ghost" size="icon" aria-label={`Remove mnemonic ${i + 1}`} onClick={() => update({ mnemonics: aid.mnemonics.filter((_, n) => n !== i) })}><Trash2 className="h-4 w-4" /></Button></div>
          <Field label="Material to remember" value={row.target} onChange={(value) => update({ mnemonics: aid.mnemonics.map((item, n) => n === i ? { ...item, target: value } : item) })} />
          <div className="space-y-1"><Label htmlFor={`technique-${i}`}>Technique</Label><select id={`technique-${i}`} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={row.technique} onChange={(event) => update({ mnemonics: aid.mnemonics.map((item, n) => n === i ? { ...item, technique: event.target.value as typeof item.technique } : item) })}>{MNEMONIC_TECHNIQUES.map((technique) => <option key={technique} value={technique}>{technique}</option>)}</select></div>
          <Field label="Memory device" value={row.device} onChange={(value) => update({ mnemonics: aid.mnemonics.map((item, n) => n === i ? { ...item, device: value } : item) })} />
          <Field label="Explanation" value={row.explanation ?? ""} onChange={(value) => update({ mnemonics: aid.mnemonics.map((item, n) => n === i ? { ...item, explanation: value } : item) })} />
        </div>)}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-base font-semibold">Analogies</h2><Button type="button" variant="outline" size="sm" onClick={() => update({ analogies: [...aid.analogies, { __kind: "analogy", concept: "", analogy: "", mapping: "" }] })}><Plus className="mr-1 h-4 w-4" />Add analogy</Button></div>
        {aid.analogies.map((row, i) => <div key={i} className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between"><span className="text-sm font-medium">Analogy {i + 1}</span><Button type="button" variant="ghost" size="icon" aria-label={`Remove analogy ${i + 1}`} onClick={() => update({ analogies: aid.analogies.filter((_, n) => n !== i) })}><Trash2 className="h-4 w-4" /></Button></div>
          {(["concept", "analogy", "mapping"] as const).map((key) => <Field key={key} label={key === "mapping" ? "How they match" : key[0].toUpperCase() + key.slice(1)} value={row[key] ?? ""} onChange={(value) => update({ analogies: aid.analogies.map((item, n) => n === i ? { ...item, [key]: value } : item) })} />)}
        </div>)}
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between"><h2 className="text-base font-semibold">Memory palace</h2><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={aid.memory_palace.applicable} onChange={(event) => update({ memory_palace: { ...aid.memory_palace, applicable: event.target.checked } })} />Use a palace</label></div>
        {aid.memory_palace.applicable && <>
          <Field label="Journey setting" value={aid.memory_palace.theme ?? ""} onChange={(value) => update({ memory_palace: { ...aid.memory_palace, theme: value } })} />
          {aid.memory_palace.loci.map((row, i) => <div key={i} className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between"><span className="text-sm font-medium">Stop {i + 1}</span><Button type="button" variant="ghost" size="icon" aria-label={`Remove stop ${i + 1}`} onClick={() => update({ memory_palace: { ...aid.memory_palace, loci: aid.memory_palace.loci.filter((_, n) => n !== i) } })}><Trash2 className="h-4 w-4" /></Button></div>
            {(["place", "item", "image"] as const).map((key) => <Field key={key} label={key[0].toUpperCase() + key.slice(1)} value={row[key] ?? ""} onChange={(value) => update({ memory_palace: { ...aid.memory_palace, loci: aid.memory_palace.loci.map((item, n) => n === i ? { ...item, [key]: value } : item) } })} />)}
          </div>)}
          <Button type="button" variant="outline" size="sm" onClick={() => update({ memory_palace: { ...aid.memory_palace, loci: [...aid.memory_palace.loci, { __kind: "locus", place: "", item: "", image: "" }] } })}><Plus className="mr-1 h-4 w-4" />Add stop</Button>
        </>}
      </section>

      {errorMessage && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{errorMessage}<ErrorAlchemyMenu error={errorMessage} /></p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button><Button type="button" disabled={saving} onClick={save}>{saving ? "Saving…" : media ? "Save changes" : "Create memory aid"}</Button></div>
    </main>
  </SurfaceRuntimeProvider>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-1"><Label>{label}<Input className="mt-1" value={value} onChange={(event) => onChange(event.target.value)} /></Label></div>;
}
