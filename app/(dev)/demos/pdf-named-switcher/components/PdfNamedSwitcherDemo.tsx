"use client";

/**
 * Demo for PdfNamedSurfaceSwitcher — real data, real rename.
 *
 * Loads the user's newest PDFs from `files.files` (direct supabase-js, per
 * the no-Python-for-DB rule). The "Live" rows hydrate each file into the
 * files store (`useEnsureCloudFile`) and commit renames through the real
 * `renameFile` thunk — click a name, type, Enter. The option rows reuse the
 * first real file so the switcher menu resolves genuine surface links; only
 * the truncation stress strings are display-only (clearly labeled, and
 * read-only so a demo click can never rename your file to a test string).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectFileById } from "@/features/files/redux/selectors";
import { renameFile } from "@/features/files/redux/thunks";
import { useEnsureCloudFile } from "@/features/files/hooks/useEnsureCloudFile";
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
  useEnsureCloudFile(file.id);
  const record = useAppSelector((s) => selectFileById(s, file.id));
  const name = record?.fileName ?? file.fileName;

  return (
    <div className="flex items-center rounded-md border border-border bg-card px-2 py-1">
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
    </div>
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
          The PDF surface switcher paired with document identity: small PDF
          icon + truncated filename (click to rename in place) + the
          everywhere-menu. Geometry-safe — the tap group is untouched; the
          name sits beside it.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Live — your newest PDFs</h2>
        <p className="text-sm text-muted-foreground">
          Real files, real rename (the files thunk renames the cloud file),
          real surface links in the menu. Click a name to edit; Enter commits,
          Esc cancels.
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
          <div className="flex max-w-md flex-col gap-2">
            {rows.map((f) => (
              <LiveRow key={f.id} file={f} />
            ))}
          </div>
        )}
      </section>

      {first && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">
            Options — icon placement & read-only
          </h2>
          <p className="text-sm text-muted-foreground">
            Same real file (menu links resolve); names read-only here so demo
            clicks can&apos;t rename it.
          </p>
          <div className="flex max-w-md flex-col gap-2">
            {(
              [
                ["start", "Icon start (default)"],
                ["end", "Icon end"],
                ["none", "No icon"],
              ] as const
            ).map(([icon, label]) => (
              <div
                key={icon}
                className="flex items-center justify-between rounded-md border border-border bg-card px-2 py-1"
              >
                <PdfNamedSurfaceSwitcher
                  current="file-viewer"
                  fileId={first.id}
                  fileName={first.fileName}
                  icon={icon}
                />
                <span className="pl-4 text-[10px] text-muted-foreground">
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
        <div className="flex max-w-md flex-col gap-2">
          {STRESS_NAMES.map((name) => (
            <div
              key={name}
              className="flex items-center rounded-md border border-border bg-card px-2 py-1"
            >
              <PdfNamedSurfaceSwitcher
                current="file-viewer"
                fileId={first?.id}
                fileName={name}
              />
            </div>
          ))}
          <div className="flex items-center rounded-md border border-border bg-card px-2 py-1">
            <PdfNamedSurfaceSwitcher
              current="file-viewer"
              fileId={first?.id}
              fileName={STRESS_NAMES[1]}
              nameMaxWidthClassName="max-w-72"
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">In a toolbar row</h2>
        <p className="text-sm text-muted-foreground">
          Sitting between other tap buttons — the group pill and 32px targets
          stay untouched.
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
