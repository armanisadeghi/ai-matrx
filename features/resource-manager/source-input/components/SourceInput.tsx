"use client";

/**
 * <SourceInput> — THE one Source input (common-docs
 * `projects/unified-source-input/DESIGN.md` §1, rebuilt on certified canonical
 * primitives in A3-F).
 *
 *   [ Search everything you have ]            Mine | <Org>
 *   Add new       Upload · Paste text · Web page · YouTube · Recording · Image · Topic
 *   Use existing  <kind> <count> …  (registry kinds, `useKindCounts`/`useKindItems`)
 *   picked Sources as cards
 *
 * Every door is an existing primitive: `InlineUploadArea` (upload; image with
 * image links; a recording file), `AudioResourcePicker` (record in place),
 * `WebpageResourcePickerCore`, `YouTubeResourcePicker`,
 * `SegmentedControl`, the inventory hooks. Configuration is by props only
 * (`kinds`, `max`, `required`, `defaultForm`, `title`, `attachTo`, `deliveries`).
 * State: `useSourceSet(surfaceKey)`; new material: `useSourceIntake`; tiles:
 * `sourceKinds.ts`. Copy law R9: nouns, no helper lines.
 *
 * "Review what goes in" is always one click away, opens by itself when the
 * picked Sources pass the `sources.review_threshold_chars` knob, and closes
 * when this input goes away (the page navigated).
 */

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AlertCircle, ListChecks, Loader2, Search, X } from "lucide-react";
import { Input, SegmentedControl, Textarea } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { knobInt } from "@/lib/knobs/featureKnobs";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectActiveOrganizationName } from "@/features/scopes/redux/selectors/active-context";
import { useProcessingRunner } from "@/features/rag/hooks/useProcessingRunner";
import {
  InlineUploadArea,
  type UploadedFile,
} from "@/features/resource-manager/resource-picker/InlineUploadArea";
import { WebpageResourcePickerCore } from "@/features/resource-manager/resource-picker/WebpageResourcePicker";
import { YouTubeResourcePicker } from "@/features/resource-manager/resource-picker/YouTubeResourcePicker";
import { AudioResourcePicker } from "@/features/resource-manager/resource-picker/AudioResourcePicker";
import type { KindScope } from "@/features/scopes/service/kindInventory";
import {
  cancelSourceReview,
  openSourceReview,
} from "@/features/resource-manager/source-input/review/openSourceReview";
import { cn } from "@/utils/cn";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import {
  showsExisting,
  sourceKindNoun,
  visibleSourceKinds,
  type SourceKindDef,
} from "../sourceKinds";
import { useSourceSet } from "../useSourceSet";
import { useSourceIntake } from "../useSourceIntake";
import { useSourceRecovery } from "../useSourceRecovery";
import {
  fileCardHeldForOrganization,
  sourceKey,
  type SourceTileId,
} from "@ai-matrx/agents/sources/runtime";
import { fileOrganizationId } from "@/features/files/api/fileOrganization";
import type { SourceInputProps } from "../types";
import { SourceCard, formatChars } from "./SourceCard";
import { UseExisting } from "./UseExisting";

const REVIEW_KNOB = { feature: "sources", key: "review_threshold_chars" } as const;
const MEASURE_DEBOUNCE_MS = 400;

