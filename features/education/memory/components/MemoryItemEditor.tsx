"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { MNEMONIC_TECHNIQUES, type MemoryAidPayload } from "@/features/content-ir/kinds/memory-aid";
import type { MemoryItemKind } from "@/components/mardown-display/blocks/memory-aid/MemoryAidBlock";

export function MemoryItemEditor({ aid, kind, index, onChange, onSave, onCancel, saving, error }: {
  aid: MemoryAidPayload;
  kind: MemoryItemKind;
  index: number;
  onChange: (aid: MemoryAidPayload) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const mnemonic = kind === "mnemonic" ? aid.mnemonics[index] : undefined;
  const analogy = kind === "analogy" ? aid.analogies[index] : undefined;
  const locus = kind === "locus" ? aid.memory_palace.loci[index] : undefined;
  const updateMnemonic = (patch: Partial<NonNullable<typeof mnemonic>>) => onChange({
    ...aid, mnemonics: aid.mnemonics.map((item, at) => at === index ? { ...item, ...patch } : item),
  });
  const updateAnalogy = (patch: Partial<NonNullable<typeof analogy>>) => onChange({
    ...aid, analogies: aid.analogies.map((item, at) => at === index ? { ...item, ...patch } : item),
  });
  const updateLocus = (patch: Partial<NonNullable<typeof locus>>) => onChange({
    ...aid, memory_palace: { ...aid.memory_palace,
      loci: aid.memory_palace.loci.map((item, at) => at === index ? { ...item, ...patch } : item) },
  });

  return <div className="min-w-0 flex-1 space-y-3 matrx-touch-targets" aria-label={`Edit ${kind} ${index + 1}`}>
    {mnemonic && <>
      <TextField label="Material to remember" value={mnemonic.target} onChange={(target) => updateMnemonic({ target })} />
      <div className="space-y-1"><Label htmlFor={`inline-technique-${index}`}>Technique</Label>
        <select id={`inline-technique-${index}`} className="h-10 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm" value={mnemonic.technique} onChange={(event) => updateMnemonic({ technique: event.target.value as typeof mnemonic.technique })}>
          {MNEMONIC_TECHNIQUES.map((technique) => <option key={technique} value={technique}>{technique}</option>)}
        </select>
      </div>
      <TextField label="Memory device" value={mnemonic.device} onChange={(device) => updateMnemonic({ device })} />
      <TextField label="Explanation" value={mnemonic.explanation ?? ""} onChange={(explanation) => updateMnemonic({ explanation })} multiline />
    </>}
    {analogy && <>
      <TextField label="Concept" value={analogy.concept} onChange={(concept) => updateAnalogy({ concept })} />
      <TextField label="Analogy" value={analogy.analogy} onChange={(value) => updateAnalogy({ analogy: value })} />
      <TextField label="How they match" value={analogy.mapping ?? ""} onChange={(mapping) => updateAnalogy({ mapping })} multiline />
    </>}
    {locus && <>
      {index === 0 && <TextField label="Journey setting" value={aid.memory_palace.theme ?? ""} onChange={(theme) => onChange({ ...aid, memory_palace: { ...aid.memory_palace, theme } })} />}
      <TextField label="Place" value={locus.place} onChange={(place) => updateLocus({ place })} />
      <TextField label="What to remember" value={locus.item} onChange={(item) => updateLocus({ item })} />
      <TextField label="Image" value={locus.image ?? ""} onChange={(image) => updateLocus({ image })} multiline />
    </>}
    {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">{error}<ErrorAlchemyMenu error={error} /></p>}
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={onCancel}>Cancel</Button>
      <Button type="button" size="sm" disabled={saving} onClick={onSave}>{saving ? "Saving…" : "Save"}</Button>
    </div>
  </div>;
}

function TextField({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return <div className="space-y-1"><Label>{label}
    {multiline
      ? <ProTextarea className="mt-1" value={value} onChange={(event) => onChange(event.target.value)} />
      : <Input className="mt-1" value={value} onChange={(event) => onChange(event.target.value)} />}
  </Label></div>;
}
