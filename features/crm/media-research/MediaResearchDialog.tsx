"use client";

// features/crm/media-research/MediaResearchDialog.tsx
//
// "Find journalists for this angle" on an outreach list:
//   the angle form → the preview card (multiplier and why, brief, target, max
//   cost; nothing spent) → "Run it" → streamed progress (named journalists as
//   they arrive, the table filling as batches are judged) → the result table and
//   the cuts. Results land on the list deduplicated (fits and soft fits only).
//
// The run keeps going on the server if this dialog closes; the answer is stored
// on the list, and previewing the same campaign again shows it instead of
// starting a second job.

import { useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProTextarea } from "@/components/official/ProTextarea";
import { useAppDispatch } from "@/lib/redux/hooks";
import { recordAdvisoryGoAhead, type AdvisoryOffer } from "@/features/crm/pitch-advisories/service";
import { MediaResearchPreviewCard } from "./MediaResearchPreviewCard";
import { MediaResearchResults, ResearchTable } from "./MediaResearchResults";
import {
  previewMediaResearch,
  runMediaResearch,
  type MediaResearchPreview,
  type MediaResearchProgressData,
  type MediaResearchRequest,
  type MediaResearchResultData,
  type MediaResearchRow,
} from "./service";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
/** What a caller already knows about the angle (a Press Room story angle). Every field stays editable. */
export interface MediaResearchPrefill {
  angle?: string;
  standing?: string;
  reporterShape?: string;
  subAngles?: string[];
  competitors?: string[];
  regions?: string[];
  /** Where the prefill came from, said above the form ("From the story angle “…”"). */
  sourceLabel?: string;
}

export interface MediaResearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string;
  listName: string;
  organizationId: string;
  onLanded?: () => void;
  prefill?: MediaResearchPrefill;
}

