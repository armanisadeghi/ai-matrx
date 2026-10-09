"use client";

/**
 * Brand fundamentals editors (Brand Home → Messaging, Claims & compliance).
 * Both write ONLY their own keys into `web.brand.profile` through
 * `mergeBrandProfile`, so every other profile key survives the save.
 */

import { useState, type ReactNode } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@ai-matrx/design-system/controls";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import { useBrand, useUpdateBrand } from "@/features/marketing/data/hooks";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import {
  HASHTAG_USES,
  mergeBrandProfile,
  parseBrandProfile,
  type BrandHashtag,
  type BrandProfile,
  type ContentPillar,
  type MarketingBrand,
  type MessagingPillar,
} from "@/features/marketing/types";
import { extractErrorMessage } from "@/utils/errors";

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function PageFrame({
  title,
  hint,
  busy,
  dirty,
  onSave,
  children,
}: {
  title: string;
  hint: string;
  busy: boolean;
  dirty: boolean;
  onSave: () => void;
  children: ReactNode;
}) {
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto w-full max-w-4xl px-3 pb-10 pt-[calc(var(--shell-header-h)+1rem)] sm:px-4">
        <header className="mb-3 flex items-center justify-between gap-3">
          <h1 className="text-base font-semibold text-foreground" title={hint}>
            {title}
          </h1>
          <Button
            variant="primary"
            disabled={busy || !dirty}
            icon={busy ? <Loader2 className="animate-spin" /> : null}
            onClick={onSave}
          >
            Save
          </Button>
        </header>
        <div className="grid gap-3">{children}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs" title={hint}>
        {label}
      </Label>
      {children}
    </div>
  );
}

function Text({
  value,
  onChange,
  rows = 2,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  label: string;
}) {
  return (
    <ProTextarea
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="text-base sm:text-sm"
    />
  );
}

function useProfileSave(brand: MarketingBrand) {
  const update = useUpdateBrand();
  const save = async (edited: BrandProfile) => {
    try {
      await update.mutateAsync({
        brandId: brand.id,
        expectedVersion: brand.version,
        patch: { profile: mergeBrandProfile(brand.profile, edited) },
      });
      toast.success("Saved");
    } catch (error) {
      toast.error("Could not save", { description: extractErrorMessage(error) });
    }
  };
  return { save, busy: update.isPending };
}

/** Loads the brand, then remounts the editor per stored version so the draft restarts clean. */
function WithBrand({ brandId, render }: { brandId: string; render: (brand: MarketingBrand) => ReactNode }) {
  const brand = useBrand(brandId);
  if (!brand.data) return <LoadingSurface label="Loading brand…" />;
  return <div key={brand.data.version} className="contents">{render(brand.data)}</div>;
}

// ── Messaging ────────────────────────────────────────────────────────────

export function BrandMessagingPage({ brandId }: { brandId: string }) {
  return <WithBrand brandId={brandId} render={(brand) => <MessagingEditor brand={brand} />} />;
}