type AddTileId = Exclude<SourceTileId, "existing">;

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
  deliveries,
  className,
}: SourceInputProps) {
  const tiles = visibleSourceKinds(kinds);
  const existing = showsExisting(kinds);
  const [active, setActive] = useState<AddTileId | null>(null);
  const [webUrlForVideo, setWebUrlForVideo] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [scopeChoice, setScopeChoice] = useState<"mine" | "organization">("mine");
  const set = useSourceSet(surfaceKey, { defaultForm, deliveries, max });
  const runner = useProcessingRunner();
  const intake = useSourceIntake(set, { attachTo });
  const [threshold, setThreshold] = useState<number | null>(null);
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const autoOpened = useRef(false);

  // Never lose input + file uploads' Sources — UI-free, in the hook.
  const activeOrgId = useAppSelector(selectOrganizationId);
  const activeOrgName = useAppSelector(selectActiveOrganizationName);
  useSourceRecovery(set, intake, runner, { organizationId: activeOrgId });
  // Mine | <Org>: a filter over what is listed, never permission.
  const scope: KindScope =
    scopeChoice === "organization" && activeOrgId
      ? { kind: "organization", organizationId: activeOrgId }
      : { kind: "mine" };

  // A review this input opened closes when the input goes away (the page navigated).
  const openedReview = useRef(false);
  useEffect(
    () => () => {
      if (openedReview.current) cancelSourceReview();
    },
    [],
  );

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

  // ── Only what this host can use (V2-F #1) ─────────────────────────────────
  // A Source set to a delivery this surface cannot use (picked on another
  // surface, restored from a draft, handed in by a link) is switched back,
  // and its card says so. Never a choice that cannot work.
  const deliveryKey = JSON.stringify([deliveries ?? null, set.sources.map((s) => s.draft.ref?.delivery ?? null)]);
  const fitDeliveries = useEffectEvent(() => set.fitDeliveries(deliveries));
  useEffect(() => {
    fitDeliveries();
  }, [deliveryKey]);

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
      openedReview.current = true;
      const outcome = await openSourceReview(sourceSet, {
        reason,
        purpose,
        targetModelId,
        addMoreLabel: "Add more",
        deliveries,
        // The review names each Source the way its card does (V2-F #5).
        describe: Object.fromEntries(
          set.sources.flatMap((s) =>
            s.draft.ref
              ? [[sourceKey(s.draft.ref), { kind: sourceKindNoun(s.draft), name: s.draft.label }]]
              : [],
          ),
        ),
      });
      if (outcome.status === "applied" || outcome.status === "add_more") {
        set.applySourceSet(outcome.sourceSet);
      }
      openedReview.current = false;
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
    if (max === undefined || set.roomLeft() > 0) return false;
    toast.info(`This takes at most ${max} ${max === 1 ? "source" : "sources"}. Remove one to add another.`);
    return true;
  };

  /** Keep only as many files as there is room for, and say what was left out. */
  const fitFiles = (files: UploadedFile[]): UploadedFile[] => {
    if (max === undefined) return files;
    const room = set.roomLeft();
    if (files.length > room)
      toast.info(
        `This takes at most ${max} ${max === 1 ? "source" : "sources"}, so only ${room} of the ${files.length} files were added.`,
      );
    return files.slice(0, room);
  };

  return (
    <section className={cn("space-y-3", className)} aria-label={title}>
      <header className="flex items-center gap-x-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="min-w-0 truncate text-xs text-muted-foreground" aria-live="polite">
          {/* read-gate-exempt: count of sources the person picked in this draft (local draft state); set.restoring covers the draft's read-back */}
          {set.restoring ? (
            <Loader2 className="inline h-3 w-3 animate-spin" aria-label="Loading" />
          ) : count > 0 ? (
            `${count}${set.totalChars ? ` · ${formatChars(set.totalChars)}` : ""}${max !== undefined ? ` / ${max}` : ""}`
          ) : null}
          {set.measuring ? <Loader2 className="ml-1.5 inline h-3 w-3 animate-spin" /> : null}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-11 shrink-0 gap-1.5 sm:h-8"
          onClick={() => void openReview("requested")}
        >
          <ListChecks className="h-4 w-4" />
          Review
        </Button>
      </header>

      {existing ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search everything you have"
              aria-label="Search everything you have"
              className="pl-8 text-base sm:text-sm"
            />
          </div>
          {activeOrgId ? (
            <SegmentedControl
              value={scope.kind === "organization" ? "organization" : "mine"}
              onValueChange={(v) => setScopeChoice(v === "organization" ? "organization" : "mine")}
              data={[
                { value: "mine", label: "Mine" },
                { value: "organization", label: activeOrgName || "Organization" },
              ]}
              size="sm"
              className="max-w-full shrink-0 max-lg:[&_[role=tab]]:min-h-11!"
            />
          ) : null}
        </div>
      ) : null}

      {query.trim() && existing ? null : (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">Add new</h3>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {tiles.map((tile) => (
              <Tile
                key={tile.id}
                tile={tile}
                selected={active === tile.id}
                onSelect={() => setActive(active === tile.id ? null : tile.id)}
              />
            ))}
          </div>
        </div>
      )}

      {activeDef && !(query.trim() && existing) ? (
        <div className="rounded-xl border border-border bg-card p-3">
          {atMax && activeDef.control !== "topic" ? (
            <p className="text-sm text-muted-foreground">
              {max} of {max} picked. Remove one to add another.
            </p>
          ) : (
            <TileArea
              key={activeDef.id}
              surfaceKey={surfaceKey}
              tile={activeDef}
              set={set}
              intake={intake}
              refuseOverMax={refuseOverMax}
              fitFiles={fitFiles}
              initialUrl={activeDef.id === "youtube" ? webUrlForVideo : undefined}
              onClose={() => setActive(null)}
              onVideoLink={(url) => {
                setWebUrlForVideo(url);
                setActive("youtube");
              }}
            />
          )}
        </div>
      ) : null}

      {existing ? (
        <UseExisting
          scope={scope}
          query={query}
          isPicked={(token, id) => set.hasRef(token, id)}
          onToggle={(token, item) => {
            const picked = set.sources.find(
              (s) => s.draft.ref?.resource_type === token && s.draft.ref.resource_id === item.id,
            );
            if (picked) {
              set.remove(picked.id);
              return;
            }
            if (refuseOverMax()) return;
            intake.addExisting({ token, id: item.id, title: item.title });
          }}
        />
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

      {set.restoring ? (
        <div className="space-y-2" aria-hidden>
          <div className="h-16 animate-pulse rounded-xl border border-border bg-muted/40" />
        </div>
      ) : set.topic.trim() || count > 0 ? (
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
              deliveries={deliveries}
              heldForOrganization={fileCardHeldForOrganization(card, activeOrgId, fileOrganizationId)}
              onProcessingSettled={() => void set.manifest()}
              // A retry is a card already in the list — it never counts against `max`.
              onTryAgain={() => void intake.resume(card)}
              onChooseFileAgain={(file) => void intake.retryFile(card, file)}
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
        "group flex min-h-16 w-full min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-2.5 transition-all",
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
      <span className="max-w-full truncate whitespace-nowrap text-xs font-medium text-foreground sm:text-sm">
        {tile.label}
      </span>
    </button>
  );
}

function TileArea({
  surfaceKey,
  tile,
  set,
  intake,
  refuseOverMax,
  fitFiles,
  initialUrl,
  onClose,
  onVideoLink,
}: {
  surfaceKey: string;
  tile: SourceKindDef;
  set: ReturnType<typeof useSourceSet>;
  intake: ReturnType<typeof useSourceIntake>;
  refuseOverMax: () => boolean;
  fitFiles: (files: UploadedFile[]) => UploadedFile[];
  initialUrl?: string;
  onClose: () => void;
  /** A YouTube link typed into the web page box goes to the YouTube door. */
  onVideoLink: (url: string) => void;
}) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [uploadRecording, setUploadRecording] = useState(false);

  switch (tile.control) {
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
            placeholder="Paste text"
            rows={8}
            className="min-h-44 text-base"
            aria-label="Paste text"
          />
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (optional)"
              className="min-w-0 flex-1 text-base sm:text-sm"
              aria-label="Name (optional)"
            />
            <span className="shrink-0 text-xs text-muted-foreground">{text.length ? formatChars(text.length) : ""}</span>
            <Button type="submit" className="h-11 shrink-0 sm:h-9" disabled={!text.trim()}>
              Add
            </Button>
          </div>
        </form>
      );
    case "url":
      return (
        <div className="max-h-[70dvh] overflow-y-auto">
          <WebPageRead set={set} intake={intake} refuseOverMax={refuseOverMax} onVideoLink={onVideoLink} />
        </div>
      );
    case "youtube":
      return (
        <YouTubeResourcePicker
          initialUrl={initialUrl}
          onBack={onClose}
          onSelect={(video) => {
            if (refuseOverMax()) return;
            void intake.addYouTube(video.url);
          }}
        />
      );
    case "audio":
      // Record in place with the family's recorder (Voice Pad); a recording
      // the person already has is one click away.
      if (!uploadRecording)
        return (
          <div className="flex flex-col gap-2">
            <AudioResourcePicker
              conversationId={`source-input-${surfaceKey}`}
              onBack={onClose}
              onSelect={(resource) => {
                if (resource.type !== "text" || refuseOverMax()) return;
                const at = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
                void intake.addRecordedText(resource.data.text, `Recording ${at}`);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 self-start text-xs sm:h-8"
              onClick={() => setUploadRecording(true)}
            >
              Upload a recording
            </Button>
          </div>
        );
      return (
        <InlineUploadArea
          accept={tile.accept}
          selectionMode="single"
          onSelect={async (uploaded) => {
            const files = fitFiles(uploaded);
            await Promise.all(files.map((f) => intake.addUploadedRecording(f)));
          }}
        />
      );
    case "upload":
      return (
        <InlineUploadArea
          accept={tile.accept}
          imageLinks={tile.id === "image"}
          selectionMode="multiple"
          onSelect={async (uploaded) => {
            const files = fitFiles(uploaded);
            if (!files.length) return;
            await intake.addUploaded(files, tile.id);
          }}
        />
      );
    case "topic":
      return (
        <Textarea
          value={set.topic}
          onChange={(e) => set.setTopic(e.target.value)}
          placeholder="Topic"
          rows={3}
          className="min-h-24 text-base"
          aria-label="Topic"
        />
      );
  }
}

/**
 * The web page door. A read has a card — with its link kept — from the moment
 * it starts (`intake.beginWebPage`), so a reload mid-read brings it back and
 * lands it (verify-3 12a/12b: it was lost, link and all). Confirming settles
 * that card; dropping the preview or a failed read removes it; closing this
 * panel mid-read lands it through the web door (`intake.resume`).
 */
function WebPageRead({
  set,
  intake,
  refuseOverMax,
  onVideoLink,
}: {
  set: ReturnType<typeof useSourceSet>;
  intake: ReturnType<typeof useSourceIntake>;
  refuseOverMax: () => boolean;
  onVideoLink: (url: string) => void;
}) {
  const reading = useRef<string | null>(null);
  const latest = useRef({ set, intake });
  useEffect(() => {
    latest.current = { set, intake };
  });
  useEffect(
    () => () => {
      const id = reading.current;
      reading.current = null;
      if (!id) return;
      const card = latest.current.set.controller.getState().cards.find((c) => c.id === id);
      if (card && card.status !== "ready") latest.current.intake.resume(card);
    },
    [],
  );
  return (
    <WebpageResourcePickerCore
      onSwitchTo={(type, url) => {
        if (type === "youtube") onVideoLink(url);
      }}
      onReadStart={(url) => {
        // At the limit nothing is added yet — confirming says so, as before.
        reading.current = set.roomLeft() > 0 ? intake.beginWebPage(url) : null;
      }}
      onReadEnd={() => {
        const id = reading.current;
        reading.current = null;
        if (id) set.remove(id);
      }}
      onSelect={(content, landed) => {
        const pending = reading.current;
        reading.current = null;
        if (!pending && refuseOverMax()) return;
        void intake.addScrapedPage(
          {
            url: content.url ?? "",
            title: content.title ?? "",
            text: content.textContent ?? "",
            processedDocumentId: landed.processedDocumentId,
          },
          pending,
        );
      }}
    />
  );
}
