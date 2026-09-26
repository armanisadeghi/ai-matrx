"use client";

/**
 * THE FEATURE-VISIBILITY SURFACE for the Detail primitive, shown from the
 * user's seat with a REAL record.
 *
 * 🚨 IT LIVES IN `features/`, NOT IN A ROUTE GROUP (VERIFY-U-P1, D6). It was a
 * `(dev)` demo only, and `(dev)` is compiled out of every profile a developer
 * or an agent actually runs (`core` — the preview server's default —  and the
 * main Vercel project both set `includeDev: false`), so `/demos/detail-primitive`
 * answered with a 307 to demos.aimatrx.com and nobody could open the page the
 * docs pointed at. The body is a plain client component here, and TWO routes
 * render it: `/detail` in `(core)`, which every profile serves, and
 * `/demos/detail-primitive` in `(dev)`, which the demos deployment keeps.
 * The profile mechanism is untouched.
 *
 *
 *   - the five most recent files you can see (`files.files`, RLS) as the list
 *     context, so `[` / `]` and the previous / next controls do something;
 *   - one button per presentation (window / docked / page) plus "open with my
 *     setting", which reads `ui.detail.default_presentation` exactly as every
 *     other surface does;
 *   - the deep link for each presentation, copyable;
 *   - the same record at phone width, live, in two framed viewports (the page
 *     presentation and the docked one) beside the desktop view you are in.
 *
 * Nothing here is mocked. If you can see no files yet, it says so and what to do.
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AppWindow, Copy, Expand, PanelRight, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { useDetailHost } from "@/lib/detail/host";
import { useOpenDetail } from "@/lib/detail/useOpenDetail";
import { detailInstanceKey } from "@/lib/detail/presentation";
import {
  DETAIL_PRESENTATION_KNOB,
  type DetailListContext,
  type DetailPresentation,
  type DetailRef,
} from "@/lib/detail/types";
import { detailPageHref } from "@/features/window-panels/detail/DetailHost";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

type FileRow = { id: string; file_name: string; mime_type: string | null };

type Load =
  | { status: "loading" }
  | { status: "ready"; rows: FileRow[] }
  | { status: "error"; message: string };

const PRESENTATIONS: {
  value: DetailPresentation;
  label: string;
  Icon: typeof AppWindow;
  blurb: string;
}[] = [
  {
    value: "window",
    label: "Window",
    Icon: AppWindow,
    blurb:
      "The default. A floating panel you can move, resize, minimize to the tray and pop out. A bottom sheet on phones.",
  },
  {
    value: "docked",
    label: "Docked",
    Icon: PanelRight,
    blurb:
      "A resizable panel docked to the right of what you are working on, no backdrop. A bottom sheet on phones.",
  },
  {
    value: "page",
    label: "Page",
    Icon: Expand,
    blurb:
      "A full route under the shell header — the only presentation that changes the URL. It offers the window back.",
  },
];

/**
 * The deep link for a presentation, anchored to the route this surface is
 * being served from — it renders at `/detail` and at `/demos/detail-primitive`,
 * and a link that named the other one would open a page the person is not on.
 */
function deepLinkFor(
  ref: DetailRef,
  presentation: DetailPresentation,
  here: string,
): string {
  if (presentation === "page") return detailPageHref(ref);
  return `${here}?panels=detail:${detailInstanceKey(ref)}:as-${presentation}`;
}

