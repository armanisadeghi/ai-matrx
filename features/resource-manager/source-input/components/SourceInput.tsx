"use client";

/**
 * <SourceInput> — THE one Source input (common-docs
 * `projects/unified-source-input/DESIGN.md` §1).
 *
 * The Podcast Studio look (big icon tiles, every option visible at once, one
 * big input area per tile) — never the chat composer. It OPENS on "Your
 * sources" (reuse first) with the add-something-new tiles beside it; picked
 * Sources sit below as cards. Contextual configuration is by props only
 * (`kinds`, `max`, `required`, `defaultForm`, `title`, `attachTo`) — never a
 * fork. State and persistence: `useSourceSet(surfaceKey)`; new material:
 * `useSourceIntake`; tiles: `sourceKinds.ts`.
 *
 * "Review what goes in" is always one click away and opens by itself when the
 * picked Sources pass the `sources.review_threshold_chars` knob.
 */

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AlertCircle, ArrowRight, ListChecks, Loader2, Upload, X } from "lucide-react";
import { Input, Textarea } from "@ai-matrx/design-system";
import { createSourceRef } from "@ai-matrx/agents/sources";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { knobInt } from "@/lib/knobs/featureKnobs";
import { youtubeId } from "@/lib/media/youtube";
import { useProcessingRunner } from "@/features/rag/hooks/useProcessingRunner";
import { ResourcePickerMenu } from "@/features/resource-manager/resource-picker/ResourcePickerMenu";
import type { Resource } from "@/features/agents/resources/types";
import { openSourceReview } from "@/features/resource-manager/source-input/review/openSourceReview";
import { cn } from "@/utils/cn";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { visibleSourceKinds, type SourceKindDef } from "../sourceKinds";
import { useSourceSet } from "../useSourceSet";
import { useSourceIntake } from "../useSourceIntake";
import type { SourceInputProps, SourceKindId } from "../types";
import { SourceCard, formatChars } from "./SourceCard";
import { YourSources } from "./YourSources";

const REVIEW_KNOB = { feature: "sources", key: "review_threshold_chars" } as const;
const MEASURE_DEBOUNCE_MS = 400;

