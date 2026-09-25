"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Package, RotateCw } from "lucide-react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { KIT_WORD, KITS_HERO } from "../constants";
import type { KitEntry } from "../types";
import { KitCard } from "./KitCard";

const ALL = "All";

export function KitGallery({ kits, error }: { kits: KitEntry[]; error: string | null }) {
  const router = useRouter();
  const [category, setCategory] = useState<string>(ALL);
  const categories = [ALL, ...Array.from(new Set(kits.map((k) => k.manifest.category))).sort()];
  const shown = category === ALL ? kits : kits.filter((k) => k.manifest.category === category);

  return (
    <>
      <PageHeader>
        <HeaderStructured title={KIT_WORD.many} />
      </PageHeader>
      <div className="h-full overflow-y-auto bg-textured">
        <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-[calc(var(--shell-header-h)+1.5rem)] sm:px-6">
          <section className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              <Package className="h-3 w-3" />
              {KIT_WORD.many}
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
              Start from something that already works
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{KITS_HERO}</p>
          </section>

          {categories.length > 2 && (
            <div className="mt-6 flex flex-wrap gap-1.5" role="tablist" aria-label="Category">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={c === category}
                  onClick={() => setCategory(c)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    c === category
                      ? "border-foreground/80 bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                  )}
                >
                  {c}
                  {c !== ALL && (
                    <span className="ml-1 opacity-60">{kits.filter((k) => k.manifest.category === c).length}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {error ? (
            <div className="mt-8 flex max-w-xl items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">The {KIT_WORD.manyLower} could not be loaded.</p>
                <p className="mt-1 break-words text-xs text-muted-foreground">{error}</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => router.refresh()}>
                  <RotateCw className="mr-1.5 h-3.5 w-3.5" />
                  Try again
                </Button>
              </div>
            </div>
          ) : kits.length === 0 ? (
            <div className="mt-8 flex max-w-xl flex-col items-start rounded-xl border border-dashed border-border bg-card/50 p-6">
              <Package className="h-5 w-5 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium text-foreground">No {KIT_WORD.manyLower} are published yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {KIT_WORD.many} appear here as soon as the platform publishes them.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((kit) => (
                <KitCard key={kit.key} kit={kit} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