function MessagingEditor({ brand }: { brand: MarketingBrand }) {
  const stored = parseBrandProfile(brand.profile);
  const { save, busy } = useProfileSave(brand);
  const [mission, setMission] = useState(stored.mission ?? "");
  const [vision, setVision] = useState(stored.vision ?? "");
  const [story, setStory] = useState(stored.story ?? "");
  const [values, setValues] = useState((stored.values ?? []).join("\n"));
  const [pitches, setPitches] = useState({
    ten_second: stored.elevator_pitches?.ten_second ?? "",
    thirty_second: stored.elevator_pitches?.thirty_second ?? "",
    sixty_second: stored.elevator_pitches?.sixty_second ?? "",
  });
  const [pillars, setPillars] = useState<Array<{ title: string; proof: string }>>(
    (stored.messaging_pillars ?? []).map((p) => ({ title: p.title, proof: p.proof_points.join("\n") })),
  );
  const [content, setContent] = useState<ContentPillar[]>(
    (stored.content_pillars ?? []).map((p) => ({ name: p.name, description: p.description ?? "" })),
  );
  const [tags, setTags] = useState<BrandHashtag[]>(stored.hashtags ?? []);

  const edited: BrandProfile = {
    ...stored,
    mission: mission.trim() || undefined,
    vision: vision.trim() || undefined,
    story: story.trim() || undefined,
    values: lines(values),
    elevator_pitches: {
      ten_second: pitches.ten_second.trim() || undefined,
      thirty_second: pitches.thirty_second.trim() || undefined,
      sixty_second: pitches.sixty_second.trim() || undefined,
    },
    messaging_pillars: pillars.map(
      (p): MessagingPillar => ({ title: p.title, proof_points: lines(p.proof) }),
    ),
    content_pillars: content,
    hashtags: tags,
  };
  const cleaned = parseBrandProfile(mergeBrandProfile(brand.profile, edited));
  const dirty = JSON.stringify(cleaned) !== JSON.stringify(stored);

  return (
    <PageFrame
      title={`${brand.name} · Messaging`}
      hint="What the brand stands for and how it says it"
      busy={busy}
      dirty={dirty}
      onSave={() => void save(edited)}
    >
      <Card className="grid gap-3 p-4 sm:grid-cols-2">
        <Field label="Mission" hint="Why the brand exists, today">
          <Text label="Mission" value={mission} onChange={setMission} rows={3} />
        </Field>
        <Field label="Vision" hint="What the world looks like if it succeeds">
          <Text label="Vision" value={vision} onChange={setVision} rows={3} />
        </Field>
        <Field label="Values (one per line)">
          <Text label="Values" value={values} onChange={setValues} rows={4} />
        </Field>
        <Field label="Brand story">
          <Text label="Brand story" value={story} onChange={setStory} rows={4} />
        </Field>
      </Card>

      <Card className="grid gap-3 p-4">
        <h2 className="text-sm font-medium text-foreground">Elevator pitches</h2>
        <Field label="10 seconds">
          <Text label="10 second pitch" value={pitches.ten_second} onChange={(v) => setPitches({ ...pitches, ten_second: v })} />
        </Field>
        <Field label="30 seconds">
          <Text label="30 second pitch" value={pitches.thirty_second} onChange={(v) => setPitches({ ...pitches, thirty_second: v })} rows={3} />
        </Field>
        <Field label="60 seconds">
          <Text label="60 second pitch" value={pitches.sixty_second} onChange={(v) => setPitches({ ...pitches, sixty_second: v })} rows={4} />
        </Field>
      </Card>

      <Card className="grid gap-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Messaging pillars</h2>
          <Button variant="quiet" icon={<Plus />} onClick={() => setPillars([...pillars, { title: "", proof: "" }])}>
            Add
          </Button>
        </div>
        {pillars.map((pillar, index) => (
          <div key={index} className="grid gap-2 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <Input
                aria-label="Pillar title"
                value={pillar.title}
                placeholder="Certified, documented destruction"
                onChange={(event) =>
                  setPillars(pillars.map((p, i) => (i === index ? { ...p, title: event.target.value } : p)))
                }
              />
              <Button variant="quiet" aria-label="Remove pillar" icon={<X />} onClick={() => setPillars(pillars.filter((_, i) => i !== index))} />
            </div>
            <Text
              label="Proof points, one per line"
              placeholder="Proof points, one per line"
              value={pillar.proof}
              rows={3}
              onChange={(v) => setPillars(pillars.map((p, i) => (i === index ? { ...p, proof: v } : p)))}
            />
          </div>
        ))}
      </Card>

      <Card className="grid gap-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Content pillars</h2>
          <Button variant="quiet" icon={<Plus />} onClick={() => setContent([...content, { name: "", description: "" }])}>
            Add
          </Button>
        </div>
        {content.map((pillar, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <Input
              aria-label="Content pillar name"
              value={pillar.name}
              placeholder="Compliance explained"
              onChange={(event) => setContent(content.map((p, i) => (i === index ? { ...p, name: event.target.value } : p)))}
            />
            <Input
              aria-label="Content pillar description"
              value={pillar.description ?? ""}
              placeholder="What this theme covers"
              onChange={(event) => setContent(content.map((p, i) => (i === index ? { ...p, description: event.target.value } : p)))}
            />
            <Button variant="quiet" aria-label="Remove content pillar" icon={<X />} onClick={() => setContent(content.filter((_, i) => i !== index))} />
          </div>
        ))}
      </Card>

      <Card className="grid gap-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Hashtags</h2>
          <Button variant="quiet" icon={<Plus />} onClick={() => setTags([...tags, { tag: "", use: "branded" }])}>
            Add
          </Button>
        </div>
        {tags.map((entry, index) => (
          <div key={index} className="grid grid-cols-[1fr_9rem_auto] gap-2">
            <Input
              aria-label="Hashtag"
              value={entry.tag}
              placeholder="#ShredItRight"
              onChange={(event) => setTags(tags.map((t, i) => (i === index ? { ...t, tag: event.target.value } : t)))}
            />
            <select
              aria-label="Hashtag use"
              value={entry.use}
              onChange={(event) =>
                setTags(tags.map((t, i) => (i === index ? { ...t, use: HASHTAG_USES.find((u) => u === event.target.value) ?? "branded" } : t)))
              }
              className="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground"
            >
              {HASHTAG_USES.map((use) => (
                <option key={use} value={use}>
                  {use[0].toUpperCase() + use.slice(1)}
                </option>
              ))}
            </select>
            <Button variant="quiet" aria-label="Remove hashtag" icon={<X />} onClick={() => setTags(tags.filter((_, i) => i !== index))} />
          </div>
        ))}
      </Card>
    </PageFrame>
  );
}

