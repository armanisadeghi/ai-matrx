"use client";

/**
 * Demo for PdfNamedSurfaceSwitcher — real data, real rename, real menus.
 *
 * Loads the user's newest PDFs from `files.files` (direct supabase-js, per
 * the no-Python-for-DB rule). The "Live" rows commit renames through the
 * real `renameFile` thunk — click a name, type, Enter — and the ··· /
 * right-click menus are the real /files action set. Only the truncation
 * stress strings are display-only (clearly labeled, and read-only so a demo
 * click can never rename your file to a test string).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectFileById } from "@/features/files/redux/selectors";
import { renameFile } from "@/features/files/redux/thunks";
import { filesDb } from "@/features/files/filesDb";
import { supabase } from "@/utils/supabase/client";
import { CardLoading } from "@/components/matrx/LoadingComponents";
import {
  PanelLeftTapButton,
  SearchTapButton,
} from "@/components/icons/tap-buttons";
import { PdfNamedSurfaceSwitcher } from "@/features/pdf/components/PdfNamedSurfaceSwitcher";

interface PdfRow {
  id: string;
  fileName: string;
}

function useNewestPdfs(limit: number) {
  const [rows, setRows] = useState<PdfRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await filesDb(supabase)
        .from("files")
        .select("id, file_name")
        .eq("mime_type", "application/pdf")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setRows([]);
        return;
      }
      setRows(
        (data ?? []).map((r) => ({ id: r.id, fileName: r.file_name })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  return { rows, error };
}

/** One live row — store-backed name + real rename through the files thunk. */
function LiveRow({ file }: { file: PdfRow }) {
  const dispatch = useAppDispatch();
  const record = useAppSelector((s) => selectFileById(s, file.id));
  const name = record?.fileName ?? file.fileName;

  return (
    <PdfNamedSurfaceSwitcher
      current="file-viewer"
      fileId={file.id}
      fileName={name}
      onRename={async (next) => {
        try {
          await dispatch(
            renameFile({ fileId: file.id, newName: next }),
          ).unwrap();
          toast.success(`Renamed to ${next}`);
        } catch (err) {
          toast.error(
            err instanceof Error ? `Rename failed: ${err.message}` : "Rename failed",
          );
        }
      }}
    />
  );
}

const STRESS_NAMES = [
  "invoice.pdf",
  "FINAL_final_v3 (2) — client copy REVISED (use this one).pdf",
  "scan_20260716_093412_HP_LaserJet_M404dn_dept-7_ACCOUNTS.pdf",
  "a.pdf",
  "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod.pdf",
];

export function PdfNamedSwitcherDemo() {
  const { rows, error } = useNewestPdfs(3);
  const first = rows?.[0] ?? null;

  return (
    <div className="space-y-10 p-8">
      <div>
        <h1 className="mb-2 text-3xl font-bold">PdfNamedSurfaceSwitcher</h1>
        <p className="max-w-2xl text-muted-foreground">
          One glass pill: PDF icon + editable filename + surface switcher +
          the full file menu. Everything inside a single
          TapTargetButtonGroup — no separate name background.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Live — your newest PDFs</h2>
        <p className="text-sm text-muted-foreground">
          Real files: click a name to rename (Enter commits, Esc cancels),
          right-click it or use ··· for the /files action set, layers for the
          surface switcher.
        </p>
        {rows === null ? (
          <CardLoading />
        ) : error ? (
          <p className="text-sm text-destructive">
            Failed to load PDFs: {error}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No PDFs found —{" "}
            <Link href="/files" className="text-primary underline">
              upload one in /files
            </Link>{" "}
            and reload.
          </p>
        ) : (
          <div className="flex flex-col items-start gap-2">
            {rows.map((f) => (
              <LiveRow key={f.id} file={f} />
            ))}
          </div>
        )}
      </section>

      {first && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Options</h2>
          <p className="text-sm text-muted-foreground">
            Same real file; names read-only here so demo clicks can&apos;t
            rename it.
          </p>
          <div className="flex flex-col items-start gap-2">
            {(
              [
                [true, true, "Default (icon + menu)"],
                [false, true, "No icon"],
                [true, false, "No ··· menu (switcher only)"],
              ] as const
            ).map(([showIcon, showMenu, label]) => (
              <div key={label} className="flex items-center gap-4">
                <PdfNamedSurfaceSwitcher
                  current="file-viewer"
                  fileId={first.id}
                  fileName={first.fileName}
                  showIcon={showIcon}
                  showMenu={showMenu}
                />
                <span className="text-[10px] text-muted-foreground">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Truncation stress</h2>
        <p className="text-sm text-muted-foreground">
          Display-only strings (not persisted anywhere) — ugly, erratic, long.
          Default cap is <code className="text-xs">max-w-40</code>; the last
          row widens it.
        </p>
        <div className="flex flex-col items-start gap-2">
          {STRESS_NAMES.map((name) => (
            <PdfNamedSurfaceSwitcher
              key={name}
              current="file-viewer"
              fileId={first?.id}
              fileName={name}
            />
          ))}
          <PdfNamedSurfaceSwitcher
            current="file-viewer"
            fileId={first?.id}
            fileName={STRESS_NAMES[1]}
            nameMaxWidthClassName="max-w-72"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">In a toolbar row</h2>
        <p className="text-sm text-muted-foreground">
          Sitting between other tap buttons — one pill among peers.
        </p>
        <div className="flex max-w-md items-center rounded-md border border-border bg-card px-2 py-1">
          <PanelLeftTapButton ariaLabel="Toggle sidebar (demo)" />
          <PdfNamedSurfaceSwitcher
            current="file-viewer"
            fileId={first?.id}
            fileName={first?.fileName ?? "sample-report.pdf"}
          />
          <SearchTapButton ariaLabel="Find (demo)" />
        </div>
      </section>
    </div>
  );
}
