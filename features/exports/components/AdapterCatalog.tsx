"use client";

// features/exports/components/AdapterCatalog.tsx
//
// WHAT YOU CAN DROP HERE — rendered from `GET /media/export-adapters`, never
// from a list in this file.
//
// 🚨 THE UNREADABLE HALF IS PART OF THE ANSWER. A format we recognise and
// cannot read (an Outlook .pst, an iMessage database, an Apple Notes archive)
// is listed here with the server's own `block` sentence, so a person who drops
// one meets an explanation instead of "unknown file". Hiding them would make
// the screen look tidier and leave the person with nothing to do next.
//
// 🚨 NOTHING HERE RENDERS A RAW RESPONSE FIELD. Every value below came out of
// `../contract`, which checked it. This component used to put the server's
// `recognised_not_readable` straight into a JSX child; on 2026-09-17 the server
// began sending that key as a LIST of `{label, block}` objects and React threw
// "Objects are not valid as a React child" on every load of `/exports`, before
// the drop zone painted. A count the list beside it already proves is now
// recovered rather than fatal — and the recovery SAYS SO, in the banner below.

import { useEffect, useState } from "react";
import { AlertCircle, Ban, Check } from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";
import { extractErrorMessage } from "@ai-matrx/data/net";
import { cn } from "@/lib/utils";
import { fetchExportAdapters } from "../api";
import type { ExportAdapter, ExportAdapterCatalog } from "../types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

function AdapterRow({ adapter }: { adapter: ExportAdapter }) {
  return (
    <li
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3 py-2",
        adapter.implemented
          ? "border-border bg-card"
          : "border-dashed border-border bg-muted/40",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
          adapter.implemented
            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : "bg-muted text-muted-foreground",
        )}
      >
        {adapter.implemented ? (
          <Check className="h-3 w-3" />
        ) : (
          <Ban className="h-3 w-3" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{adapter.label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {adapter.accepts}
        </span>
        {!adapter.implemented && adapter.block && (
          <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">
            {adapter.block}
          </span>
        )}
      </span>
    </li>
  );
}

export function AdapterCatalog({ className }: { className?: string }) {
  const [catalog, setCatalog] = useState<ExportAdapterCatalog | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchExportAdapters(controller.signal)
      .then((parsed) => {
        setCatalog(parsed.value);
        setProblems(parsed.problems);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        // `ExportContractError` already carries the sentence a person reads;
        // `extractErrorMessage` returns it unchanged.
        setError(extractErrorMessage(err));
      });
    return () => controller.abort();
  }, []);

  if (error) {
    return (
      <div className={cn("rounded-lg border border-destructive/40 bg-destructive/5 p-3", className)}>
        <p className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            The list of formats could not be read, so this page cannot say what
            it accepts right now: {error}. Dropping a file still works — the
            server decides what it is from the bytes.
          </span>
        </p>
        <ErrorAlchemyMenu error={error} />
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className={cn("grid gap-2 sm:grid-cols-2", className)}>
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const readable = catalog.adapters.filter((a) => a.implemented);
  const blocked = catalog.adapters.filter((a) => !a.implemented);

  return (
    <div className={cn("space-y-4", className)}>
      {problems.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            The server described this list in a way this screen did not expect,
            so part of it is worked out here instead of reported:
            <ErrorAlchemyMenu />
          </p>
          <ul className="mt-1 space-y-1">
            {problems.map((problem, rowIndex, allRows) => (
              <li key={problem} className="text-xs text-muted-foreground">
                {problem}
              {rowIndex === allRows.length - 1 && <ErrorAlchemyMenu error={allRows} />}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold">
          What you can drop here
          <span className="ml-2 font-normal tabular-nums text-muted-foreground">
            {catalog.readable} formats
          </span>
        </h2>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {readable.map((adapter) => (
            <AdapterRow key={adapter.key} adapter={adapter} />
          ))}
        </ul>
      </div>

      {blocked.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold">
            Recognised, but we cannot read them yet
            <span className="ml-2 font-normal tabular-nums text-muted-foreground">
              {catalog.recognised_not_readable} formats
            </span>
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Drop one anyway — you will get this explanation instead of a
            mystery.
          </p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {blocked.map((adapter) => (
              <AdapterRow key={adapter.key} adapter={adapter} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
