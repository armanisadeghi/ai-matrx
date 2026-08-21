"use client";

// /workflows/bakeoff — the bake-off review console (test scaffolding, not product).
//
// Lets the reviewer point ANY workflow definition at any of the eight bake-off
// run-page designs without hunting UUIDs. Direct browser → Supabase read; the
// eight variant routes are owned by their bake-off directories.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, FlaskConical, Search } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import PageHeader from "@/features/shell/components/header/PageHeader";
import type { Tables } from "@/types/database.types";

const VARIANTS = [
  { slug: "sharp", label: "Sharp" },
  { slug: "reimagine", label: "Reimagine" },
  { slug: "refine", label: "Refine" },
  { slug: "dense", label: "Dense" },
  { slug: "sharp-2", label: "Sharp 2" },
  { slug: "reimagine-2", label: "Reimagine 2" },
  { slug: "refine-2", label: "Refine 2" },
  { slug: "dense-2", label: "Dense 2" },
] as const;

/** The two purpose-built test fixtures, pinned above the catalog. */
const FEATURED = new Set([
  "7cf8fd67-23c7-4df0-918f-8a3b1a3a0010", // Study Pack Demo (fake data, ~20s)
  "31318fb7-5e1a-4554-b174-ca3960d72961", // Bakeoff Test Run (no LLM, instant)
]);

type DefRow = Pick<
  Tables<{ schema: "workflow" }, "definition">,
  "id" | "name" | "description" | "updated_at"
>;

export default function BakeoffPickerPage() {
  const [rows, setRows] = useState<DefRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .schema("workflow")
        .from("definition")
        .select("id,name,description,updated_at")
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(300);
      if (cancelled) return;
      if (err) setError(err.message || "Could not load workflows.");
      else setRows(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    const matched = q
      ? rows.filter((r) => r.name.toLowerCase().includes(q))
      : rows;
    return [
      ...matched.filter((r) => FEATURED.has(r.id)),
      ...matched.filter((r) => !FEATURED.has(r.id)),
    ];
  }, [rows, search]);

  return (
    <>
      <PageHeader>
        <div className="flex items-center gap-2 pr-14">
          <FlaskConical className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Run-page bake-off — pick a workflow, pick a design</span>
        </div>
      </PageHeader>
      <div className="h-full overflow-hidden flex flex-col">
        <div className="mx-auto w-full max-w-5xl px-4 pt-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workflows by name…"
              className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Each design opens this workflow&apos;s full run page — intake, live run, and result. The two
            test fixtures are pinned first: the paced demo (~20s, fake data, real kind components) and
            the instant one.
          </p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-4 pb-8">
            {error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {error}
              </div>
            ) : rows === null ? (
              <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading workflows…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No workflows match that search.</div>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border bg-card">
                {filtered.map((row) => (
                  <li key={row.id} className="p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <div className="min-w-0">
                        <span className="text-sm font-medium">{row.name}</span>
                        {FEATURED.has(row.id) && (
                          <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            test fixture
                          </span>
                        )}
                        {row.description ? (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{row.description}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {VARIANTS.map((v) => (
                          <Link
                            key={v.slug}
                            href={`/workflows/bakeoff/${v.slug}/${row.id}`}
                            target="_blank"
                            rel="noopener"
                            className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground hover:bg-accent hover:text-accent-foreground"
                          >
                            {v.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
