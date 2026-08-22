"use client";

// features/education/kits/components/KitsHome.tsx
//
// Every study kit the learner has — the index that makes kits findable at all.
// One row per piece of material, showing what came out of it, so the student who
// uploaded a chapter last week can get back to the whole thing instead of
// hunting six separate per-type lists for its pieces.

import { useEffect, useState } from "react";
import Link from "next/link";
import { BrainCircuit, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import { TARGET_PRESENTATION } from "@/features/education/convert/targetPresentation";
import { listKits, kitHref, type StudyKit } from "../kitService";

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

  useEffect(() => {
    let active = true;
    void listKits()
      .then((rows) => {
        if (!active) return;
        setKits(rows);
      })
      .catch((err: unknown) => {
        console.error("[kits] list failed:", err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <EducationToolHeader title="Study Kits" />
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 pb-8">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Each kit is one piece of your material and everything made from it.
          </p>
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/education/start">
              <BrainCircuit className="h-4 w-4" />
              New kit
            </Link>
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
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
              <Link href="/education/start">
                <BrainCircuit className="h-4 w-4" />
                Create your first kit
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {kits.map((kit) => (
              <KitRow key={`${kit.sourceType}:${kit.sourceId}`} kit={kit} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