export function SourceInput({
  surfaceKey,
  kinds,
  max,
  required = false,
  defaultForm,
  title = "Sources",
  attachTo,
  purpose,
  targetModelId,
  className,
}: SourceInputProps) {
  const tiles = visibleSourceKinds(kinds);
  const [active, setActive] = useState<SourceKindId | null>(tiles[0]?.id ?? null);
  const [searchEverything, setSearchEverything] = useState(false);
  const set = useSourceSet(surfaceKey, { defaultForm });
  const runner = useProcessingRunner();
  const intake = useSourceIntake(set, { attachTo, runner });
  const [threshold, setThreshold] = useState<number | null>(null);
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const autoOpened = useRef(false);

  const count = set.sources.length;
  const atMax = max !== undefined && count >= max;
  const activeDef = tiles.find((t) => t.id === active) ?? null;

  // ── Measure whenever the pointers change (debounced) ─────────────────────
  const refsKey = JSON.stringify(
    set.sources.filter((s) => s.status === "ready").map((s) => s.draft.ref),
  );
  const measure = useEffectEvent(() => void set.manifest());
  useEffect(() => {
    const t = setTimeout(measure, MEASURE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [refsKey]);

  // ── The review threshold is a knob (limits are knobs) ─────────────────────
  useEffect(() => {
    let cancelled = false;
    knobInt(REVIEW_KNOB.feature, REVIEW_KNOB.key)
      .then((v) => !cancelled && setThreshold(v))
      .catch((err: unknown) => {
        if (cancelled) return;
        setThresholdError(
          `The size at which "Review what goes in" opens by itself could not be read (${
            err instanceof Error ? err.message : String(err)
          }). The link still works.`,
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openReview = async (reason: "requested" | "large") => {
    let sourceSet;
    try {
      sourceSet = set.toSourceSet({ targetModelId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The Sources could not be gathered for review.");
      return;
    }
    try {
      const outcome = await openSourceReview(sourceSet, {
        reason,
        purpose,
        targetModelId,
        addMoreLabel: "Add more sources",
      });
      if (outcome.status === "applied" || outcome.status === "add_more") {
        set.applySourceSet(outcome.sourceSet);
      }
      if (outcome.status === "add_more") setActive(tiles[0]?.id ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The review could not open.");
    }
  };

  // Opens by itself once each time the total crosses the knob.
  const reviewLarge = useEffectEvent(() => void openReview("large"));
  useEffect(() => {
    if (threshold === null) return;
    if (set.totalChars <= threshold) {
      autoOpened.current = false;
      return;
    }
    if (autoOpened.current) return;
    autoOpened.current = true;
    reviewLarge();
  }, [set.totalChars, threshold]);

  const refuseOverMax = (): boolean => {
    // Read the store, not this render: two quick clicks must not both pass.
    if (max === undefined || set.liveCount() < max) return false;
    toast.info(`This takes at most ${max} ${max === 1 ? "source" : "sources"}. Remove one to add another.`);
    return true;
  };

  /** Keep only as many files as there is room for, and say what was left out. */
  const fitFiles = (files: File[]): File[] => {
    if (max === undefined) return files;
    const room = Math.max(0, max - set.liveCount());
    if (files.length > room)
      toast.info(
        `This takes at most ${max} ${max === 1 ? "source" : "sources"}, so only ${room} of the ${files.length} files were added.`,
      );
    return files.slice(0, room);
  };

  const onPicked = (resource: Resource, kind: SourceKindId) => {
    if (refuseOverMax()) return false;
    return intake.addPicked(resource, kind);
  };

  const pickerViews =
    searchEverything
      ? (["files", "notes", "documents", "tables", "workbooks"] as const)
      : activeDef?.pickerViews;

  return (
    <section className={cn("space-y-3", className)} aria-label={title}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="text-xs text-muted-foreground">
          {count === 0
            ? required
              ? "Add at least one source, or pick Just a topic."
              : "Nothing picked yet."
            : `${count} ${count === 1 ? "source" : "sources"}${
                set.totalChars ? ` · ${formatChars(set.totalChars)}` : ""
              }${max !== undefined ? ` · up to ${max}` : ""}`}
          {set.measuring ? <Loader2 className="ml-1.5 inline h-3 w-3 animate-spin" /> : null}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-11 gap-1.5 sm:h-8"
          onClick={() => void openReview("requested")}
        >
          <ListChecks className="h-4 w-4" />
          Review what goes in
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {tiles.map((tile) => (
          <Tile
            key={tile.id}
            tile={tile}
            selected={active === tile.id}
            onSelect={() => {
              setSearchEverything(false);
              setActive(tile.id);
            }}
          />
        ))}
      </div>

      {activeDef ? (
        <div className="rounded-xl border border-border bg-card p-3">
          {atMax && activeDef.control !== "your_sources" && activeDef.control !== "topic" ? (
            <p className="text-sm text-muted-foreground">
              You have picked {max} {max === 1 ? "source" : "sources"}, the most this takes. Remove one below to add another.
            </p>
          ) : searchEverything || activeDef.control === "picker" ? (
            <div className="h-[26rem] overflow-hidden">
              <ResourcePickerMenu
                key={searchEverything ? "everything" : activeDef.id}
                fillHost
                selectionMode="multiple"
                allowedViewIds={pickerViews}
                initialView={!searchEverything && pickerViews?.length === 1 ? pickerViews[0] : null}
                onExitInitialView={() => {
                  setSearchEverything(false);
                  setActive(tiles[0]?.id ?? null);
                }}
                onClose={() => setSearchEverything(false)}
                onResourceSelected={(resource) =>
                  onPicked(resource, searchEverything ? "records" : activeDef.id)
                }
              />
            </div>
          ) : (
            <TileArea
              key={activeDef.id}
              tile={activeDef}
              set={set}
              intake={intake}
              refuseOverMax={refuseOverMax}
              fitFiles={fitFiles}
              onSearchEverything={() => setSearchEverything(true)}
            />
          )}
        </div>
      ) : null}

      {set.manifestError ? (
        <p role="alert" className="flex items-start gap-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{set.manifestError}</span>
          <ErrorAlchemyMenu error={set.manifestError} operation="Measure the Sources" />
          <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => void set.manifest()}>
            Try again
          </Button>
        </p>
      ) : null}
      {thresholdError ? (
        <p className="flex items-start gap-2 text-xs text-warning">
          <span>{thresholdError}</span>
          <ErrorAlchemyMenu error={thresholdError} operation="Read the review size setting" />
        </p>
      ) : null}

      {set.topic.trim() || count > 0 ? (
        <ul className="space-y-2" aria-label="Picked sources">
          {set.topic.trim() ? (
            <li className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <span className="min-w-0 flex-1 text-sm">
                <span className="text-muted-foreground">Topic: </span>
                {set.topic}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 sm:h-8 sm:w-8"
                aria-label="Remove the topic"
                onClick={() => set.setTopic("")}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ) : null}
          {set.sources.map((card) => (
            <SourceCard
              key={card.id}
              card={card}
              set={set}
              job={
                card.draft.fileId
                  ? (runner.jobs.find((j) => j.cldFileId === card.draft.fileId) ?? null)
                  : null
              }
              onProcessingSettled={() => void set.manifest()}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Tile({
  tile,
  selected,
  onSelect,
}: {
  tile: SourceKindDef;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = tile.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group flex h-full min-h-11 w-full flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all",
        selected
          ? "border-primary/60 bg-primary/5 shadow-sm ring-1 ring-primary/30"
          : "border-border bg-card hover:border-primary/30 hover:bg-accent/40",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
          selected
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground group-hover:text-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-sm font-medium leading-tight text-foreground">{tile.label}</span>
      <span className="text-[11px] leading-snug text-muted-foreground">{tile.helper}</span>
    </button>
  );
}

function TileArea({
  tile,
  set,
  intake,
  refuseOverMax,
  fitFiles,
  onSearchEverything,
}: {
  tile: SourceKindDef;
  set: ReturnType<typeof useSourceSet>;
  intake: ReturnType<typeof useSourceIntake>;
  refuseOverMax: () => boolean;
  fitFiles: (files: File[]) => File[];
  onSearchEverything: () => void;
}) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  switch (tile.control) {
    case "your_sources":
      return (
        <YourSources
          isPicked={(id) => set.hasRef("processed_document", id)}
          onSearchEverything={onSearchEverything}
          onToggle={(row) => {
            const picked = set.sources.find(
              (s) => s.draft.ref?.resource_type === "processed_document" && s.draft.ref.resource_id === row.id,
            );
            if (picked) {
              set.remove(picked.id);
              return;
            }
            if (refuseOverMax()) return;
            set.addReady({
              kind: "your_sources",
              label: row.name || "Untitled",
              ref: createSourceRef("processed_document", row.id),
              processedDocumentId: row.id,
            });
          }}
        />
      );
    case "paste":
      return (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim() || refuseOverMax()) return;
            void intake.addPastedText(text, name);
            setText("");
            setName("");
          }}
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your notes, an article, a chapter…"
            rows={8}
            className="min-h-44 text-base"
            aria-label="Text to add"
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name it (optional — the first line is used)"
              className="text-base sm:flex-1 sm:text-sm"
              aria-label="Name"
            />
            <span className="text-xs text-muted-foreground">{text.length ? formatChars(text.length) : ""}</span>
            <Button type="submit" className="h-11 sm:h-9" disabled={!text.trim()}>
              Add this text
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">It is kept as one of your Sources, so you can reuse it next time.</p>
        </form>
      );
    case "url":
    case "youtube": {
      const isVideo = !!youtubeId(url);
      const asVideo = tile.control === "youtube" || isVideo;
      return (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!url.trim() || refuseOverMax()) return;
            if (asVideo) {
              if (!isVideo) {
                toast.error("That doesn't look like a YouTube video link. Paste a link like youtube.com/watch?v=…");
                return;
              }
              void intake.addYouTube(url);
            } else {
              void intake.addWebPage(url);
            }
            setUrl("");
          }}
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={tile.control === "youtube" ? "https://www.youtube.com/watch?v=…" : "https://example.com/article"}
              inputMode="url"
              className="text-base sm:flex-1 sm:text-sm"
              aria-label={tile.control === "youtube" ? "YouTube link" : "Web address"}
            />
            <Button type="submit" className="h-11 gap-1.5 sm:h-9" disabled={!url.trim()}>
              {asVideo ? "Write it out" : "Read the page"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {tile.control === "url" && isVideo
              ? "This is a YouTube video — we'll write out what was said instead of reading the page."
              : (tile.fallbackNote ?? "We read the page and keep a copy in your Sources.")}
          </p>
        </form>
      );
    }
    case "upload":
    case "audio":
      return (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const files = fitFiles(Array.from(e.dataTransfer.files));
            if (!files.length) return;
            if (tile.control === "audio") files.forEach((f) => void intake.addRecording(f));
            else void intake.addFiles(files, tile.id);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border",
          )}
        >
          <Upload className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-foreground">
            Drop {tile.control === "audio" ? "a recording" : tile.id === "image" ? "an image" : "files"} here, or
          </p>
          <Button
            type="button"
            variant="outline"
            className="h-11 sm:h-9"
            onClick={() => fileRef.current?.click()}
          >
            Choose from this device
          </Button>
          <p className="max-w-md text-xs text-muted-foreground">
            {tile.fallbackNote ??
              "If you already added the same file, we offer the copy you have instead of uploading it again."}
          </p>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            multiple={tile.control !== "audio"}
            accept={tile.accept}
            onChange={(e) => {
              const chosen = Array.from(e.target.files ?? []);
              e.target.value = "";
              const files = fitFiles(chosen);
              if (!files.length) return;
              if (tile.control === "audio") files.forEach((f) => void intake.addRecording(f));
              else void intake.addFiles(files, tile.id);
            }}
          />
        </div>
      );
    case "topic":
      return (
        <div className="space-y-2">
          <Textarea
            value={set.topic}
            onChange={(e) => set.setTopic(e.target.value)}
            placeholder="e.g. How photosynthesis turns light into sugar"
            rows={3}
            className="min-h-24 text-base"
            aria-label="Topic"
          />
          <p className="text-xs text-muted-foreground">
            A topic works on its own, or alongside your sources to say what to focus on.
          </p>
        </div>
      );
    case "picker":
      return null;
  }
}
