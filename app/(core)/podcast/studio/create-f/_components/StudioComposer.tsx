"use client";

// app/(core)/podcast/studio/create-f/_components/StudioComposer.tsx
//
// ── Variation F · Create surface ────────────────────────────────────────────
// Persona:   Consumer / prosumer creator launching an episode.
// Modeled after: a streaming-app "new project" composer — Spotify for
//   Podcasters' create flow crossed with Descript's project setup and the calm
//   focus of Notion's new-page. A two-pane studio: a single calm config column
//   on the left (Source → Format → Language → Hosts → Length → Destination →
//   Advanced) and a sticky LIVE EPISODE BRIEF on the right that fills in as you
//   configure and carries the primary Generate action. You always see what
//   you're about to make. NOT a long top-to-bottom settings form.
//
// Demo: no backend. Generate routes to /podcast/studio/run-f, which replays a
// self-contained mock production.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Languages,
  Users,
  Clock3,
  Library,
  SlidersHorizontal,
  ChevronDown,
  FlaskConical,
  Plus,
  Check,
} from "lucide-react";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  SOURCE_OPTIONS,
  LANGUAGE_OPTIONS,
  FORMAT_OPTIONS,
  HOST_OPTIONS,
  LENGTH_OPTIONS,
} from "../_mock/options";
import { MOCK_SHOWS, type MockShow } from "../_mock/shows";
import { OptionTile } from "./OptionTile";
import { EpisodeBrief } from "./EpisodeBrief";
import { INITIAL_DRAFT, type EpisodeDraft } from "./types";

const SECTION_LABEL =
  "flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground";

const TINT: Record<MockShow["tint"], string> = {
  primary: "bg-primary/15 text-primary",
  sky: "bg-sky-500/15 text-sky-500",
  violet: "bg-violet-500/15 text-violet-500",
  emerald: "bg-emerald-500/15 text-emerald-500",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-500",
};

