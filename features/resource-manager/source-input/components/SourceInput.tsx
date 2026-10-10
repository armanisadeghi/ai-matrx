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

// wizard-draft-exempt: the saved draft holds only the 'review already opened' flag, no typed text is restored into a field
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AlertCircle, ListChecks, Loader2, Search, X } from "lucide-react";
import { Textarea } from "@ai-matrx/design-system";
import { Input, SegmentedControl } from "@ai-matrx/design-system/controls";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { knobInt } from "@/lib/knobs/featureKnobs";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { patchWizardDraft, selectWizardDraft } from "@/lib/redux/slices/wizardDraftSlice";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useProcessingRunner } from "@/features/rag/hooks/useProcessingRunner";
import {
  InlineUploadArea,
  type UploadedFile,
} from "@/features/resource-manager/resource-picker/InlineUploadArea";
import { WebpageResourcePickerCore } from "@/features/resource-manager/resource-picker/WebpageResourcePicker";
import { YouTubeResourcePicker } from "@/features/resource-manager/resource-picker/YouTubeResourcePicker";
import { AudioResourcePicker } from "@/features/resource-manager/resource-picker/AudioResourcePicker";
import { ResourcePickerTiles } from "@/features/resource-manager/resource-picker/ResourcePickerTiles";
import type { KindScope } from "@/features/scopes/service/kindInventory";
import { EntityOrgFilter } from "@/lib/entity-list/components/EntityOrgFilter";
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
import { useSourceDraftAddresses } from "../sourceAddress";
import { sourceSurfaceKey, useSourceSet } from "../useSourceSet";
import { reviewSetKey, shouldAutoOpenReview } from "../reviewAutoOpen";
import { useSourceIntake } from "../useSourceIntake";
import { useSourceRecovery } from "../useSourceRecovery";
import {
  fileCardHeldForOrganization,
  SAME_SOURCE_AGAIN,
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
  marks,
  className,
}: SourceInputProps) {
  const tiles = visibleSourceKinds(kinds);
  const existing = showsExisting(kinds);
  const [active, setActive] = useState<AddTileId | null>(null);
  const [webUrlForVideo, setWebUrlForVideo] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");
  // The lane (All | Mine) and the page's organization filter (All organizations by default,
  // never the active organization — law: active-org-is-never-a-list-filter).
  const [scopeChoice, setScopeChoice] = useState<"all" | "mine">("all");
  const [orgFilter, setOrgFilter] = useState<string | null>(null);
  const set = useSourceSet(surfaceKey, { defaultForm, deliveries, max });
  // A saved Source picked from Use existing (Websites) names its real kind on its card ("Web page",
  // not "Source"): the pick records the kind, and the card that appears takes it once.
  const pickedSourceKinds = useRef(new Map<string, string>());
  useEffect(() => {
    if (pickedSourceKinds.current.size === 0) return;
    for (const card of set.sources) {
      const id = card.draft.ref?.resource_id;
      const kind = id ? pickedSourceKinds.current.get(id) : undefined;
      if (!id || !kind) continue;
      pickedSourceKinds.current.delete(id);
      if (!card.draft.sourceKind) set.updateDraft(card.id, { sourceKind: kind });
    }
  }, [set]);
  // The same Source added twice keeps one card. That is an event, not a state
  // of the card: say it once and clear it — the package's sentence used to
  // stay on the card for good (verify-6 #5, 2026-10-01).
  const announcedAgain = useRef(new Set<string>());
  useEffect(() => {
    for (const card of set.sources) {
      if (!card.draft.notes?.includes(SAME_SOURCE_AGAIN)) {
        announcedAgain.current.delete(card.id);
        continue;
      }
      set.updateDraft(card.id, { notes: card.draft.notes.filter((n) => n !== SAME_SOURCE_AGAIN) });
      if (announcedAgain.current.has(card.id)) continue;
      announcedAgain.current.add(card.id);
      toast.info(`Already added: ${card.draft.label}`);
    }
  }, [set]);
  // Every card that points at a Source with no address (a web page picked from Use existing, a
  // host's own picker) reads it from the Source row — the same line a page added by its link has.
  useSourceDraftAddresses(set.sources, set.updateDraft);
  const runner = useProcessingRunner();
  const intake = useSourceIntake(set, { attachTo });
  const [threshold, setThreshold] = useState<number | null>(null);
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  // The set the review last opened for by itself, kept with this input's saved
  // draft so a reload or a remount never reopens it (verify-6 #4).
  const dispatch = useAppDispatch();
  const draftKey = sourceSurfaceKey(surfaceKey);
  const savedDraft = useAppSelector(selectWizardDraft(draftKey));
  const reviewOpenedFor =
    typeof savedDraft?.data?.reviewAutoOpenedFor === "string" ? savedDraft.data.reviewAutoOpenedFor : null;

  // Never lose input + file uploads' Sources — UI-free, in the hook.
  // org-filter: write-target Sources are filed in the organization the person works in
  const activeOrgId = useAppSelector(selectOrganizationId);
  useSourceRecovery(set, intake, runner, { organizationId: activeOrgId });
  // All | Mine, narrowed by the organization filter: a filter over what is listed, never permission.
  const scope: KindScope =
    scopeChoice === "mine"
      ? { kind: "mine", organizationId: orgFilter }
      : orgFilter
        ? { kind: "organization", organizationId: orgFilter }
        : { kind: "all" };

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
        // A Source removed in the review leaves the page too (V4-F #3) — the
        // runtime removes exactly the ones sent in that did not come back.
        set.controller.applySourceSet(outcome.sourceSet, { reviewed: sourceSet });
      }
      openedReview.current = false;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The review could not open.");
    }
  };

  // Opens by itself once per set of Sources above the knob — not on every
  // mount (a reload and "Try again" remount this input with the same set).
  const reviewSet = reviewSetKey(
    set.sources.flatMap((s) => (s.status === "ready" && s.draft.ref ? [sourceKey(s.draft.ref)] : [])),
  );
  const reviewLarge = useEffectEvent(() => {
    if (
      !shouldAutoOpenReview({
        totalChars: set.totalChars,
        threshold,
        setKey: reviewSet,
        openedFor: reviewOpenedFor,
      })
    )
      return;
    dispatch(patchWizardDraft({ wizardId: draftKey, patch: { reviewAutoOpenedFor: reviewSet } }));
    void openReview("large");
  });
  useEffect(() => {
    reviewLarge();
  }, [set.totalChars, threshold, reviewSet]);

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

  // What is picked sits right under the search box — above the doors and the
  // kind list — so on a phone it is never scrolled past (verify-4 #52).
  const pickedList = (
    set.restoring ? (
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
              icon={<X />}
              type="button"
              variant="quiet"
              aria-label="Remove the topic"
              onClick={() => set.setTopic("")}
            />
          </li>
        ) : null}
        {set.sources.map((card) => (
          <SourceCard
            key={card.id}
            card={card}
            set={set}
            job={
              // The newest job reading this Source: an upload's pipeline (by
              // file) or a clean started here (by its processed document).
              runner.jobs.findLast(
                (j) =>
                  (card.draft.fileId !== undefined && j.cldFileId === card.draft.fileId) ||
                  (card.draft.processedDocumentId !== undefined &&
                    j.processedDocumentId === card.draft.processedDocumentId),
              ) ?? null
            }
            onCleanNow={(pdId) => void runner.runStage(pdId, "clean", card.draft.label)}
            deliveries={deliveries}
            mark={marks?.[card.id]}
            heldForOrganization={fileCardHeldForOrganization(card, activeOrgId, fileOrganizationId)}
            onProcessingSettled={() => void set.manifest()}
            // A retry is a card already in the list — it never counts against `max`.
            onTryAgain={() => void intake.resume(card)}
            onChooseFileAgain={(file) => void intake.retryFile(card, file)}
          />
        ))}
      </ul>
    ) : null
  );

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
          icon={<ListChecks />}
          type="button"
          variant="quiet"
          className="ml-auto shrink-0"
          onClick={() => void openReview("requested")}
        >
          Review
        </Button>
      </header>

      {existing ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input adornment="start"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search everything you have"
              aria-label="Search everything you have"
            />
          </div>
          {/* Lanes and the organization filter share ONE row: on a phone the
              filter is an icon button (its label is screen-reader only), and
              stacked alone in the column it stretched into an empty
              full-width box (375px, 2026-10-03). */}
          <div className="flex items-center justify-between gap-2 sm:justify-start">
            <SegmentedControl aria-label="Scope"
              value={scopeChoice}
              onValueChange={(v) => setScopeChoice(v === "mine" ? "mine" : "all")}
              data={[
                { value: "all", label: "All" },
                { value: "mine", label: "Mine" },
              ]}
            />
            <EntityOrgFilter
              orgId={orgFilter}
              onChange={setOrgFilter}
              counts={{ byKind: {}, narrow: { all: [] } }}
              className="shrink-0 max-sm:min-w-11 max-sm:justify-center"
            />
          </div>
        </div>
      ) : null}

      {pickedList}

      {query.trim() && existing ? null : (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">Add new</h3>
          <ResourcePickerTiles
            items={tiles}
            selectedId={active}
            onSelect={(tile) => setActive(active === tile.id ? null : tile.id)}
            className="grid-cols-4 sm:grid-cols-7"
          />
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
          onToggle={(token, item, sourceKind) => {
            const picked = set.sources.find(
              (s) => s.draft.ref?.resource_type === token && s.draft.ref.resource_id === item.id,
            );
            if (picked) {
              set.remove(picked.id);
              return;
            }
            if (refuseOverMax()) return;
            if (intake.addExisting({ token, id: item.id, title: item.title }) && sourceKind) {
              pickedSourceKinds.current.set(item.id, sourceKind);
            }
          }}
        />
      ) : null}

      {set.manifestError ? (
        <p role="alert" className="flex items-start gap-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{set.manifestError}</span>
          <ErrorAlchemyMenu error={set.manifestError} operation="Measure the Sources" />
          <Button type="button" variant="quiet" onClick={() => void set.manifest()}>
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

    </section>
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
              className="min-w-0 flex-1"
              aria-label="Name (optional)"
            />
            <span className="shrink-0 text-xs text-muted-foreground">{text.length ? formatChars(text.length) : ""}</span>
            <Button variant="primary" type="submit" className="shrink-0" disabled={!text.trim()}>
              Add
            </Button>
          </div>
        </form>
      );
    case "url":
      return (
        <div className="max-h-[70dvh] overflow-y-auto">
          <WebPageRead intake={intake} refuseOverMax={refuseOverMax} onVideoLink={onVideoLink} />
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
              variant="quiet"
              className="self-start"
              onClick={() => setUploadRecording(true)}
            >
              Upload a recording
            </Button>
          </div>
        );
      return (
        <InlineUploadArea
          clearHandedOver
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
          clearHandedOver
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
 * The web page door. The link goes straight to the intake (`addWebPage`) —
 * the SAME ask → hold → continue path as every other door: a card exists from
 * the moment the link is given (its link kept, so a reload re-reads it), with
 * no organization it waits ("Choose organization") and continues by itself
 * once one is set, and the page is added once read — no preview step
 * (verify-5 #3, #7). Parts and the version are chosen on the card.
 */
function WebPageRead({
  intake,
  refuseOverMax,
  onVideoLink,
}: {
  intake: ReturnType<typeof useSourceIntake>;
  refuseOverMax: () => boolean;
  onVideoLink: (url: string) => void;
}) {
  return (
    <WebpageResourcePickerCore
      onSwitchTo={(type, url) => {
        if (type === "youtube") onVideoLink(url);
      }}
      onSelect={() => undefined}
      onReadUrl={(url) => {
        if (refuseOverMax()) return;
        void intake.addWebPage(url);
      }}
    />
  );
}
