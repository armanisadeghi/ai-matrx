"use client";

// features/education/kits/components/KitHub.tsx
//
// A study kit is a PATH through one piece of material, not a directory of eight
// copies of its title. The page therefore names the learning MODE first, keeps
// every claim tied to that mode's real library/study-spine evidence, and gives
// the learner one inviting next move.

import { useEffect, useState, type ReactNode } from "react";
import { useDispatchThunk } from "@/lib/redux/hooks";
import { refreshStoreRead } from "@/lib/redux/slices/storeReadsSlice";
import { useStoreRead } from "@/lib/redux/store-reads/useStoreRead";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import Link from "next/link";
import {
  Archive,
  ArrowRight,
  CalendarClock,
  FileSearch,
  Flag,
  NotebookPen,
  Pencil,
  Plus,
  Route,
  X,
} from "lucide-react";
import { Button } from "@ai-matrx/design-system";
import { Button as ControlButton } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Skeleton } from "@ai-matrx/design-system";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import { TARGET_PRESENTATION } from "@/features/education/convert/targetPresentation";
import type { GeneratedArtifact } from "@/features/education/convert/lineage";
import type { TargetKind } from "@/features/education/convert/types";
import {
  artifactDuration,
  artifactTile,
} from "@/features/education/library/artifactVisuals";
import { StudyProgressBar } from "@/features/education/library/components/StudyProgressBar";
import type { LibraryRowStats } from "@/features/education/library/types";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import { cn } from "@/lib/utils";
import { peekHref } from "@/features/organizations/peek/peekHref";
import {
  resolveEntityToken,
  tryGetEntityInfo,
} from "@/features/scopes/registry/entityRegistry";
import {
  kitArtifactKey,
  kitHref,
  kitMembershipFingerprint,
  archiveKit,
  readKit,
  resolveKit,
  restoreKit,
  readKitArtifactStats,
  removeKitMember,
  removeKitMembersVersioned,
  createManualKit,
  renameKit,
  type KitArtifactStats,
  type ManualKitSourceType,
  type StudyKit,
} from "../kitService";
import { MakeMoreFromKit, type AimedMakeMore } from "./MakeMoreFromKit";
import { KitCoverageSection, KitMemberAddMore, KitOutlineCard } from "./KitOutline";
import { useKitOutline } from "../outline/useKitOutline";
import { countsOf } from "../outline/coverage";
import { KitSourcesPanel } from "./KitSourcesPanel";
import { AddSavedAidsDialog } from "./AddSavedAidsDialog";
import { newKitHref } from "@/features/education/onboard/startRoutes";
import { KIT_TOKEN } from "../kitScope";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { EDUCATION_KITS_SURFACE_NAME } from "@/features/surfaces/manifests/education-kits.manifest";
import {
  artifactActionHref,
  buildKitDetailScope,
  orderKitArtifacts,
  pickChallenge,
  STUDY_PATH,
  TRACKED_KINDS,
} from "../kitSurfaceScope";
import { collectionWriteHandlers } from "@ai-matrx/chat/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import { KIT_MEMBER_CANDIDATE_LIMIT, parseKitDeletes, parseKitMemberAdds, parseKitUpdates } from "../kitWrites";
import { fetchEducationLibraryPage } from "@/features/education/library/service";
import type { EducationLibraryRow } from "@/features/education/library/types";
import { DEFAULT_ENTITY_LIST_QUERY } from "@/lib/entity-list/types";
import { Chip } from "@ai-matrx/design-system/controls";

const FORMAT_PROMISE: Record<TargetKind, string> = {
  deck: "Build recall one card at a time.",
  quiz: "Run a quick check and find the gaps.",
  practice_test: "Test your readiness across the whole topic.",
  summary: "Start with the most important ideas.",
  notes: "Review the key terms and details.",
  mind_map: "See how the ideas connect.",
  memory_aid: "Make the hardest details easier to remember.",
  audio: "Keep learning away from the screen.",
};