// ── Claims & compliance ──────────────────────────────────────────────────

export function BrandClaimsPage({ brandId }: { brandId: string }) {
  return <WithBrand brandId={brandId} render={(brand) => <ClaimsEditor brand={brand} />} />;
}

function ClaimsEditor({ brand }: { brand: MarketingBrand }) {
  const stored = parseBrandProfile(brand.profile);
  const { save, busy } = useProfileSave(brand);
  const [approved, setApproved] = useState((stored.approved_claims ?? []).join("\n"));
  const [forbidden, setForbidden] = useState((stored.forbidden_claims ?? []).join("\n"));
  const [disclaimers, setDisclaimers] = useState((stored.disclaimers ?? []).join("\n"));
  const edited: BrandProfile = {
    ...stored,
    approved_claims: lines(approved),
    forbidden_claims: lines(forbidden),
    disclaimers: lines(disclaimers),
  };
  const dirty =
    JSON.stringify([edited.approved_claims, edited.forbidden_claims, edited.disclaimers]) !==
    JSON.stringify([stored.approved_claims ?? [], stored.forbidden_claims ?? [], stored.disclaimers ?? []]);
  return (
    <PageFrame
      title={`${brand.name} · Claims`}
      hint="What may be said, what never may, and the legal wording that goes with it"
      busy={busy}
      dirty={dirty}
      onSave={() => void save(edited)}
    >
      <Card className="grid gap-3 p-4">
        <Field label="Approved claims (one per line)" hint="Statements the brand can make as written">
          <Text label="Approved claims" value={approved} onChange={setApproved} rows={5} />
        </Field>
        <Field label="Forbidden claims (one per line)" hint="Never say these, in any channel">
          <Text label="Forbidden claims" value={forbidden} onChange={setForbidden} rows={5} />
        </Field>
        <Field label="Disclaimers (one per line)" hint="Required wording to attach where it applies">
          <Text label="Disclaimers" value={disclaimers} onChange={setDisclaimers} rows={4} />
        </Field>
      </Card>
    </PageFrame>
  );
}
