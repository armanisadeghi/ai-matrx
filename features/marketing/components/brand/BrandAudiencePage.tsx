"use client";

/** Audience personas for one brand — list cards + editor over `web.brand_persona`. */

import { useState } from "react";
import { Loader2, Pencil, Plus, Star, Trash2, Users } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system/controls";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { LoadingSurface, QueryError } from "@/features/marketing/components/shared/MarketingUi";
import {
  useBrandPersonas,
  useCreateBrandPersona,
  useDeleteBrandPersona,
  useUpdateBrandPersona,
} from "@/features/marketing/data/personas";
import { brandKindCopy, type BrandKindCopy } from "@/features/marketing/lib/brand-kind";
import {
  personaFieldsFor,
  personaDemographics,
  type BrandPersona,
  type BrandPersonaValues,
  type PersonaDemographics,
} from "@/features/marketing/lib/persona-model";
import { extractErrorMessage } from "@/utils/errors";

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function BrandAudiencePage({
  brandId,
  brandName,
  brandKind,
  organizationId,
}: {
  brandId: string;
  brandName: string;
  brandKind?: string | null;
  organizationId: string;
}) {
  const audience = brandKindCopy(brandKind).audience;
  const Noun = audience.noun.charAt(0).toUpperCase() + audience.noun.slice(1);
  const personas = useBrandPersonas(brandId);
  const create = useCreateBrandPersona(brandId);
  const update = useUpdateBrandPersona(brandId);
  const remove = useDeleteBrandPersona(brandId);
  const [editing, setEditing] = useState<BrandPersona | "new" | null>(null);
  const rows = personas.data ?? [];

  const onSave = async (values: BrandPersonaValues) => {
    try {
      if (editing === "new") {
        await create.mutateAsync({
          organizationId,
          brandId,
          values,
          sort: rows.length ? Math.max(...rows.map((p) => p.sort)) + 1 : 0,
        });
      } else if (editing) {
        await update.mutateAsync({ persona: editing, values });
      }
      toast.success(`${Noun} saved`);
      setEditing(null);
    } catch (error) {
      toast.error(`Could not save ${audience.noun}`, { description: extractErrorMessage(error) });
    }
  };

  const onDelete = async (persona: BrandPersona) => {
    const ok = await confirm({
      title: `Remove "${persona.name}"?`,
      description: `It leaves this ${audience.noun} list and every agent's brand context.`,
      variant: "destructive",
      confirmLabel: "Remove",
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(persona.id);
      toast.success(`Removed ${persona.name}`);
    } catch (error) {
      toast.error(`Could not remove ${audience.noun}`, { description: extractErrorMessage(error) });
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto w-full max-w-5xl px-3 pb-10 pt-[calc(var(--shell-header-h)+1rem)] sm:px-4">
        <header className="mb-3 flex items-center justify-between gap-3">
          <h1
            className="text-base font-semibold text-foreground"
            title="Who this brand sells to, so every brief and agent writes for a named audience"
          >
            {brandName} · Audience
          </h1>
          <Button variant="primary" icon={<Plus />} onClick={() => setEditing("new")}>
            {Noun}
          </Button>
        </header>

        {personas.isPending ? (
          <LoadingSurface label={`Loading ${audience.plural}…`} />
        ) : personas.isError ? (
          <QueryError error={personas.error} onRetry={() => void personas.refetch()} />
        ) : rows.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 p-8 text-center">
            <Users className="h-5 w-5 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">No {audience.plural} yet.</p>
            <Button variant="quiet" icon={<Plus />} onClick={() => setEditing("new")}>
              Add the first {audience.noun}
            </Button>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((persona) => (
              <PersonaCard
                key={persona.id}
                persona={persona}
                onEdit={() => setEditing(persona)}
                onDelete={() => void onDelete(persona)}
              />
            ))}
          </div>
        )}
      </div>

      {editing ? (
        <PersonaDialog
          audience={audience}
          kind={brandKind}
          persona={editing === "new" ? null : editing}
          busy={create.isPending || update.isPending}
          onCancel={() => setEditing(null)}
          onSave={(values) => void onSave(values)}
        />
      ) : null}
    </div>
  );
}