export function DetailShowcase() {
  const host = useDetailHost();
  const openDetail = useOpenDetail("file");
  const setting = host.usePresentationSetting("file");
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [selected, setSelected] = useState(0);
  const [isTop, setIsTop] = useState(false);
  const here = usePathname() || "/detail";

  useEffect(() => {
    setIsTop(window.self === window.top);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .schema("files")
        .from("files")
        .select("id, file_name, mime_type")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5);
      if (cancelled) return;
      if (error) {
        setLoad({ status: "error", message: error.message });
        return;
      }
      setLoad({ status: "ready", rows: data ?? [] });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = load.status === "ready" ? load.rows : [];
  const refs: DetailRef[] = rows.map((r) => ({ type: "file", id: r.id }));
  const ref = refs[selected] ?? null;
  const list: DetailListContext | null = ref ? { items: refs, index: selected } : null;

  const open = (presentation?: DetailPresentation) => {
    if (!ref) return;
    void openDetail({
      ...ref,
      presentation,
      seed: { name: rows[selected]?.file_name ?? null, about: rows[selected]?.mime_type ?? null },
      list,
    });
  };

  const copy = async (text: string) => {
    const ok = await copyToClipboard(text, { formatJson: false });
    if (ok) toast.success("Link copied");
    else toast.error("Could not copy the link");
  };

  return (
    <div className="h-full overflow-y-auto bg-textured pb-safe">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-3 py-3 sm:px-4">
        <header className="flex flex-col gap-1">
          <h1 className="text-base font-semibold text-foreground">Detail primitive</h1>
          <p className="text-xs text-muted-foreground">
            One registration per record type; the wrapper yields window, docked and page. This
            page uses a real file you can see. Keyboard inside any presentation: Escape closes,{" "}
            <kbd className="rounded border border-border bg-muted px-1">[</kbd> /{" "}
            <kbd className="rounded border border-border bg-muted px-1">]</kbd> move through the
            list, Cmd/Ctrl+Enter saves when a section has an editor.
          </p>
        </header>

        {/* Setting */}
        <section className="rounded-md border border-border bg-card p-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-foreground">Your setting</span>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
              {DETAIL_PRESENTATION_KNOB}
            </code>
            {setting.value ? (
              <span className="text-foreground">
                = <span className="font-medium">{setting.value}</span>
              </span>
            ) : setting.error ? (
              <span className="text-destructive">
                could not be read: {setting.error}. Openers fall back to the window and say so.
                <ErrorAlchemyMenu error={setting.error} />
              </span>
            ) : (
              <Skeleton className="h-3 w-24" />
            )}
            <Button size="sm" variant="secondary" className="ml-auto h-7 text-xs" disabled={!ref} onClick={() => open()}>
              Open with my setting
            </Button>
          </div>
        </section>

        {/* Record picker */}
        <section className="rounded-md border border-border bg-card p-3">
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            The record (your five most recent files)
          </h2>
          {load.status === "loading" ? (
            <div className="space-y-1.5" aria-busy="true" aria-label="Loading your files">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-5/6" />
            </div>
          ) : load.status === "error" ? (
            <p className="text-xs text-destructive">Could not list your files: {load.message} <ErrorAlchemyMenu error={load.message} /></p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              You have no files yet. Upload one from the Files area, then come back — this page
              opens real records only.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {rows.map((row, i) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(i)}
                    aria-pressed={i === selected}
                    className={cn(
                      "max-w-[220px] truncate rounded-md border px-2 py-1 text-xs transition-colors pointer-coarse:py-2.5",
                      i === selected
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:text-foreground",
                    )}
                    title={row.file_name}
                  >
                    {row.file_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Three presentations side by side */}
        <section className="grid gap-3 md:grid-cols-3">
          {PRESENTATIONS.map(({ value, label, Icon, blurb }) => {
            const link = ref ? deepLinkFor(ref, value, here) : null;
            return (
              <div key={value} className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-medium text-foreground">{label}</h3>
                  {setting.value === value ? (
                    <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                      your default
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">{blurb}</p>
                <Button size="sm" className="h-8 w-full text-xs" disabled={!ref} onClick={() => open(value)}>
                  Open as {label.toLowerCase()}
                </Button>
                {link ? (
                  <button
                    type="button"
                    onClick={() => void copy(`${window.location.origin}${link}`)}
                    className="flex items-center gap-1.5 truncate rounded bg-muted px-2 py-1 text-left font-mono text-[10px] text-muted-foreground hover:text-foreground"
                    title="Copy deep link"
                  >
                    <Copy className="h-3 w-3 shrink-0" />
                    <span className="truncate">{link}</span>
                  </button>
                ) : null}
              </div>
            );
          })}
        </section>

        {/* Phone width, live */}
        {ref && isTop ? (
          <section className="rounded-md border border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-medium text-foreground">The same record at phone width (390px), live</h2>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Left: the page presentation. Right: this demo opened with the docked deep link, which
              becomes a bottom sheet on a phone. Both are the real app in a framed viewport.
            </p>
            <div className="flex flex-wrap gap-4">
              {[
                { title: "Page", src: detailPageHref(ref) },
                { title: "Docked (sheet)", src: deepLinkFor(ref, "docked", here) },
              ].map((frame) => (
                <figure key={frame.title} className="flex flex-col gap-1">
                  <figcaption className="text-[11px] font-medium text-muted-foreground">{frame.title}</figcaption>
                  <iframe
                    title={`${frame.title} at phone width`}
                    src={frame.src}
                    className="h-[720px] w-[390px] max-w-full rounded-xl border border-border bg-background"
                  />
                </figure>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
