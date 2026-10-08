"use client";

// features/education/kits/components/KitsHome.tsx
//
// Every study kit the learner has — the index that makes kits findable at all.
// One row per piece of material, showing what came out of it, so the student who
// uploaded a chapter last week can get back to the whole thing instead of
// hunting six separate per-type lists for its pieces.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import { Button } from "@ai-matrx/design-system";
import { Skeleton } from "@ai-matrx/design-system";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import { TARGET_PRESENTATION } from "@/features/education/convert/targetPresentation";
import { archiveKit, kitMembershipFingerprint, listKits, kitHref, renameKit, type StudyKit } from "../kitService";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import {
  createEducationKitsScope,
  EDUCATION_KITS_SURFACE_NAME,
} from "@/features/surfaces/manifests/education-kits.manifest";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import {
  EducationCollectionNoResults,
  EducationCollectionSearch,
  filterEducationCollection,
} from "@/features/education/components/EducationCollectionSearch";
import { collectionWriteHandlers } from "@ai-matrx/chat/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import { parseKitDeletes, parseKitUpdates } from "../kitWrites";

function KitRow({ kit }: { kit: StudyKit }) {
  return (
    <Link
      href={kitHref(kit.sourceType, kit.sourceId)}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Package className="h-4.5 w-4.5 text-primary" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {kit.title}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {kit.artifacts.length}{" "}
          {kit.artifacts.length === 1 ? "study tool" : "study tools"}
        </span>
      </span>
      {/* The kit's contents at a glance — the icons say what you get. */}
      <span className="flex shrink-0 items-center gap-1">
        {kit.artifacts.slice(0, 6).map((a) => {
          const look = a.targetKind ? TARGET_PRESENTATION[a.targetKind] : null;
          if (!look) return null;
          const Icon = look.icon;
          return (
            <span
              key={a.edgeId}
              className={`flex h-6 w-6 items-center justify-center rounded ${look.chip}`}
              title={a.title}
            >
              <Icon className={`h-3.5 w-3.5 ${look.fg}`} />
            </span>
          );
        })}
      </span>
    </Link>
  );
}

export function KitsHome() {
  const [kits, setKits] = useState<StudyKit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const reload = async () => { setReloadTick((tick) => tick + 1); };
  const [search, setSearch] = useState("");
  const filteredKits = filterEducationCollection(kits, search, (kit) => [
    kit.title,
    ...kit.artifacts.flatMap((artifact) => [
      artifact.title,
      artifact.targetKind,
      artifact.artifactType,
    ]),
  ]);

  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setLoading(true);
      try {
        const rows = await listKits();
        if (!active) return;
        setKits(rows);
        setError(null);
      } catch (err) {
        console.error("[kits] list failed:", err);
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : "Could not load your study kits.",
        );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [reloadTick]);

  // Surface `matrx-user/education-kits` (list view) — read synchronously
  // from render state; the Surface Context window polls it.
  const getScope = () =>
    createEducationKitsScope({
      view: "list",
      kits_loaded: !loading,
      kit_search: search,
      ...(error ? { kits_error: error } : {}),
      ...(!loading && !error
        ? {
            kit_count: kits.length,
            kits: kits.map((kit) => ({
              source_id: kit.sourceId,
              source_type: kit.sourceType,
            title: kit.title,
            membership_fingerprint: kitMembershipFingerprint(kit),
              href: kitHref(kit.sourceType, kit.sourceId),
              artifact_count: kit.artifacts.length,
              formats: [
                ...new Set(
                  kit.artifacts.flatMap((a) => (a.targetKind ? [a.targetKind] : [])),
                ),
              ],
            })),
          }
        : {}),
    });
  const getWriteHandlers = () => collectionWriteHandlers({
    plural: "kits", singular: "kit",
    update: {
      parse: (value) => parseKitUpdates(value, kits),
      run: async (plan) => { await renameKit(plan.kit, plan.title, plan.fingerprint); await reload(); return { id: plan.kit.sourceId, name: plan.title }; },
      nameOf: (plan) => plan.title, changedOf: () => ["title"],
    },
    delete: {
      parse: (value) => parseKitDeletes(value, kits),
      run: async (plan) => { await archiveKit(plan.kit, plan.fingerprint); await reload(); return { id: plan.kit.sourceId, name: plan.kit.title }; },
      nameOf: (plan) => plan.kit.title,
    },
  }, refuseSurfaceWrite);

  return (
    <SurfaceRuntimeProvider
      surfaceName={EDUCATION_KITS_SURFACE_NAME}
      getScope={getScope}
      getWriteHandlers={getWriteHandlers}
    >
      <EducationToolHeader title="Study Kits" />
      <div className="matrx-touch-targets mx-auto w-full max-w-3xl space-y-5 px-4 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Keep saved study aids together with their material.
          </p>
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/education/kits/new" data-tap-target>
              <AGENT_ICON className="h-4 w-4" />
              Create kit
            </Link>
          </Button>
        </div>

        <EducationCollectionSearch
          value={search}
          onValueChange={setSearch}
          label="study kits"
        />

        {loading ? (
          <div className="space-y-2" role="status" aria-busy="true" aria-label="Loading your study kits">
            <SuspenseLoader centered={false} message="Loading your study kits…" />
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-1/5" />
                </span>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-10 text-center">
            <Package className="h-8 w-8 text-amber-600 dark:text-amber-500" />
            <p className="text-sm text-muted-foreground">{error} <ErrorAlchemyMenu error={error} /></p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setReloadTick((tick) => tick + 1)}
            >
              Try again
            </Button>
          </div>
        ) : kits.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
            <Package className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No kits yet. Drop in a PDF, a lecture recording, or your notes and
              you get flashcards, a summary, a quiz, a mind map and more — all
              kept together.
            </p>
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/education/kits/new">
                <AGENT_ICON className="h-4 w-4" />
                Create your first kit
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline"><Link href="/education/start">Generate kit</Link></Button>
          </div>
        ) : filteredKits.length === 0 ? (
          <EducationCollectionNoResults
            query={search}
            label="study kits"
            onClear={() => setSearch("")}
          />
        ) : (
          <div className="space-y-2">
            {filteredKits.map((kit) => (
              <KitRow key={`${kit.sourceType}:${kit.sourceId}`} kit={kit} />
            ))}
          </div>
        )}
      </div>
    </SurfaceRuntimeProvider>
  );
}