function ChipList({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <ul className="mt-0.5 list-disc pl-4 text-xs text-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function PersonaCard({
  persona,
  onEdit,
  onDelete,
}: {
  persona: BrandPersona;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const demographics = Object.values(personaDemographics(persona));
  return (
    <Card className="grid content-start gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            {persona.name}
            {persona.is_primary ? <Star className="h-3.5 w-3.5 fill-current text-primary-ink" aria-label="Primary" /> : null}
          </h2>
          {demographics.length ? (
            <p className="text-xs text-muted-foreground">{demographics.join(" · ")}</p>
          ) : null}
        </div>
        <div className="flex shrink-0">
          <Button variant="quiet" aria-label={`Edit ${persona.name}`} icon={<Pencil />} onClick={onEdit} />
          <Button variant="quiet" aria-label={`Remove ${persona.name}`} icon={<Trash2 />} onClick={onDelete} />
        </div>
      </div>
      {persona.summary ? <p className="text-xs leading-relaxed text-foreground">{persona.summary}</p> : null}
      <ChipList label="Goals" items={persona.goals} />
      <ChipList label="Pain points" items={persona.pain_points} />
      <ChipList label="Objections" items={persona.objections} />
      {persona.channels.length ? (
        <p className="text-xs text-muted-foreground">Channels: {persona.channels.join(", ")}</p>
      ) : null}
    </Card>
  );
}

function PersonaDialog({
  audience,
  kind,
  persona,
  busy,
  onCancel,
  onSave,
}: {
  audience: BrandKindCopy["audience"];
  kind?: string | null;
  persona: BrandPersona | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (values: BrandPersonaValues) => void;
}) {
  const [name, setName] = useState(persona?.name ?? "");
  const [summary, setSummary] = useState(persona?.summary ?? "");
  const [demographics, setDemographics] = useState<PersonaDemographics>(persona ? personaDemographics(persona) : {});
  const [goals, setGoals] = useState((persona?.goals ?? []).join("\n"));
  const [pains, setPains] = useState((persona?.pain_points ?? []).join("\n"));
  const [objections, setObjections] = useState((persona?.objections ?? []).join("\n"));
  const [channels, setChannels] = useState((persona?.channels ?? []).join("\n"));
  const [primary, setPrimary] = useState(persona?.is_primary ?? false);

  return (
    <Dialog open onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <DialogContent className="matrx-touch-targets flex max-h-[85dvh] max-w-xl flex-col overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle className="text-base">{persona ? `Edit ${persona.name}` : `New ${audience.noun}`}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Name</Label>
            <Input autoFocus aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder={audience.namePlaceholder} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Summary</Label>
            <ProTextarea aria-label="Summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className="text-base sm:text-sm" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {personaFieldsFor(kind).map((field) => (
              <div key={field.key} className="grid gap-1.5">
                <Label className="text-xs">{field.label}</Label>
                <Input
                  aria-label={field.label}
                  value={demographics[field.key] ?? ""}
                  placeholder={field.placeholder}
                  onChange={(e) => setDemographics({ ...demographics, [field.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
          {(
            [
              ["Goals (one per line)", goals, setGoals],
              ["Pain points (one per line)", pains, setPains],
              ["Objections (one per line)", objections, setObjections],
              ["Channels (one per line)", channels, setChannels],
            ] as const
          ).map(([label, value, set]) => (
            <div key={label} className="grid gap-1.5">
              <Label className="text-xs">{label}</Label>
              <ProTextarea aria-label={label} value={value} onChange={(e) => set(e.target.value)} rows={3} className="text-base sm:text-sm" />
            </div>
          ))}
          <label className="matrx-tap-area flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} />
            Primary {audience.noun}
          </label>
        </div>
        <DialogFooter className="pb-safe">
          <Button variant="quiet" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={busy ? <Loader2 className="animate-spin" /> : null}
            disabled={busy || !name.trim()}
            onClick={() =>
              onSave({
                name: name.trim(),
                summary,
                demographics,
                goals: lines(goals),
                pain_points: lines(pains),
                objections: lines(objections),
                channels: lines(channels),
                is_primary: primary,
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
