"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { useOpenSaveKitDialog } from "@/features/overlays/openers/saveKitDialog";
import { fetchKits } from "../service";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { cn } from "@/utils/cn";
import { KIT_WORD, KITS_HERO } from "../constants";
import type { KitEntry } from "../types";
import { KitCard } from "./KitCard";
import { ErrorNotice } from "./ErrorNotice";

const ALL = "All";

/** The kits the organization the person SET saved for itself. */
function useOrgKits() {
  const org = useOrganizationRequired();
  const organizationId = org.organizationState === "ready" ? org.organizationId : null;
  const [state, setState] = useState<{ kits: KitEntry[]; error: string | null; loading: boolean }>({
    kits: [],
    error: null,
    loading: true,
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    void fetchKits(createClient(), organizationId).then((r) => {
      if (!cancelled) setState({ kits: r.kits, error: r.error, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId, attempt]);
  return { ...state, organizationId, retry: () => setAttempt((n) => n + 1) };
}

export function KitGallery({ kits, error }: { kits: KitEntry[]; error: string | null }) {
  const router = useRouter();
  const orgKits = useOrgKits();
  const openSave = useOpenSaveKitDialog();
  const { organizations } = useUserOrganizations();
  const orgName = organizations.find((o) => o.id === orgKits.organizationId)?.name ?? "Your organization";
  const [category, setCategory] = useState<string>(ALL);
  const categories = [ALL, ...Array.from(new Set(kits.map((k) => k.manifest.category))).sort()];
  const shown = category === ALL ? kits : kits.filter((k) => k.manifest.category === category);

  return (
    <>
      <PageHeader>
        <HeaderStructured
          title={KIT_WORD.many}
          actions={[{ icon: "PackagePlus", label: `Create a ${KIT_WORD.oneLower} from my setup`, onPress: () => openSave() }]}
        />
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

          <section className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                {orgName}&rsquo;s {KIT_WORD.manyLower}
              </h2>
              <Button size="sm" variant="outline" onClick={() => openSave()}>
                <PackagePlus className="mr-1.5 h-3.5 w-3.5" />
                Create a {KIT_WORD.oneLower} from my setup
              </Button>
            </div>
            {orgKits.error ? (
              <ErrorNotice className="mt-3 max-w-xl" title={`Your organization's ${KIT_WORD.manyLower} could not be loaded.`} error={orgKits.error} onRetry={orgKits.retry} />
            ) : orgKits.kits.length === 0 ? (
              <p className="mt-3 max-w-xl text-sm text-muted-foreground">
                {orgKits.loading
                  ? "Looking for kits your organization saved…"
                  : `None yet. Connect an agent's variable to one of your tables, then save the setup as a ${KIT_WORD.oneLower} so everyone here can install it in one click.`}
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {orgKits.kits.map((kit) => (
                  <KitCard key={kit.key} kit={kit} />
                ))}
              </div>
            )}
          </section>

          <h2 className="mt-10 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">From AI Matrx</h2>

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
            <ErrorNotice
              className="mt-8 max-w-xl"
              title={`The ${KIT_WORD.manyLower} could not be loaded.`}
              error={error}
              onRetry={() => router.refresh()}
            />
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
