"use client";

// features/acquisition-console/AcquisitionConsolePage.tsx
//
// THE ACQUISITION CONSOLE — /acquisition.
//
// ONE SCREEN PER EXPERT. A person onboarding a Subject Matter Expert opens this
// and reads three answers without asking anyone: what we already have from you,
// what you are connected through, and what is stuck and the one thing that
// unsticks it. Everything a row names is an existing screen, one click away.
//
// CHAMPIONS (common-docs/policies/champions.md): Linear's triage view — every
// open thing on one list with exactly one next action per row, no prose between
// the person and the rows — and Stripe's dashboard — the numbers at the top are
// sums of the rows below them, never a second, separately-computed truth.
//
// 🚨 NOTHING ON THIS SCREEN IS STORED. Every number is counted here out of five
// existing registers, so this page can never be the thing that is stale. That is
// the whole design: a console with its own table would need its own backfill,
// its own refresh and its own class of "the tile says 0 and the list says 5",
// which is precisely the defect this project has hit four times already.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { supabase } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { BLOCKED_COLUMNS, CONNECTED_COLUMNS, HAVE_COLUMNS } from "./columns";
import { loadConsole, type ConsoleData } from "./service";
import { replaceAddressOrNavigate } from "@/lib/url-state/addressWithoutNavigating";

const EMPTY: ConsoleData = {
  have: [],
  connected: [],
  blocked: [],
  rulebooks: [],
  problems: [],
};

/**
 * The section shell: a one-row header with the count IN it, then the table.
 *
 * One row, one name, no repetition, no paragraph telling the person what a table
 * is (memory: "no childish copy / compact panel headers"). The count belongs in
 * the header because it is the same number the table's own rows add up to.
 */