export function StudioComposer() {
  const router = useRouter();
  const [draft, setDraft] = useState<EpisodeDraft>(INITIAL_DRAFT);
  const [urls, setUrls] = useState<string[]>([""]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const set = <K extends keyof EpisodeDraft>(key: K, value: EpisodeDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const activeSource = SOURCE_OPTIONS.find((s) => s.kind === draft.sourceKind)!;
  const language = LANGUAGE_OPTIONS.find((l) => l.code === draft.language);
  const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);

  const canGenerate = useMemo(() => {
    if (busy) return false;
    if (activeSource.control === "urls") return cleanUrls.length > 0;
    if (activeSource.control === "picker") return true; // a picked note/upload
    return draft.sourceText.trim().length > 0;
  }, [busy, activeSource.control, cleanUrls.length, draft.sourceText]);

  const handleGenerate = () => {
    if (!canGenerate) return;
    setBusy(true);
    toast.success("Starting your episode…");
    startTransition(() => router.push("/podcast/studio/run-f"));
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      {/* ── LEFT: config column ──────────────────────────────────────────── */}
      <div className="space-y-7">
        {/* 1 · Source */}
        <section className="space-y-3">
          <Label className={SECTION_LABEL}>What&apos;s this episode about?</Label>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {SOURCE_OPTIONS.map((opt) => (
              <OptionTile
                key={opt.kind}
                icon={opt.icon}
                label={opt.label}
                helper={opt.helper}
                selected={draft.sourceKind === opt.kind}
                onClick={() => {
                  set("sourceKind", opt.kind);
                  set("sourceText", "");
                }}
              />
            ))}
          </div>

          {/* Matching input */}
          <div className="pt-0.5">
            {activeSource.control === "text" ? (
              <ProTextarea
                value={draft.sourceText}
                onChange={(e) => set("sourceText", e.target.value)}
                placeholder={activeSource.placeholder}
                rows={draft.sourceKind === "topic" ? 3 : 6}
                dir={language?.rtl ? "rtl" : undefined}
                autoGrow
                minHeight={draft.sourceKind === "topic" ? 84 : 150}
                className="text-base"
                showCopyButton={false}
              />
            ) : activeSource.control === "urls" ? (
              <div className="space-y-2">
                {urls.map((url, i) => (
                  <Input
                    key={i}
                    value={url}
                    onChange={(e) =>
                      setUrls((prev) => prev.map((u, idx) => (idx === i ? e.target.value : u)))
                    }
                    placeholder={activeSource.placeholder}
                    inputMode="url"
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setUrls((prev) => [...prev, ""])}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Plus className="h-4 w-4" />
                  Add another file
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center text-sm text-muted-foreground">
                {activeSource.kind === "note"
                  ? "Pick one of your notes to turn into an episode."
                  : "Upload an audio file — we'll transcribe it for you."}
              </div>
            )}
          </div>
        </section>

        {/* 2 · Format */}
        <section className="space-y-3">
          <Label className={SECTION_LABEL}>Format</Label>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {FORMAT_OPTIONS.map((opt) => (
              <OptionTile
                key={opt.value}
                icon={opt.icon}
                label={opt.label}
                helper={opt.helper}
                selected={draft.format === opt.value}
                onClick={() => set("format", opt.value)}
              />
            ))}
          </div>
        </section>

        {/* 3 · Voice (language) + Hosts + Length, grouped on one row */}
        <section className="grid gap-5 sm:grid-cols-[minmax(0,1fr)]">
          <div className="space-y-3">
            <Label className={SECTION_LABEL}>
              <Languages className="h-3.5 w-3.5" />
              Language
            </Label>
            <Select value={draft.language} onValueChange={(v) => set("language", v)}>
              <SelectTrigger className="w-full sm:w-80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {LANGUAGE_OPTIONS.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    <span className="flex w-full items-center gap-2">
                      <span>{lang.label}</span>
                      <span className="text-xs text-muted-foreground" dir={lang.rtl ? "rtl" : undefined}>
                        {lang.native}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-3">
              <Label className={SECTION_LABEL}>
                <Users className="h-3.5 w-3.5" />
                Hosts
              </Label>
              <div className="grid grid-cols-4 gap-2">
                {HOST_OPTIONS.map((opt) => (
                  <OptionTile
                    key={opt.value}
                    label={opt.label}
                    helper={opt.helper}
                    compact
                    selected={draft.hosts === opt.value}
                    onClick={() => set("hosts", opt.value)}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label className={SECTION_LABEL}>
                <Clock3 className="h-3.5 w-3.5" />
                Length
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {LENGTH_OPTIONS.map((opt) => (
                  <OptionTile
                    key={opt.value}
                    label={opt.label}
                    helper={opt.helper}
                    compact
                    selected={draft.length === opt.value}
                    onClick={() => set("length", opt.value)}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 4 · Destination */}
        <section className="space-y-3">
          <Label className={SECTION_LABEL}>
            <Library className="h-3.5 w-3.5" />
            Publish to a show
          </Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ShowRow
              selected={draft.showId === null}
              onClick={() => set("showId", null)}
              title="Standalone"
              meta="Not added to a show"
            />
            {MOCK_SHOWS.map((show) => (
              <ShowRow
                key={show.id}
                selected={draft.showId === show.id}
                onClick={() => set("showId", show.id)}
                title={show.title}
                meta={`${show.episodeCount} episodes`}
                avatar={
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold",
                      TINT[show.tint],
                    )}
                  >
                    {show.title.slice(0, 1)}
                  </span>
                }
              />
            ))}
          </div>
        </section>

        {/* 5 · Advanced */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <span className="flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Advanced options
            </span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", advancedOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Steer the research / writing
              </Label>
              <ProTextarea
                value={draft.extraInstruction}
                onChange={(e) => set("extraInstruction", e.target.value)}
                placeholder="Optional — e.g. focus on practical takeaways"
                rows={2}
                showCopyButton={false}
              />
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3.5">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-500">
                <FlaskConical className="h-4.5 w-4.5" />
              </span>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="test-mode-f" className="text-sm font-medium text-foreground">
                    Test mode — short audio
                  </Label>
                  <Switch
                    id="test-mode-f"
                    checked={draft.testMode}
                    onCheckedChange={(v) => set("testMode", v)}
                  />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Trims audio to about one line per host so runs stay fast and cheap. Script,
                  cover art and video are always full quality.
                </p>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* ── RIGHT: live brief ────────────────────────────────────────────── */}
      <EpisodeBrief
        draft={draft}
        shows={MOCK_SHOWS}
        canGenerate={canGenerate}
        busy={busy}
        onGenerate={handleGenerate}
      />
    </div>
  );
}

function ShowRow({
  selected,
  onClick,
  title,
  meta,
  avatar,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  meta: string;
  avatar?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
        selected
          ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
          : "border-border bg-card hover:border-primary/30 hover:bg-accent/40",
      )}
    >
      {avatar ?? (
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Library className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{meta}</p>
      </div>
      {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}
