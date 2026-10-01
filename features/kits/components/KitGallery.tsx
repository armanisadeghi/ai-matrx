"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus } from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { useOpenSaveKitDialog } from "@/features/overlays/openers/saveKitDialog";
import { fetchAccessibleKits } from "../service";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { cn } from "@/utils/cn";
import { KIT_WORD, KITS_CHANGED_EVENT, KITS_HERO } from "../constants";
import type { KitEntry } from "../types";
import { KitCard } from "./KitCard";
import { ErrorNotice } from "./ErrorNotice";
import { InfoHint } from "@/components/official/InfoHint";

const ALL = "All";

/**
 * The kits the person can reach in EVERY organization they belong to (access
 * belongs to the person — the selected organization never narrows this list).
 * The platform's own kits are the gallery's other section.
 */
function useOrgKits(platformOrganizationId: string | null) {
  const [state, setState] = useState<{ kits: KitEntry[]; error: string | null; loading: boolean }>({
    kits: [],
    error: null,
    loading: true,
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    void fetchAccessibleKits(createClient(), platformOrganizationId).then((r) => {
      if (!cancelled) setState({ kits: r.kits, error: r.error, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [platformOrganizationId, attempt]);
  useEffect(() => {
    const onChanged = () => setAttempt((n) => n + 1);
    window.addEventListener(KITS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(KITS_CHANGED_EVENT, onChanged);
  }, []);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

export function KitGallery({
  kits,
  error,
  platformOrganizationId = null,
}: {
  kits: KitEntry[];
  error: string | null;
  /** The system organization's id, so "your kits" leaves the platform's own to the other section. */
  platformOrganizationId?: string | null;
}) {
  const router = useRouter();
  const orgKits = useOrgKits(platformOrganizationId);
  const openSave = useOpenSaveKitDialog();
  const { organizations } = useUserOrganizations();
  const orgNameOf = (id: string | null) => (id ? (organizations.find((o) => o.id === id)?.name ?? null) : null);
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Start from something that already works
              <span className="ml-2 inline-flex align-middle">
                <InfoHint text={KITS_HERO} label={`What is a ${KIT_WORD.oneLower}?`} side="bottom" />
              </span>
            </h1>
            <Button size="sm" variant="outline" onClick={() => openSave()}>
              <PackagePlus className="mr-1.5 h-3.5 w-3.5" />
              Save my setup as a {KIT_WORD.oneLower}
            </Button>
          </div>

          <section className="mt-8">
            <h2 className="text-base font-semibold text-foreground">From AI Matrx</h2>

            {categories.length > 2 && (
              <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Category">
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
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card text-foreground hover:border-foreground/40",
                    )}
                  >
                    {c}
                    {c !== ALL && (
                      <span className={cn("ml-1 tabular-nums", c === category ? "text-background" : "text-muted-foreground")}>
                        {kits.filter((k) => k.manifest.category === c).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {error ? (
              <ErrorNotice
                className="mt-4 max-w-xl"
                title={`The ${KIT_WORD.manyLower} could not be loaded.`}
                error={error}
                onRetry={() => router.refresh()}
              />
            ) : kits.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No {KIT_WORD.manyLower} published yet.</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((kit) => (
                  <KitCard key={kit.key} kit={kit} />
                ))}
              </div>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-base font-semibold text-foreground">Your organizations&rsquo; {KIT_WORD.manyLower}</h2>
            {orgKits.error ? (
              <ErrorNotice className="mt-3 max-w-xl" title={`Your ${KIT_WORD.manyLower} could not be loaded.`} error={orgKits.error} onRetry={orgKits.retry} />
            ) : orgKits.loading && orgKits.kits.length === 0 ? (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
                <Skeleton className="h-[132px] rounded-xl" />
              </div>
            ) : orgKits.kits.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">None yet. Save an agent that reads your tables.</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {orgKits.kits.map((kit) => (
                  <KitCard key={`${kit.organizationId}:${kit.key}`} kit={kit} subtitle={orgNameOf(kit.organizationId)} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