function lines(text: string): string[] {
  return text
    .split(/\n|;/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
}

export function MediaResearchDialog({
  open,
  onOpenChange,
  listId,
  listName,
  organizationId,
  onLanded,
  prefill,
}: MediaResearchDialogProps) {
  const dispatch = useAppDispatch();
  const [angle, setAngle] = useState(prefill?.angle ?? "");
  const [wanted, setWanted] = useState("10");
  const [narrow, setNarrow] = useState(false);
  const [narrowReason, setNarrowReason] = useState("");
  const [standing, setStanding] = useState(prefill?.standing ?? "");
  const [shape, setShape] = useState(prefill?.reporterShape ?? "");
  const [subAngles, setSubAngles] = useState((prefill?.subAngles ?? []).join("\n"));
  const [competitors, setCompetitors] = useState((prefill?.competitors ?? []).join("\n"));
  const [regions, setRegions] = useState((prefill?.regions ?? []).join("\n"));
  const [override, setOverride] = useState<number | null>(null);
  const [splitAngles, setSplitAngles] = useState<{ angle: string; wanted_good_fits: number }[]>([]);

  const [preview, setPreview] = useState<MediaResearchPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<MediaResearchProgressData | null>(null);
  const [profiles, setProfiles] = useState<{ name: string; outlet?: string | null }[]>([]);
  const [liveRows, setLiveRows] = useState<MediaResearchRow[]>([]);
  const [result, setResult] = useState<MediaResearchResultData | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const buildRequest = (targetOverride: number | null = override): MediaResearchRequest => ({
    angle: angle.trim(),
    wanted_good_fits: Math.max(1, Number.parseInt(wanted, 10) || 1),
    narrow_beat: narrow,
    narrow_reason: narrow ? narrowReason.trim() || null : null,
    standing: standing.trim() || null,
    reporter_shape: shape.trim() || null,
    sub_angles: lines(subAngles),
    competitors: lines(competitors),
    regions: lines(regions),
    research_target_override: targetOverride,
  });

  const runPreview = async (targetOverride: number | null = override) => {
    if (angle.trim().length < 3) {
      setError("Write the angle first — the story you want journalists for.");
      return;
    }
    setPreviewing(true);
    setError(null);
    setResult(null);
    try {
      setPreview(await previewMediaResearch(organizationId, listId, buildRequest(targetOverride)));
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "The preview could not be made.");
    } finally {
      setPreviewing(false);
    }
  };

  const onOffer = (offer: AdvisoryOffer) => {
    if (offer.action === "limit_to" && typeof offer.detail?.count === "number") {
      const cap = offer.detail.count;
      setOverride(cap);
      void runPreview(cap);
      return;
    }
    if (offer.action === "split_angles") {
      const angles = Array.isArray(offer.detail?.angles)
        ? (offer.detail.angles as { angle: string; wanted_good_fits: number }[])
        : [];
      if (angles.length === 0) {
        setError(
          "Add the beats to split by under “Sub-angles” (one per line), then preview again — each beat becomes its own angle under the cap.",
        );
        return;
      }
      setSplitAngles(angles);
      setPreview(null);
    }
  };

  const chooseSplit = (choice: { angle: string; wanted_good_fits: number }) => {
    setAngle(choice.angle);
    setWanted(String(choice.wanted_good_fits));
    setSubAngles("");
    setOverride(null);
    setSplitAngles([]);
    setPreview(null);
  };

  const run = async () => {
    if (!preview) return;
    const request = buildRequest();
    if (preview.over_cap) {
      // The person saw the strong warning and went ahead — recorded, never blocked.
      void recordAdvisoryGoAhead({
        organizationId,
        surface: "list_save",
        entityType: "crm_outreach_list",
        entityId: listId,
        advisories: preview.advisories ?? [],
      });
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setProgress(null);
    setProfiles([]);
    setLiveRows([]);
    setResult(null);
    try {
      await runMediaResearch(dispatch, {
        organizationId,
        listId,
        request,
        preview,
        confirmedOverCap: preview.over_cap,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.kind === "progress") {
            setProgress(event.data);
            const fresh = event.data.new_profiles ?? [];
            if (fresh.length) setProfiles((prev) => [...prev, ...fresh].slice(-40));
            const rows = event.data.rows ?? [];
            if (rows.length) setLiveRows((prev) => [...prev, ...rows]);
          } else {
            setResult(event.data);
            onLanded?.();
          }
        },
      });
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : "The research run failed.");
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Find journalists for this angle</DialogTitle>
          <DialogDescription>
            For “{listName}”.{prefill?.sourceLabel ? ` ${prefill.sourceLabel} — check it, then preview.` : ""} You ask for good fits; we research more than that, judge every one
            against your angle, and put the fits on this list. You see the cost before anything is spent.
          </DialogDescription>
        </DialogHeader>

        {!result && !running && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="mr-angle">The angle</Label>
              <ProTextarea
                id="mr-angle"
                value={angle}
                onChange={(e) => {
                  setAngle(e.target.value);
                  setPreview(null);
                }}
                placeholder="e.g. Retired AI data-center hardware is a data-security problem, not only a toxics problem"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="mr-wanted">Good fits wanted</Label>
                <Input
                  id="mr-wanted"
                  inputMode="numeric"
                  value={wanted}
                  onChange={(e) => {
                    setWanted(e.target.value.replace(/[^0-9]/g, ""));
                    setOverride(null);
                    setPreview(null);
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="flex items-center gap-2 pt-6 text-sm">
                  <Checkbox
                    checked={narrow}
                    onCheckedChange={(v) => {
                      setNarrow(v === true);
                      setPreview(null);
                    }}
                    aria-label="Narrow beat"
                  />
                  Narrow beat, strict region or few outlets
                </label>
                {narrow && (
                  <Input
                    aria-label="Why it is narrow"
                    value={narrowReason}
                    onChange={(e) => {
                      setNarrowReason(e.target.value);
                      setPreview(null);
                    }}
                    placeholder="Why it is narrow"
                  />
                )}
              </div>
            </div>
            <details
              className="rounded-md border border-border p-2"
              open={Boolean(prefill?.standing || prefill?.reporterShape) || undefined}
            >
              <summary className="cursor-pointer text-xs font-medium text-foreground">
                Sharpen the search (standing, reporter shape, sub-angles, competitors, regions)
              </summary>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="Your standing and proof" value={standing} onChange={(v) => { setStanding(v); setPreview(null); }} placeholder="Who you are and why you are credible on this" />
                <Field label="Reporter shape" value={shape} onChange={(v) => { setShape(v); setPreview(null); }} placeholder="Sub-beat, outlet type, why they care now" />
                <Field label="Sub-angles (one per line)" value={subAngles} onChange={(v) => { setSubAngles(v); setPreview(null); }} placeholder={"data center decommissioning\ne-waste data security"} />
                <Field label="Competitors (one per line)" value={competitors} onChange={(v) => { setCompetitors(v); setPreview(null); }} placeholder="Iron Mountain ITAD" />
                <Field label="Regions (one per line)" value={regions} onChange={(v) => { setRegions(v); setPreview(null); }} placeholder="California" />
              </div>
            </details>

            {splitAngles.length > 0 && (
              <div className="rounded-md border border-border bg-muted/20 p-2 text-xs" data-testid="media-research-split">
                <p className="mb-1 font-medium text-foreground">Split by beat — run one angle at a time:</p>
                <div className="flex flex-wrap gap-1.5">
                  {splitAngles.map((choice) => (
                    <Button key={choice.angle} type="button" variant="outline" onClick={() => chooseSplit(choice)}>
                      {choice.angle} ({choice.wanted_good_fits})
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {!preview && (
              <div className="flex justify-end">
                <Button icon={previewing ? <Loader2 className="animate-spin" /> : <Search />} variant="primary" type="button" disabled={previewing} onClick={() => void runPreview()} data-testid="media-research-preview-button">
                  See size and cost
                </Button>
              </div>
            )}
            {preview && (
              <MediaResearchPreviewCard preview={preview} running={running} onRun={() => void run()} onOffer={onOffer} />
            )}
          </div>
        )}

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-foreground" role="alert">
            {error}
          <ErrorAlchemyMenu error={error} /></p>
        )}

        {running && (
          <div className="space-y-2" data-testid="media-research-progress">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-foreground">{progress?.says ?? "Starting the research…"}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress?.percent ?? 2}%` }} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {progress ? `${progress.found ?? 0} of ${progress.target ?? 0} researched · ${progress.judged ?? 0} judged` : ""}
              {" "}— the server keeps going if you close this; the answer is saved on the list.
            </p>
            {profiles.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Found: {profiles.map((p) => (p.outlet ? `${p.name} (${p.outlet})` : p.name)).join(", ")}
              </p>
            )}
            {liveRows.length > 0 && <ResearchTable rows={liveRows} caption={`Judged so far (${liveRows.length})`} />}
          </div>
        )}

        {result && (
          <>
            <MediaResearchResults result={result} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setResult(null); setPreview(null); }}>
                New angle
              </Button>
              <Button variant="primary" type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <ProTextarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2} />
    </div>
  );
}
