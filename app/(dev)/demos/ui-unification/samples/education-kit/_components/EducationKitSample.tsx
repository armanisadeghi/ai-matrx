"use client";

/**
 * /education/kits/[sourceId], rebuilt on the settled 28px system — an HONEST
 * rebuild (owner, 2026-10-03): the same kit read, the same per-aid progress,
 * the same next-challenge pick, the same writes (rename, remove an aid, delete
 * the kit), the same "Make more from it" door (the REAL `MakeMoreFromKit`), the
 * same agent surface (`matrx-user/education-kits` scope + write handlers).
 * Nothing the real page offers is missing.
 *
 * What changed, and only this:
 * - Header: the sitewide crumb pattern (back + Education › Kits › kit, each
 *   level with its sibling menu) instead of a title-only header.
 * - The ~330px hero (eyebrow pill, 44px headline, three-line paragraph, chip
 *   row, glass side card) becomes ONE compact `PromoBanner` row: the next
 *   challenge, its evidence chips, its one button. The headline and paragraph
 *   were prose, not information; the numbers survive as chips.
 * - Every button is the 28px one control (capsule, 13px, 16px glyph); the real
 *   page mixed 40px, 44px and 32px buttons in one row.
 * - Aid cards: 8px radius, bordered, 32px icon tile, one 12px line — the real
 *   cards were 192px tall with 24px rounding and a 40px pill CTA.
 * - Stage descriptions moved into the stage title's tooltip (prose, not data).
 * - Manage kit: hairline rows in one bordered group, the delete in its own
 *   danger group (the three delete tiers).
 */

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  FileSearch,
  Flag,
  NotebookPen,
  Package,
  Pencil,
  Route,
  Trash2,
  X,
} from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import { CrumbTrailHeader, type CrumbOption } from "@/features/shell/components/header/templates/CrumbTrailHeader";
import { EDUCATION_NAV_ITEMS } from "@/features/education/components/EducationHeader";
import { TARGET_PRESENTATION } from "@/features/education/convert/targetPresentation";
import type { GeneratedArtifact } from "@/features/education/convert/lineage";
import { ALL_TARGET_KINDS, type TargetKind } from "@/features/education/convert/types";
import { artifactDuration, artifactTile } from "@/features/education/library/artifactVisuals";
import { StudyProgressBar } from "@/features/education/library/components/StudyProgressBar";
import type { LibraryRowStats } from "@/features/education/library/types";
import { peekHref } from "@/features/organizations/peek/peekHref";
import { resolveEntityToken, tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import {
  deleteKit,
  kitArtifactKey,
  kitMembershipFingerprint,
  listKits,
  readKit,
  readKitArtifactStats,
  removeKitMember,
  removeKitMembersVersioned,
  renameKit,
  type KitArtifactStats,
  type StudyKit,
} from "@/features/education/kits/kitService";
import { MakeMoreFromKit } from "@/features/education/kits/components/MakeMoreFromKit";
import {
  artifactActionHref,
  buildKitDetailScope,
  orderKitArtifacts,
  pickChallenge,
  STUDY_PATH,
  TRACKED_KINDS,
} from "@/features/education/kits/kitSurfaceScope";
import { parseKitDeletes, parseKitUpdates } from "@/features/education/kits/kitWrites";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { EDUCATION_KITS_SURFACE_NAME } from "@/features/surfaces/manifests/education-kits.manifest";
import { collectionWriteHandlers } from "@ai-matrx/chat/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import { cn } from "@/lib/utils";
import { EmptyState, RowGroup, SampleScale, SettingRow, ToneBadge } from "../../_components/kit";
import { PromoBanner } from "../../_components/page-top/promo-banner";
import { ReplacesLine } from "../../_components/replaces-line";

/** The kit the owner named (2026-10-03). The clone may not hold it for the
 *  test account — then the sample opens the first kit the clone has. */
const DEFAULT_KIT_ID = "db38865c-f89a-47e9-ae02-0ae98565fee3";
const SAMPLE_PATH = "/demos/ui-unification/samples/education-kit";

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

/* Adopts a REAL component's own button into the one control without editing
   it: the real `MakeMoreFromKit` renders a 44px/32px shadcn Button; inside
   `.uk-adopt` it paints at 28px like every other control. Unlayered CSS beats
   the component's Tailwind utilities (the same reason the `uc-*` prototype
   wins); the rollout does this in the package Button instead. */
const KIT_SAMPLE_CSS = `
.uk-adopt > button { box-sizing: border-box; height: var(--matrx-tap-wide-size); min-height: 0; margin-inline: calc(var(--matrx-tap-gap) / 2);
  padding-inline: var(--uc-pad-icon) var(--uc-pad-text); border-radius: 9999px; font-size: var(--uc-label); font-weight: 500; gap: 0.375rem; line-height: 1; }
.uk-adopt > button svg { width: var(--matrx-tap-icon-size); height: var(--matrx-tap-icon-size); }
.uk-adopt > p { flex-basis: 100%; margin-inline: calc(var(--matrx-tap-gap) / 2); }
`;

function unitCount(kind: TargetKind, count: number | null): string | null {
  const unit = TARGET_PRESENTATION[kind].unit;
  if (!unit || count == null) return null;
  return `${count} ${count === 1 ? unit.one : unit.many}`;
}

function AidCard({
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
  const tracked = stats?.hasProgress ?? false;
  const progressUnavailable = statsFailed && TRACKED_KINDS.has(kind);

  return (
    <Link
      href={artifactActionHref(artifact)}
      aria-label={`${look.verb} ${look.label}`}
      className={cn(
        "group flex cursor-pointer flex-col gap-2.5 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/40",
        look.hoverBorder,
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", artifactTile(look))}>
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.8125rem] font-semibold leading-5">{look.label}</div>
          <div className="truncate text-xs leading-4 text-muted-foreground">{FORMAT_PROMISE[kind]}</div>
        </div>
        {stats?.dueCount ? (
          <ToneBadge tone="warning" className="gap-1">
            {stats.dueCount} due
          </ToneBadge>
        ) : null}
      </div>

      <div className="min-h-8">
        {statsLoading ? (
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-1.5 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ) : tracked && stats ? (
          <>
            <StudyProgressBar studied={stats.studiedCount} total={stats.itemCount} accuracy={stats.accuracy} className="mb-1.5" />
            <div className="truncate text-[0.6875rem] text-muted-foreground">
              <span className="font-medium text-foreground">
                {stats.itemCount != null ? `${stats.studiedCount} of ${stats.itemCount} practiced` : `${stats.studiedCount} practiced`}
              </span>
              {stats.accuracy != null && ` · ${Math.round(stats.accuracy * 100)}% correct`}
              {stats.lastStudiedAt && ` · ${formatRelativeTime(stats.lastStudiedAt)}`}
            </div>
          </>
        ) : progressUnavailable ? (
          <div className="text-[0.6875rem] text-warning">Progress is unavailable right now.</div>
        ) : (
          <div className="text-[0.6875rem] text-muted-foreground">{duration ?? count ?? artifact.detail ?? "Ready when you are"}</div>
        )}
      </div>

      <div className="uc-row -mx-[3px]">
        <span className="uc-btn uc-btn-outline">
          {tracked ? `Continue` : look.verb}
          <ArrowRight aria-hidden />
        </span>
      </div>
    </Link>
  );
}

function KitSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading study kit">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-3 w-48" />
        <div className="flex gap-1.5">
          {[88, 76, 132, 104, 100].map((w) => (
            <Skeleton key={w} className="h-7 rounded-full" style={{ width: w }} />
          ))}
        </div>
      </div>
      <Skeleton className="h-14 w-full rounded-lg" />
      <div className="grid gap-5 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-[8.5rem] w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

interface Anchor {
  sourceType: string;
  sourceId: string;
}

export function EducationKitSample() {
  const router = useRouter();
  const params = useSearchParams();
  const requestedId = params.get("id");
  const requestedFrom = params.get("from") ?? "file";
  const addParam = params.get("add") ?? "";
  const addTarget = (ALL_TARGET_KINDS as string[]).includes(addParam) ? (addParam as TargetKind) : undefined;

  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [kit, setKit] = useState<StudyKit | null>(null);
  const [kits, setKits] = useState<StudyKit[] | null>(null);
  const [stats, setStats] = useState<KitArtifactStats>({});
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsFailed, setStatsFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [managing, setManaging] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [writeError, setWriteError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);

  // Sibling kits for the crumb menus (and the fallback when the named kit is
  // not on this database). Never blocks the page.
  useEffect(() => {
    let active = true;
    listKits()
      .then((rows) => active && setKits(rows))
      .catch((error) => {
        console.error("[kit sample] kit list read failed:", error);
        if (active) setKits([]);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        let resolved: Anchor = { sourceType: requestedId ? requestedFrom : "file", sourceId: requestedId ?? DEFAULT_KIT_ID };
        let result = await readKit(resolved.sourceType, resolved.sourceId);
        if (!result && !requestedId) {
          const first = (await listKits())[0];
          if (first) {
            resolved = { sourceType: first.sourceType, sourceId: first.sourceId };
            result = first;
          }
        }
        if (!active) return;
        setAnchor(resolved);
        setKit(result);
        setLoading(false);
        setLoadError(false);
        if (!result) {
          setStats({});
          setStatsLoading(false);
          return;
        }
        setStatsLoading(true);
        try {
          const next = await readKitArtifactStats(result.artifacts);
          if (!active) return;
          setStats(next);
          setStatsFailed(false);
        } catch (error) {
          console.error("[kit sample] artifact progress read failed:", error);
          if (!active) return;
          setStats({});
          setStatsFailed(true);
        } finally {
          if (active) setStatsLoading(false);
        }
      } catch (error) {
        console.error("[kit sample] kit read failed:", error);
        if (!active) return;
        setLoading(false);
        setStatsLoading(false);
        setLoadError(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [requestedId, requestedFrom, refreshKey]);

  const sourceId = anchor?.sourceId ?? requestedId ?? DEFAULT_KIT_ID;
  const sourceType = anchor?.sourceType ?? requestedFrom;
  const realHref = `/education/kits/${sourceId}${sourceType !== "file" ? `?from=${encodeURIComponent(sourceType)}` : ""}`;
  const sampleHref = (k: Pick<StudyKit, "sourceId" | "sourceType">) =>
    `${SAMPLE_PATH}?id=${k.sourceId}${k.sourceType !== "file" ? `&from=${encodeURIComponent(k.sourceType)}` : ""}`;

  /* ---------------- agent surface: identical to the real page ---------------- */
  const getScope = () =>
    buildKitDetailScope({ sourceId, sourceType, kit, loading, loadError, stats, statsLoading, statsFailed });
  const editsOpen = () => writing || (managing && !!kit && draftTitle !== kit.title);
  const getWriteHandlers = () => {
    if (!kit) return {};
    const collection = collectionWriteHandlers(
      {
        plural: "kits",
        singular: "kit",
        update: {
          parse: (value) => {
            if (editsOpen()) throw new Error("Save or cancel your kit title edits before applying agent changes.");
            return parseKitUpdates(value, [kit]);
          },
          run: async (plan) => {
            await renameKit(plan.kit, plan.title, plan.fingerprint);
            setRefreshKey((key) => key + 1);
            return { id: plan.kit.sourceId, name: plan.title };
          },
          nameOf: (plan) => plan.title,
          changedOf: () => ["title"],
        },
        delete: {
          parse: (value) => {
            if (editsOpen()) throw new Error("Save or cancel your kit title edits before applying agent changes.");
            return parseKitDeletes(value, [kit]);
          },
          run: async (plan) => {
            await deleteKit(plan.kit, plan.fingerprint);
            router.push(SAMPLE_PATH);
            return { id: plan.kit.sourceId, name: plan.kit.title };
          },
          nameOf: (plan) => plan.kit.title,
        },
      },
      refuseSurfaceWrite,
    );
    const parseMemberRemoval = (value: unknown) => {
      if (editsOpen()) throw new Error("Save or cancel your kit title edits before applying agent changes.");
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
        if (!ref || typeof ref !== "object" || Array.isArray(ref)) throw new Error("remove_kit_members needs qualified artifact_refs.");
        const candidate = ref as Record<string, unknown>;
        if (typeof candidate.kind !== "string" || !candidate.kind || typeof candidate.id !== "string" || !candidate.id) {
          throw new Error("remove_kit_members needs qualified artifact_refs.");
        }
        return { kind: candidate.kind, id: candidate.id };
      });
      return { fingerprint, refs };
    };
    return {
      ...collection,
      remove_kit_members: {
        validate: (value: unknown) => {
          parseMemberRemoval(value);
        },
        apply: async (value: unknown) => {
          const { refs, fingerprint } = parseMemberRemoval(value);
          await removeKitMembersVersioned(kit, refs, fingerprint);
          setRefreshKey((key) => key + 1);
          return { summary: `Removed ${refs.length} study aid${refs.length === 1 ? "" : "s"} from the kit.` };
        },
      },
    };
  };

  /* ---------------- header: the sitewide crumb pattern ---------------- */
  const kitOptions: CrumbOption[] = (kits ?? []).map((k) => ({
    label: k.title,
    href: sampleHref(k),
    active: k.sourceId === sourceId,
  }));
  const header = (
    <CrumbTrailHeader
      backHref="/demos/ui-unification"
      trail={[
        { label: "Education", href: "/education/overview" },
        {
          label: "Kits",
          href: "/education/kits",
          optionsLabel: "Education",
          options: EDUCATION_NAV_ITEMS.map((i) => ({ label: i.name, href: i.href, active: i.href === "/education/kits" })),
        },
        { label: kit?.title ?? "Study kit", pending: loading, optionsLabel: "Kits", options: kitOptions },
      ]}
    />
  );

  const shell = (body: ReactNode) => (
    <SurfaceRuntimeProvider surfaceName={EDUCATION_KITS_SURFACE_NAME} getScope={getScope} getWriteHandlers={getWriteHandlers}>
      {header}
      <SampleScale>
        <style dangerouslySetInnerHTML={{ __html: KIT_SAMPLE_CSS }} />
        <div className="uk-page h-full overflow-y-auto bg-textured">
          <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-3 pb-10 pt-2 sm:px-4">{body}</main>
        </div>
      </SampleScale>
    </SurfaceRuntimeProvider>
  );

  if (loading) {
    return shell(
      <>
        <ReplacesLine href={realHref} />
        <KitSkeleton />
      </>,
    );
  }

  if (loadError) {
    return shell(
      <>
        <ReplacesLine href={realHref} />
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={AGENT_ICON}
            title="This study kit could not be loaded"
            line="Your material is still safe. Try the read again."
            action={
              <>
                <button type="button" className="uc-btn uc-btn-primary" onClick={() => setRefreshKey((k) => k + 1)}>
                  Try again
                </button>
                <ErrorAlchemyMenu />
              </>
            }
          />
        </div>
      </>,
    );
  }

  if (!kit) {
    return shell(
      <>
        <ReplacesLine href={realHref} />
        <div className="rounded-lg border border-dashed border-border">
          <EmptyState
            icon={Package}
            title="No study kit for this material yet"
            line="Group what you made from it into one kit."
            action={
              sourceType === "file" ? (
                <Link href={`/education/kits/new?source=${encodeURIComponent(sourceId)}`} className="uc-btn uc-btn-primary">
                  <AGENT_ICON aria-hidden />
                  Create a study kit
                </Link>
              ) : (
                <span className="uk-adopt contents">
                  <MakeMoreFromKit
                    sourceType={sourceType}
                    sourceId={sourceId}
                    kitTitle=""
                    addTarget={addTarget}
                    onConverted={() => setRefreshKey((k) => k + 1)}
                  />
                </span>
              )
            }
          />
        </div>
      </>,
    );
  }

  const originToken = resolveEntityToken(kit.sourceType);
  const materialHref = originToken === "file" ? `/files/f/${kit.sourceId}` : (peekHref(originToken, kit.sourceId) ?? null);
  const MaterialIcon = tryGetEntityInfo(originToken)?.Icon ?? FileSearch;
  const ordered = orderKitArtifacts(kit);
  const sum = (pick: (s: LibraryRowStats | undefined) => number) =>
    ordered.reduce((n, a) => n + pick(stats[kitArtifactKey(a)]), 0);
  const itemTotal = sum((s) => s?.itemCount ?? 0);
  const practicedTotal = sum((s) => s?.studiedCount ?? 0);
  const dueTotal = sum((s) => s?.dueCount ?? 0);
  const challenge = pickChallenge(ordered, stats)?.artifact;
  const challengeKind = challenge?.targetKind ?? null;
  const challengeLook = challengeKind ? TARGET_PRESENTATION[challengeKind] : null;
  const challengeStats = challenge ? stats[kitArtifactKey(challenge)] : undefined;
  const studyNotes = ordered.find((a) => a.targetKind === "notes");

  const saveTitle = async () => {
    setWriting(true);
    setWriteError(null);
    try {
      await renameKit(kit, draftTitle);
      setManaging(false);
      setRefreshKey((key) => key + 1);
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
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : "Could not remove this study aid.");
    } finally {
      setWriting(false);
    }
  };
  const removeWholeKit = async () => {
    const accepted = await confirm({
      title: "Delete this study kit?",
      description: "This removes the kit grouping only. Your source material and study aids stay saved.",
      confirmLabel: "Delete kit",
      variant: "destructive",
    });
    if (!accepted) return;
    setWriting(true);
    setWriteError(null);
    try {
      await deleteKit(kit);
      router.push(SAMPLE_PATH);
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : "Could not delete this study kit.");
      setWriting(false);
    }
  };

  const challengeTitle = challengeLook
    ? challengeStats?.dueCount
      ? `Clear ${challengeStats.dueCount} due ${challengeStats.dueCount === 1 ? "item" : "items"}`
      : challengeStats?.hasProgress
        ? `Continue ${challengeLook.label}`
        : `Try ${challengeLook.label}`
    : "Your study path";
  const challengeLine = challengeLook
    ? challengeStats?.dueCount
      ? `A focused ${challengeLook.label.toLowerCase()} review is ready.`
      : challengeKind
        ? FORMAT_PROMISE[challengeKind]
        : undefined
    : undefined;

  return shell(
    <>
      {/* Provenance + the kit's actions: one row, every button the 28px control. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <ReplacesLine href={realHref} className="min-w-0 flex-1" />
        <div className="uc-row -mr-[3px] justify-end">
          {studyNotes ? (
            <Link href={artifactActionHref(studyNotes)} className="uc-btn uc-btn-outline">
              <NotebookPen aria-hidden />
              Study guide
            </Link>
          ) : null}
          {materialHref ? (
            <Link href={materialHref} className="uc-btn uc-btn-outline">
              <MaterialIcon aria-hidden />
              Material
            </Link>
          ) : null}
          <Link
            href={`/education/kits/new?source=${encodeURIComponent(kit.sourceId)}&from=${encodeURIComponent(kit.sourceType)}`}
            className="uc-btn uc-btn-outline"
          >
            Add saved aid
          </Link>
          <button
            type="button"
            className="uc-btn uc-btn-outline"
            aria-expanded={managing}
            onClick={() => {
              setDraftTitle(kit.title);
              setManaging((open) => !open);
              setWriteError(null);
            }}
          >
            {managing ? <X aria-hidden /> : <Pencil aria-hidden />}
            {managing ? "Close" : "Manage kit"}
          </button>
          <span className="uk-adopt contents">
            <MakeMoreFromKit
              sourceType={kit.sourceType}
              sourceId={kit.sourceId}
              kitTitle={kit.title}
              addTarget={addTarget}
              onConverted={() => setRefreshKey((k) => k + 1)}
            />
          </span>
        </div>
      </div>

      {managing ? (
        <div className="flex flex-col gap-4" aria-label="Manage study kit">
          <RowGroup title="Kit">
            <SettingRow label="Kit title" htmlFor="kit-title">
              <label className="uc-field" style={{ width: "min(20rem, 52vw)" }}>
                <input
                  id="kit-title"
                  value={draftTitle}
                  disabled={writing}
                  aria-label="Kit title"
                  onChange={(event) => setDraftTitle(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="uc-btn uc-btn-primary"
                disabled={writing || draftTitle.trim() === kit.title}
                onClick={() => void saveTitle()}
              >
                Save
              </button>
            </SettingRow>
          </RowGroup>
          <RowGroup title={`Study aids · ${ordered.length}`}>
            {ordered.map((artifact) => {
              const look = artifact.targetKind ? TARGET_PRESENTATION[artifact.targetKind] : null;
              return (
                <div key={artifact.edgeId} className="uk-row flex min-h-9 items-center gap-2 py-1 pl-3 pr-[9px]">
                  {look ? <look.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem]">{artifact.title}</span>
                  <div className="uc-row shrink-0">
                    <button
                      type="button"
                      className="uc-btn uc-btn-quiet uk-quiet"
                      disabled={writing}
                      title="Takes it out of this kit; it stays in your library"
                      onClick={() => void removeMember(artifact)}
                    >
                      <X aria-hidden />
                      Remove
                    </button>
                  </div>
                  {look ? <ToneBadge>{look.label}</ToneBadge> : null}
                </div>
              );
            })}
          </RowGroup>
          <RowGroup title="Danger zone" danger>
            <SettingRow label="Delete this kit" line="Removes the grouping only. Material and aids stay saved.">
              <button type="button" className="uc-btn uc-btn-danger" disabled={writing} onClick={() => void removeWholeKit()}>
                <Trash2 aria-hidden />
                Delete kit
              </button>
            </SettingRow>
          </RowGroup>
          {writeError ? (
            <p className="flex items-center gap-1 px-3 text-xs text-destructive">
              {writeError} <ErrorAlchemyMenu error={writeError} />
            </p>
          ) : null}
        </div>
      ) : null}

      {/* THE single-feature promo — compact: the next move + its evidence. */}
      <PromoBanner
        icon={challengeLook ? Flag : Route}
        eyebrow={challengeLook ? "Next challenge" : "Your study path"}
        title={challengeTitle}
        line={challengeLine}
        chips={
          <>
            <ToneBadge>{ordered.length} study aids</ToneBadge>
            {!statsLoading && itemTotal > 0 ? <ToneBadge>{itemTotal} practice items</ToneBadge> : null}
            {!statsLoading && practicedTotal > 0 ? <ToneBadge>{practicedTotal} practiced</ToneBadge> : null}
            {!statsLoading && dueTotal > 0 ? (
              <ToneBadge tone="warning">
                <CalendarClock className="mr-0.5 inline size-3 align-[-2px]" aria-hidden />
                {dueTotal} due now
              </ToneBadge>
            ) : null}
          </>
        }
        action={
          challenge && challengeLook ? (
            <Link href={artifactActionHref(challenge)} className="uc-btn uc-btn-primary">
              {challengeStats?.hasProgress ? "Continue" : challengeLook.verb}
              <ArrowRight aria-hidden />
            </Link>
          ) : undefined
        }
      />

      <section aria-labelledby="route-heading" className="flex flex-col gap-3">
        <h2 id="route-heading" className="flex items-center gap-1.5 text-[0.8125rem] font-semibold">
          <Route className="size-4 text-primary" aria-hidden />
          Choose your route
        </h2>
        <div className="grid gap-6 lg:grid-cols-3 lg:gap-4">
          {STUDY_PATH.map((stage) => {
            const stageArtifacts = stage.kinds.flatMap((kind) => ordered.filter((a) => a.targetKind === kind));
            if (stageArtifacts.length === 0) return null;
            return (
              <div key={stage.number} className="flex min-w-0 flex-col gap-2">
                <div className="flex items-center gap-2" title={stage.description}>
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[0.6875rem] font-semibold text-primary-foreground">
                    {Number(stage.number)}
                  </span>
                  <h3 className="truncate text-[0.8125rem] font-semibold">{stage.title}</h3>
                  <span className="text-[0.6875rem] text-muted-foreground">{stageArtifacts.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {stageArtifacts.map((artifact) => (
                    <AidCard
                      key={artifact.edgeId}
                      artifact={artifact}
                      stats={stats[kitArtifactKey(artifact)]}
                      statsLoading={statsLoading}
                      statsFailed={statsFailed}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>,
  );
}