function Section({
  title,
  count,
  aside,
  children,
}: {
  title: string;
  count: number;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="text-sm font-medium">{title}</h2>
        <span className="tabular-nums text-xs text-muted-foreground">
          {count.toLocaleString()}
        </span>
        {aside ? <div className="ml-auto text-xs">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function AcquisitionConsolePage() {
  const organizationId = useAppSelector(selectOrganizationId);
  const router = useRouter();
  const params = useSearchParams();
  const rulebookId = params.get("rulebook");

  const [userId, setUserId] = useState<string | null>(null);
  const [data, setData] = useState<ConsoleData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    supabase.auth
      .getClaims()
      .then((result) => {
        if (!live) return;
        const sub = result.data?.claims?.sub;
        setUserId(typeof sub === "string" ? sub : null);
      })
      .catch(() => {
        if (live) setUserId(null);
      });
    return () => {
      live = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!organizationId || !userId) return;
    setLoading(true);
    setFailure(null);
    try {
      setData(await loadConsole(organizationId, userId, rulebookId));
    } catch (error) {
      // The refusal is printed, never swallowed and never replaced by an empty
      // table that would read as "this workspace has nothing".
      setData(EMPTY);
      setFailure(
        error instanceof Error
          ? error.message
          : "The database refused this read without saying why.",
      );
    } finally {
      setLoading(false);
    }
  }, [organizationId, userId, rulebookId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setRulebook = useCallback(
    (next: string) => {
      const query = new URLSearchParams(params.toString());
      if (next === "all") query.delete("rulebook");
      else query.set("rulebook", next);
      const suffix = query.toString();
      replaceAddressOrNavigate(router, suffix ? `/acquisition?${suffix}` : "/acquisition");
    },
    [params, router],
  );

  const chosenRulebook = useMemo(
    () => data.rulebooks.find((entry) => entry.id === rulebookId) ?? null,
    [data.rulebooks, rulebookId],
  );

  // A workspace was never chosen. This is a QUESTION, not a dead screen: the
  // console is per-workspace by definition and there is no honest default.
  if (!organizationId) {
    return (
      <>
        <PageHeader>
          <h1 className="truncate text-sm font-medium">Acquisition</h1>
        </PageHeader>
        <div className="px-4 pt-[var(--shell-header-h)]">
          <p className="max-w-prose py-8 text-sm text-muted-foreground">
            Pick a workspace from the switcher at the top and this screen fills
            in. It reads one workspace at a time, so there is nothing sensible to
            show until you say which.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader>
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-sm font-medium">Acquisition</h1>
          <span className="hidden truncate text-xs text-muted-foreground md:inline">
            What we have, what you are connected through, what is stuck
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3 text-xs">
          {data.rulebooks.length > 0 && (
            <select
              aria-label="Narrow to one Rulebook"
              value={rulebookId ?? "all"}
              onChange={(event) => setRulebook(event.target.value)}
              className="max-w-[12rem] truncate rounded-md border border-border bg-background px-2 py-1 text-xs"
            >
              <option value="all">Everything in this workspace</option>
              {data.rulebooks.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => void refresh()}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>
      </PageHeader>

      <div className="flex min-w-0 flex-col gap-6 px-3 pb-10 pt-[var(--shell-header-h)] sm:px-4">
        {failure && (
          <p className="max-w-prose rounded-md border border-rose-500/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
            {failure}
          </p>
        )}

        {data.problems.length > 0 && (
          // 🚨 A DROPPED ROW ANNOUNCES ITSELF. The tables below are missing
          // exactly these rows and say so in the words of the field that broke.
          <ul className="max-w-prose list-disc space-y-1 rounded-md border border-amber-500/40 px-6 py-2 text-xs text-amber-800 dark:text-amber-300">
            {data.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}

        <Section
          title="What we have"
          count={data.have.length}
          aside={
            chosenRulebook ? (
              <span className="text-muted-foreground">
                Only what is kept on {chosenRulebook.name}. Libraries belong to
                the whole workspace, so they are not listed under one Rulebook.
              </span>
            ) : (
              <Link
                href="/libraries"
                className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Libraries
              </Link>
            )
          }
        >
          <MatrxDataTable
            urlState={{ id: "acq-have" }}
            data={data.have}
            columns={HAVE_COLUMNS}
            getRowId={(row) => row.id}
            isLoading={loading}
            pageSize={25}
            viewTabs={false}
            density="condensed"
            emptyState={{
              title: "Nothing from this expert yet",
              description:
                "Paste a channel, a feed or an export on Libraries and the first row appears here by itself.",
            }}
            toolbar={{ search: true, searchPlaceholder: "Find a kind of source…" }}
          />
        </Section>

        <Section
          title="What is connected"
          count={data.connected.length}
          aside={
            <Link
              href="/settings/integrations"
              className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Connections
            </Link>
          }
        >
          <MatrxDataTable
            urlState={{ id: "acq-connected" }}
            data={data.connected}
            columns={CONNECTED_COLUMNS}
            getRowId={(row) => row.id}
            isLoading={loading}
            pageSize={25}
            viewTabs={false}
            density="condensed"
            emptyState={{
              title: "No accounts connected",
              description:
                "Connecting an account is how we reach what only a signed-in person can see.",
            }}
            toolbar={{ search: true, searchPlaceholder: "Find an account…" }}
          />
        </Section>

        <Section
          title="What is blocked"
          count={data.blocked.length}
          aside={
            <Link
              href="/acquisition/blocks"
              className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Block Ledger
            </Link>
          }
        >
          <MatrxDataTable
            urlState={{ id: "acq-blocked" }}
            data={data.blocked}
            columns={BLOCKED_COLUMNS}
            getRowId={(row) => row.id}
            isLoading={loading}
            pageSize={25}
            viewTabs={false}
            density="condensed"
            emptyState={{
              title: "Nothing is stuck",
              description:
                "Every fetch, file and connected account this workspace tried came back readable.",
            }}
            toolbar={{ search: true, searchPlaceholder: "Find a block…" }}
          />
        </Section>
      </div>
    </>
  );
}