function unitCount(kind: TargetKind, count: number | null): string | null {
  const unit = TARGET_PRESENTATION[kind].unit;
  if (!unit || count == null) return null;
  return `${count} ${count === 1 ? unit.one : unit.many}`;
}

function ArtifactCard({
  artifact,
  stats,
  statsLoading,
  statsFailed,
}: {
  artifact: GeneratedArtifact;
  stats?: LibraryRowStats;
  statsLoading: boolean;
  statsFailed: boolean;
}) {
  const kind = artifact.targetKind;
  if (!kind) return null;
  const look = TARGET_PRESENTATION[kind];
  const Icon = look.icon;
  const count = unitCount(kind, stats?.itemCount ?? null);
  const duration = artifactDuration(stats?.durationSeconds ?? null);
  const hasTrackedProgress = stats?.hasProgress ?? false;
  const showProgressUnavailable = statsFailed && TRACKED_KINDS.has(kind);

  return (
    <Link
      href={artifactActionHref(artifact)}
      className={cn(
        "group flex min-h-48 flex-col rounded-2xl border border-border bg-card p-4 transition-[border-color,transform,translate,background-color] hover:-translate-y-0.5 hover:bg-accent/30",
        look.hoverBorder,
      )}
      aria-label={`${look.verb} ${look.label}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
            artifactTile(look),
          )}
        >
          <Icon className="h-6 w-6" />
        </span>
        {stats?.dueCount ? (
          <Chip tone="warning" icon={<CalendarClock />} label={`${stats.dueCount} due`} />
        ) : null}
      </div>

      <div className="mt-4">
        <h3 className="text-lg font-semibold text-foreground">{look.label}</h3>
        <p className="mt-1 type-body leading-relaxed text-muted-foreground">
          {FORMAT_PROMISE[kind]}
        </p>
      </div>

      <div className="mt-4 min-h-12">
        {statsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-1.5 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : hasTrackedProgress && stats ? (
          <>
            <StudyProgressBar
              studied={stats.studiedCount}
              total={stats.itemCount}
              accuracy={stats.accuracy}
              className="mb-2"
            />
            <p className="type-secondary font-medium text-foreground">
              {stats.itemCount != null
                ? `${stats.studiedCount} of ${stats.itemCount} practiced`
                : `${stats.studiedCount} practiced`}
              {stats.accuracy != null &&
                ` · ${Math.round(stats.accuracy * 100)}% correct`}
            </p>
            {stats.lastStudiedAt && (
              <p className="mt-1 type-secondary text-muted-foreground">
                Last studied {formatRelativeTime(stats.lastStudiedAt)}
              </p>
            )}
          </>
        ) : showProgressUnavailable ? (
          <p className="type-secondary text-warning">
            Progress is unavailable right now.
          </p>
        ) : (
          <p className="type-secondary text-muted-foreground">
            {duration ?? count ?? artifact.detail ?? "Ready when you are"}
          </p>
        )}
      </div>

      <span
        className={cn(
          "mt-auto inline-flex min-h-10 items-center gap-1.5 self-start rounded-lg px-3 type-title transition-colors group-hover:brightness-110",
          artifactTile(look),
        )}
      >
        {hasTrackedProgress ? `Continue ${look.label}` : look.verb}
        <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

/**
 * THE KIT PAGE BODY — the one container every state of this page renders in
 * (loading, read failure, no kit yet, the kit). It owns the gap under the
 * header ONCE. The page clears the header to its exact edge and the shell's
 * fade is drawn OVER the first few pixels of content (it takes no layout
 * space, by ruling), so a first block with no gap of its own had its top
 * border washed out under the header — the hero got a per-card `pt-4`, the
 * empty state never did (2026-10-04). Every state now inherits the gap.
 */
function KitBody({
  narrow = false,
  className,
  children,
}: {
  narrow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <main
      className={cn(
        "mx-auto w-full px-4 pb-10 pt-4",
        narrow ? "max-w-3xl" : "max-w-6xl",
        className,
      )}
    >
      {children}
    </main>
  );
}

function KitLoading({ header }: { header: ReactNode }) {
  return (
    <>
      {header}
      <KitBody className="matrx-touch-targets space-y-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </KitBody>
    </>
  );
}

export function KitHub({
  sourceId,
  sourceType: sourceTypeProp,
  addTarget,
  renderHeader,
  proposedLayout = false,
}: {
  sourceId: string;
  sourceType?: string;
  /** `?add=<kind>` — the format the learner came here to add (the home's nudge). */
  addTarget?: TargetKind;
  /**
   * Replaces the default `EducationToolHeader`. Used by the ui-unification
   * sample (/demos/ui-unification/samples/education-kit) to draw the sitewide
   * crumb header over this exact page.
   */
  renderHeader?: (state: { title: string | null; loading: boolean }) => ReactNode;
  /**
   * The owner's proposed layout (ui-unification sample only, 2026-10-04): the
   * kit's actions sit BELOW the hero as one uniform outline button, and the
   * hero drops its "Your study path" pill and its evidence sentence. Nothing
   * else changes — this page is the model for inviting pages.
   */
  proposedLayout?: boolean;
}) {
  const router = useRouter();
  // No type in the link: the id alone is resolved (kit scope first, then a file's kit).
  const sourceType = sourceTypeProp ?? "file";
  const [managing, setManaging] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [writeError, setWriteError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);

  // THE KIT AND ITS PROGRESS ARE READ ONCE PER TAB (`useStoreRead`, Redux `storeReads`, keyed by
  // the source): a remount, a wake from sleep (a Board tile) or a second view renders the kept
  // copy and reads nothing, and never drops to the skeleton. `reload` is the deliberate re-read
  // after a write or a conversion. Progress also re-reads in the background when the kept copy
  // is over a minute old (the person studied somewhere else and came back).
  const dispatchRead = useDispatchThunk();
  const kitKey = `education.kit:${sourceTypeProp ?? "auto"}:${sourceId}`;
  const statsKey = `education.kit_stats:${sourceTypeProp ?? "auto"}:${sourceId}`;
  const kitRead = useStoreRead<StudyKit | null>(kitKey, () => resolveKit(sourceId, sourceTypeProp));
  const kit = kitRead.data ?? null;
  // An older kit that was promoted to its own record answers its old link with
  // that record — move the address to the kit's own.
  const movedTo = kit && (kit.sourceId !== sourceId || (sourceTypeProp !== undefined && kit.sourceType !== sourceTypeProp)) ? kitHref(kit.sourceType, kit.sourceId) : null;
  useEffect(() => {
    if (movedTo) router.replace(movedTo);
  }, [movedTo, router]);
  const statsRead = useStoreRead<KitArtifactStats>(statsKey, () => readKitArtifactStats(kit?.artifacts ?? []), {
    enabled: kit !== null,
    staleAfterMs: 60_000,
  });
  // The saved aids an agent may add (bounded; the Add saved aids dialog has the full list). Read once per tab.
  const candidatesKey = `education.kit_candidates:${sourceTypeProp ?? "auto"}:${sourceId}`;
  const readCandidates = async (): Promise<EducationLibraryRow[]> => {
    const page = await fetchEducationLibraryPage(
      { ...DEFAULT_ENTITY_LIST_QUERY, scope: { kind: "mine" }, page: 1 },
      { sort: "updated", direction: "desc", favoritesFirst: false, pageSize: KIT_MEMBER_CANDIDATE_LIMIT * 2 },
    );
    return page.rows;
  };
  const candidatesRead = useStoreRead<EducationLibraryRow[]>(candidatesKey, readCandidates, {
    enabled: kit !== null,
    staleAfterMs: 60_000,
  });
  // The kit's Outline + coverage (living-kit W1/W3); refresh-safe run reattach.
  const outline = useKitOutline(kit);
  const [aimed, setAimed] = useState<AimedMakeMore | null>(null);
  const outlineForDialog =
    outline.sections && outline.sections.length > 0 && outline.coverage
      ? {
          sections: outline.sections,
          cards: countsOf(outline.coverage, "cards"),
          questions: countsOf(outline.coverage, "questions"),
        }
      : undefined;
  const loading = !kitRead.hasData && !kitRead.isError;
  const loadError = kitRead.isError;
  const stats: KitArtifactStats = statsRead.data ?? {};
  const statsLoading = kit !== null && !statsRead.hasData && !statsRead.isError;
  const statsFailed = statsRead.isError;
  const reload = () => {
    void (async () => {
      const fresh = await dispatchRead(
        refreshStoreRead(kitKey, () => resolveKit(sourceId, sourceTypeProp)),
      );
      if (fresh) await dispatchRead(refreshStoreRead(statsKey, () => readKitArtifactStats(fresh.artifacts)));
      await dispatchRead(refreshStoreRead(candidatesKey, readCandidates));
    })();
  };

  const getScope = () =>
    buildKitDetailScope({
      sourceId,
      sourceType,
      kit,
      loading,
      loadError,
      stats,
      statsLoading,
      statsFailed,
      memberCandidates: candidatesRead.data,
    });
  const getWriteHandlers = () => {
    if (!kit) return {};
    const collection = collectionWriteHandlers({
      plural: "kits", singular: "kit",
      update: {
        parse: (value) => { if (writing || (managing && draftTitle !== kit.title)) throw new Error("Save or cancel your kit title edits before applying agent changes."); return parseKitUpdates(value, [kit]); },
        run: async (plan) => {
          await renameKit(plan.kit, plan.title, plan.fingerprint);
          reload();
          return { id: plan.kit.sourceId, name: plan.title };
        },
        nameOf: (plan) => plan.title,
        changedOf: () => ["title"],
      },
      delete: {
        parse: (value) => { if (writing || (managing && draftTitle !== kit.title)) throw new Error("Save or cancel your kit title edits before applying agent changes."); return parseKitDeletes(value, [kit]); },
        run: async (plan) => {
          await archiveKit(plan.kit, plan.fingerprint);
          router.push("/education/kits");
          return { id: plan.kit.sourceId, name: plan.kit.title };
        },
        nameOf: (plan) => plan.kit.title,
      },
    }, refuseSurfaceWrite);
    const parseMemberRemoval = (value: unknown) => {
      if (writing || (managing && draftTitle !== kit.title)) {
        throw new Error("Save or cancel your kit title edits before applying agent changes.");
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("remove_kit_members needs { expected_membership_fingerprint, artifact_refs }.");
      }
      const raw = value as Record<string, unknown>;
      const fingerprint = raw.expected_membership_fingerprint;
      if (typeof fingerprint !== "string" || fingerprint !== kitMembershipFingerprint(kit)) {
        throw new Error("remove_kit_members membership fingerprint is stale.");
      }
      if (!Array.isArray(raw.artifact_refs) || raw.artifact_refs.length === 0) {
        throw new Error("remove_kit_members needs qualified artifact_refs.");
      }
      const refs = raw.artifact_refs.map((ref) => {
        if (!ref || typeof ref !== "object" || Array.isArray(ref)) {
          throw new Error("remove_kit_members needs qualified artifact_refs.");
        }
        const candidate = ref as Record<string, unknown>;
        if (typeof candidate.kind !== "string" || !candidate.kind || typeof candidate.id !== "string" || !candidate.id) {
          throw new Error("remove_kit_members needs qualified artifact_refs.");
        }
        return { kind: candidate.kind, id: candidate.id };
      });
      return { fingerprint, refs };
    };
    const parseMemberAdd = (value: unknown) => {
      if (writing || (managing && draftTitle !== kit.title)) {
        throw new Error("Save or cancel your kit title edits before applying agent changes.");
      }
      return parseKitMemberAdds(value, kit, candidatesRead.data ?? []);
    };
    return { ...collection, add_kit_members: {
      validate: (value: unknown) => { parseMemberAdd(value); },
      apply: async (value: unknown) => {
        const plan = parseMemberAdd(value);
        // The same write the Add saved aids dialog runs.
        await createManualKit({ sourceId: kit.sourceId, sourceType: kit.sourceType as ManualKitSourceType, title: plan.title, artifacts: plan.artifacts, allowExisting: true, expectedFingerprint: plan.expectedFingerprint });
        reload();
        return { summary: `Added ${plan.artifacts.length} saved study aid${plan.artifacts.length === 1 ? "" : "s"} to the kit.`, data: { added: plan.artifacts.map((row) => ({ kind: row.kind, id: row.id, title: row.title })) } };
      },
    }, remove_kit_members: {
      validate: (value: unknown) => { parseMemberRemoval(value); },
      apply: async (value: unknown) => {
        const { refs, fingerprint } = parseMemberRemoval(value);
        await removeKitMembersVersioned(kit, refs, fingerprint);
        reload();
        return { summary: `Removed ${refs.length} study aid${refs.length === 1 ? "" : "s"} from the kit.` };
      },
    } };
  };
  const withSurface = (children: ReactNode) => (
    <SurfaceRuntimeProvider
      surfaceName={EDUCATION_KITS_SURFACE_NAME}
      getScope={getScope}
      getWriteHandlers={getWriteHandlers}
    >
      {children}
    </SurfaceRuntimeProvider>
  );

  const header = (title: string | null) =>
    renderHeader ? (
      renderHeader({ title, loading })
    ) : (
      <EducationToolHeader title={title ?? "Study kit"} />
    );

  if (loading) return withSurface(<KitLoading header={header(null)} />);

  if (loadError) {
    return withSurface(
      <>
        {header(null)}
        <KitBody narrow>
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 text-center">
            <AGENT_ICON className="h-8 w-8 text-warning" />
            <div>
              <h2 className="font-semibold text-foreground">
                This study kit could not be loaded
                <ErrorAlchemyMenu />
              </h2>
              <p className="mt-1 type-body text-muted-foreground">
                Your material is still safe. Try the read again.
              </p>
            </div>
            <Button onClick={() => reload()}>
              Try again
            </Button>
          </div>
        </KitBody>
      </>
    );
  }

  if (!kit) {
    return withSurface(
      <>
        {header(null)}
        <KitBody narrow className="matrx-touch-targets">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
            <AGENT_ICON className="h-8 w-8 text-muted-foreground" />
            <p className="type-body text-muted-foreground">
              This material has no study kit grouping yet.
            </p>
            {sourceType === "file" ? (
              <Button asChild size="sm" className="gap-1.5">
                <Link href={newKitHref({ source: sourceId })} data-tap-target>
                  <AGENT_ICON className="h-4 w-4" />
                  Create a study kit from this material
                </Link>
              </Button>
            ) : (
              <MakeMoreFromKit
                sourceType={sourceType}
                sourceId={sourceId}
                kitTitle=""
                addTarget={addTarget}
                onConverted={() => reload()}
              />
            )}
          </div>
        </KitBody>
      </>
    );
  }

  const originToken = resolveEntityToken(kit.sourceType);
  const materialHref =
    originToken === KIT_TOKEN
      ? null // a kit's material is its Sources list
      : originToken === "file"
      ? `/files/f/${kit.sourceId}`
      : (peekHref(originToken, kit.sourceId) ?? null);
  const MaterialIcon = tryGetEntityInfo(originToken)?.Icon ?? FileSearch;

  const ordered = orderKitArtifacts(kit);

  const itemTotal = ordered.reduce(
    (sum, artifact) => sum + (stats[kitArtifactKey(artifact)]?.itemCount ?? 0),
    0,
  );
  const practicedTotal = ordered.reduce(
    (sum, artifact) =>
      sum + (stats[kitArtifactKey(artifact)]?.studiedCount ?? 0),
    0,
  );
  const dueTotal = ordered.reduce(
    (sum, artifact) => sum + (stats[kitArtifactKey(artifact)]?.dueCount ?? 0),
    0,
  );
  const challenge = pickChallenge(ordered, stats)?.artifact;
  const challengeKind = challenge?.targetKind ?? null;
  const challengeLook = challengeKind
    ? TARGET_PRESENTATION[challengeKind]
    : null;
  const challengeStats = challenge
    ? stats[kitArtifactKey(challenge)]
    : undefined;
  const studyNotes = ordered.find((artifact) => artifact.targetKind === "notes");

  const saveTitle = async () => {
    setWriting(true);
    setWriteError(null);
    try {
      await renameKit(kit, draftTitle);
      setManaging(false);
      reload();
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : "Could not rename this study kit.");
    } finally {
      setWriting(false);
    }
  };
  const removeMember = async (artifact: GeneratedArtifact) => {
    setWriting(true);
    setWriteError(null);
    try {
      await removeKitMember(kit, artifact);
      reload();
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : "Could not remove this study aid.");
    } finally {
      setWriting(false);
    }
  };
  const removeWholeKit = async () => {
    const accepted = await confirm({
      title: "Archive this study kit?",
      description: "Your source material and study aids stay saved. Restore the kit from the archive.",
      confirmLabel: "Archive kit",
    });
    if (!accepted) return;
    setWriting(true);
    setWriteError(null);
    try {
      const archived = await archiveKit(kit);
      toast.success(`Archived "${kit.title}".`, {
        action: {
          label: "Undo",
          onClick: () =>
            void restoreKit(archived).then(
              () => {
                toast.success(`Put back "${kit.title}".`);
                router.push(kitHref(archived.sourceType, archived.sourceId));
              },
              (err: unknown) => toast.error(err instanceof Error ? err.message : "It could not be put back."),
            ),
        },
      });
      // Always leave the archived kit's address, whichever state the page was in.
      router.replace("/education/kits");
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : "Could not archive this study kit.");
      setWriting(false);
    }
  };

  // Proposed layout: one canonical button for all five actions — same
  // variant, same size, same shape (the real row mixes primary/outline and
  // default/sm sizes).
  const proposedButton = "min-h-11 gap-1.5 sm:min-h-10";
  const actionRow = proposedLayout ? (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {studyNotes && (
        <Button asChild variant="outline" className={proposedButton}>
          <Link href={artifactActionHref(studyNotes)}>
            <NotebookPen className="h-4 w-4" />
            Study guide
          </Link>
        </Button>
      )}
      {materialHref && (
        <Button asChild variant="outline" className={proposedButton}>
          <Link href={materialHref}>
            <MaterialIcon className="h-4 w-4" />
            Material
          </Link>
        </Button>
      )}
      <MakeMoreFromKit
        key={kit.sources.map((s) => s.edgeId).join("|")}
        sources={kit.sources}
        organizationId={kit.organizationId}
        sourceType={kit.sourceType}
        sourceId={kit.sourceId}
        kitTitle={kit.title}
        addTarget={addTarget}
        onConverted={() => reload()}
        outline={outlineForDialog}
        aimed={aimed}
        buttonVariant="outline"
        buttonClassName={proposedButton}
      />
      <AddSavedAidsDialog
        kit={kit}
        onAdded={reload}
        trigger={
          <Button variant="outline" className={proposedButton}>
            <Plus className="h-4 w-4" />
            Add saved aid
          </Button>
        }
      />
      <Button
        variant="outline"
        className={proposedButton}
        onClick={() => {
          setDraftTitle(kit.title);
          setManaging((open) => !open);
          setWriteError(null);
        }}
      >
        {managing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        {managing ? "Close" : "Manage kit"}
      </Button>
    </div>
  ) : (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          {studyNotes && (
            <Button asChild variant="outline" className="min-h-11 gap-1.5 sm:min-h-10">
              <Link href={artifactActionHref(studyNotes)}>
                <NotebookPen className="h-4 w-4" />
                Study guide
              </Link>
            </Button>
          )}
          {materialHref && (
            <Button
              asChild
              variant="outline"
              className="min-h-11 gap-1.5 sm:min-h-10"
            >
              <Link href={materialHref}>
                <MaterialIcon className="h-4 w-4" />
                Material
              </Link>
            </Button>
          )}
          <MakeMoreFromKit
            key={kit.sources.map((s) => s.edgeId).join("|")}
            sources={kit.sources}
            organizationId={kit.organizationId}
            sourceType={kit.sourceType}
            sourceId={kit.sourceId}
            kitTitle={kit.title}
            addTarget={addTarget}
            onConverted={() => {
              reload();
              outline.reload();
            }}
            outline={outlineForDialog}
            aimed={aimed}
          />
          <AddSavedAidsDialog
            kit={kit}
            onAdded={reload}
            trigger={<Button variant="outline" size="sm">Add saved aid</Button>}
          />
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 gap-1.5 sm:min-h-10"
            onClick={() => {
              setDraftTitle(kit.title);
              setManaging((open) => !open);
              setWriteError(null);
            }}
          >
            {managing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            {managing ? "Close" : "Manage kit"}
          </Button>
        </div>
  );
  const managePanel = managing ? (

          <section className="rounded-2xl border border-border bg-card p-4 sm:p-5" aria-label="Manage study kit">
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-56 flex-1 text-sm font-medium text-foreground">
                Kit title
                <Input className="mt-1.5" value={draftTitle} disabled={writing} onChange={(event) => setDraftTitle(event.target.value)} />
              </label>
              <Button size="sm" disabled={writing || draftTitle.trim() === kit.title} onClick={() => void saveTitle()}>Save title</Button>
            </div>
            <p className="mt-4 type-secondary text-muted-foreground">Make more from it adds a new study aid. Removing an aid only takes it out of this kit; it stays saved in your library.</p>
            <div className="mt-3 divide-y divide-border rounded-xl border border-border">
              {ordered.map((artifact) => (
                <div key={artifact.edgeId} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate type-body text-foreground">{artifact.title}</span>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={writing} onClick={() => void removeMember(artifact)}><X className="h-4 w-4" />Remove</Button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
              <p className="type-secondary text-muted-foreground">Archiving keeps your material and study aids saved.</p>
              <Button size="sm" variant="destructive" disabled={writing} onClick={() => void removeWholeKit()}><Archive className="h-4 w-4" />Archive kit</Button>
            </div>
            {writeError && <p className="mt-3 type-body text-destructive">{writeError} <ErrorAlchemyMenu error={writeError} /></p>}
          </section>
  ) : null;

  return withSurface(
    <>
      {header(kit.title)}
      <KitBody className="space-y-7">
        {!proposedLayout && actionRow}
        {!proposedLayout && managePanel}
        <KitSourcesPanel kit={kit} onChanged={reload} onMoved={(id) => router.replace(kitHref(KIT_TOKEN, id))} />
        <KitOutlineCard outline={outline} onMoved={(id) => router.replace(kitHref(KIT_TOKEN, id))} />
        {outline.coverage && outline.sections && outline.sections.length > 0 ? (
          <KitCoverageSection
            coverage={outline.coverage}
            sections={outline.sections}
            onMakeMore={(section) => setAimed({ sections: [section], kind: "deck", nonce: Date.now() })}
            onGoDeeper={(section) => setAimed({ sections: [section], kind: "practice_test", nonce: Date.now() })}
          />
        ) : null}


        <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-card-textured p-5 sm:p-7">
          <div className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)] lg:items-center">
            <div>
              {!proposedLayout && (
                <Chip tone="primary" icon={<Route />} label="Your study path" className="mb-4" />
              )}
              <h1 className="max-w-2xl text-[clamp(1.75rem,1.4rem+1.5vw,2.75rem)] font-semibold leading-tight text-foreground">
                Pick a way in. Build toward what you can prove.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Start with the big picture, strengthen recall, then test what
                sticks.
                {!proposedLayout &&
                  " Each progress number below comes from that study aid\u2019s real activity."}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-border bg-background/70 px-3 py-1.5 type-secondary font-medium text-foreground">
                  {ordered.length} study {ordered.length === 1 ? "aid" : "aids"}
                </span>
                {!statsLoading && itemTotal > 0 && (
                  <span className="rounded-full border border-border bg-background/70 px-3 py-1.5 type-secondary font-medium text-foreground">
                    {itemTotal} practice items
                  </span>
                )}
                {!statsLoading && practicedTotal > 0 && (
                  <span className="rounded-full border border-border bg-background/70 px-3 py-1.5 type-secondary font-medium text-foreground">
                    {practicedTotal} practiced
                  </span>
                )}
                {!statsLoading && dueTotal > 0 && (
                  <span className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1.5 type-secondary font-semibold text-warning-ink">
                    {dueTotal} due now
                  </span>
                )}
              </div>
            </div>

            {challenge && challengeLook && (
              <div className="rounded-2xl border border-glass-edge bg-glass p-4 shadow-glass backdrop-blur-glass backdrop-saturate-glass sm:p-5">
                <div className="flex items-center gap-2 type-secondary font-semibold uppercase tracking-wide text-primary">
                  <Flag className="h-4 w-4" />
                  Next challenge
                </div>
                <p className="mt-3 text-xl font-semibold text-foreground">
                  {challengeStats?.dueCount
                    ? `Clear ${challengeStats.dueCount} due ${challengeStats.dueCount === 1 ? "item" : "items"}`
                    : challengeStats?.hasProgress
                      ? `Continue ${challengeLook.label}`
                      : `Try ${challengeLook.label}`}
                </p>
                <p className="mt-1 type-body text-muted-foreground">
                  {challengeStats?.dueCount
                    ? `A focused ${challengeLook.label.toLowerCase()} review is ready.`
                    : challengeKind
                      ? FORMAT_PROMISE[challengeKind]
                      : "Choose a study aid to begin."}
                </p>
                <div className="mt-4">
                <ControlButton
                  asChild
                  hero
                  variant="primary"
                  className="w-full"
                >
                  <Link href={artifactActionHref(challenge)}>
                    {challengeStats?.hasProgress
                      ? "Continue"
                      : challengeLook.verb}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </ControlButton>
                </div>
              </div>
            )}
          </div>
        </section>

        {proposedLayout && actionRow}
        {proposedLayout && managePanel}

        <section aria-labelledby="study-path-heading">
          <div className="mb-4 flex items-center gap-2">
            <Route className="h-5 w-5 text-primary" />
            <h2
              id="study-path-heading"
              className="text-lg font-semibold text-foreground"
            >
              Choose your route
            </h2>
          </div>
          <div className="grid gap-7 lg:grid-cols-3 lg:gap-5">
            {STUDY_PATH.map((stage) => {
              const stageArtifacts = stage.kinds.flatMap((kind) =>
                ordered.filter((artifact) => artifact.targetKind === kind),
              );
              if (stageArtifacts.length === 0) return null;
              return (
                <div key={stage.number} className="min-w-0">
                  <div className="mb-3 flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary type-secondary font-bold text-primary-foreground">
                      {stage.number}
                    </span>
                    <div>
                      <h3 className="font-semibold text-foreground">
                        {stage.title}
                      </h3>
                      <p className="mt-0.5 type-secondary leading-relaxed text-muted-foreground">
                        {stage.description}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {stageArtifacts.map((artifact) => (
                      <div key={artifact.edgeId} className="space-y-2">
                        <ArtifactCard
                          artifact={artifact}
                          stats={stats[kitArtifactKey(artifact)]}
                          statsLoading={statsLoading}
                          statsFailed={statsFailed}
                        />
                        {artifact.artifactType === "fc_set" || artifact.artifactType === "assessment" ? (
                          <KitMemberAddMore
                            artifact={artifact}
                            sources={kit.sources}
                            onAdded={() => {
                              reload();
                              outline.reload();
                            }}
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </KitBody>
    </>
  );
}
