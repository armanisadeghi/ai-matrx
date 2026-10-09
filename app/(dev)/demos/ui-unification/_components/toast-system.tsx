"use client";

/**
 * TOAST SYSTEM — PROTOTYPE specimen (owner spec, 2026-10-02). Not the
 * production primitive: it shows the shape the canonical `@/lib/toast` API
 * would take once the layers move into the shared layer.
 *
 * One component, `SmartToastCard`, carries every layer; a developer only
 * passes props:
 *
 *   smartToast.success("Saved", {
 *     aiContext: { noteId, revision },          // extra facts for an AI
 *     detail: { title, rows, body },            // layer 2: hover/click peek
 *     window: true,                             // layer 3: detail as a window
 *     href: "/notes/123",                       // layer 4: NEW TAB only
 *   });
 *
 * Layer 0 is never optional: message + Copy-for-AI + close on every toast.
 * The copy button writes the platform's ONE agent envelope
 * (`buildAgentPayload`, `@ai-matrx/alchemy/operate` — the same builder
 * behind `components/agent-copy`), filled for free with the route, URL, page
 * title, viewport, locale, time zone, the exact message, the kind and the
 * moment it was shown, plus the caller's `aiContext`, `detail` and `href`.
 *
 * Layer 2's popover matches the agent hover previews
 * (`features/agents/components/previews/*HoverPreview.tsx`: HoverCard,
 * `w-80 p-3 bg-card border border-border shadow-lg`, 250/140ms delays).
 *
 * Layer 3 opens a REAL `WindowPanel` (inline-window pattern of
 * `features/agents/orchestras/components/AgentPeekButton.tsx`), loaded through
 * `next/dynamic` so the window stack stays behind the lazy boundary. The
 * window is hosted by `ToastWindowHost`, NOT inside the toast, so it outlives
 * the toast's dismissal. The static column shows a labelled mock of it.
 * @registry-status: inline-window
 *
 * Layer 4 never navigates the current page: the link is an `<a
 * target="_blank" rel="noopener noreferrer">`.
 *
 * Fired toasts go through `toast.custom` on the canonical `@/lib/toast`.
 * Prototype gaps (see the owner report): custom toasts are not on the wall
 * clock, an error fired this way is not fed to `captureError`, and the peek
 * does not hold the toast's timer while it is open.
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import dynamic from "next/dynamic";
import { TapTargetButtonTransparent, TapTargetCopyButton } from "@ai-matrx/design-system/tap-target";
import {
  ExternalLinkTapButton,
  MaximizeTapButton,
  MoreHorizontalTapButton,
  XTapButton,
} from "@ai-matrx/design-system/tap-target/buttons";
import { buildAgentPayload } from "@ai-matrx/alchemy/operate";
import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  Info,
  Maximize2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const LazyWindowPanel = dynamic(
  () => import("@/features/window-panels/WindowPanel").then((m) => m.WindowPanel),
  { ssr: false },
);

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

export type SmartToastKind = "info" | "success" | "warning" | "error";

export interface SmartToastDetail {
  title?: string;
  rows?: ReadonlyArray<{ label: string; value: string }>;
  body?: string;
}

export interface SmartToastOptions {
  /** Extra facts an AI needs beyond what is on screen. Copied, never shown. */
  aiContext?: string | Record<string, unknown>;
  /** Layer 2 — the peek opened on hover or click. */
  detail?: SmartToastDetail;
  /** Layer 3 — offer the detail as a window. Needs `detail`. */
  window?: boolean | { title?: string };
  /** Layer 4 — a route for the detail, opened in a NEW TAB only. */
  href?: string;
}

const KIND: Record<SmartToastKind, { icon: LucideIcon; tone: string; surface: string; label: string }> = {
  info: { icon: Info, tone: "text-info", surface: "border-info/25 bg-info/5", label: "Info" },
  success: {
    icon: CircleCheck,
    tone: "text-success",
    surface: "border-success/25 bg-success/5",
    label: "Success",
  },
  warning: {
    icon: TriangleAlert,
    tone: "text-warning",
    surface: "border-warning/30 bg-warning/5",
    label: "Warning",
  },
  error: {
    icon: CircleAlert,
    tone: "text-destructive",
    surface: "border-destructive/25 bg-destructive/5",
    label: "Error",
  },
};

/* ------------------------------------------------------------------ */
/* Copy for AI — the ONE envelope, filled with everything free         */
/* ------------------------------------------------------------------ */

export function buildToastAiPayload(
  kind: SmartToastKind,
  message: string,
  options: SmartToastOptions = {},
  shownAt: string = new Date().toISOString(),
): string {
  const hasWindow = typeof window !== "undefined";
  const route = hasWindow ? window.location.pathname : undefined;
  const data: Record<string, unknown> = { message, kind };
  if (options.detail) data.detail = options.detail;
  if (options.href) data.detail_route = options.href;
  if (options.aiContext !== undefined) data.ai_context = options.aiContext;
  return buildAgentPayload(
    {
      kind: "toast",
      location: `Toast on ${route ?? "an unknown route"}`,
      description: message,
      attributes: { tone: kind },
      context: {
        shown_at: shownAt,
        page_title: hasWindow ? document.title || undefined : undefined,
        viewport: hasWindow ? `${window.innerWidth}x${window.innerHeight}` : undefined,
        language: hasWindow ? navigator.language : undefined,
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      data,
    },
    hasWindow ? { url: window.location.href, route } : undefined,
  );
}

/* ------------------------------------------------------------------ */
/* Layer 3 host — windows live outside the toast so they outlive it    */
/* ------------------------------------------------------------------ */

interface ToastWindow {
  key: string;
  title: string;
  kind: SmartToastKind;
  message: string;
  detail: SmartToastDetail;
}

let toastWindows: readonly ToastWindow[] = [];
const EMPTY_WINDOWS: readonly ToastWindow[] = [];
const windowListeners = new Set<() => void>();
const emitWindows = () => windowListeners.forEach((l) => l());

function openToastWindow(w: Omit<ToastWindow, "key">): void {
  toastWindows = [...toastWindows, { ...w, key: `${Date.now()}-${toastWindows.length}` }];
  emitWindows();
}

function closeToastWindow(key: string): void {
  toastWindows = toastWindows.filter((w) => w.key !== key);
  emitWindows();
}

function subscribeWindows(listener: () => void) {
  windowListeners.add(listener);
  return () => windowListeners.delete(listener);
}

export function ToastWindowHost() {
  const windows = useSyncExternalStore(
    subscribeWindows,
    () => toastWindows,
    () => EMPTY_WINDOWS,
  );
  return (
    <>
      {windows.map((w) => (
        <LazyWindowPanel
          key={w.key}
          id={`toast-detail-${w.key}`}
          title={w.title}
          onClose={() => closeToastWindow(w.key)}
          width={420}
          height={360}
          minWidth={320}
          minHeight={220}
          bodyClassName="flex min-h-0 flex-1 flex-col overflow-y-auto p-3"
        >
          <ToastDetailBody kind={w.kind} message={w.message} detail={w.detail} />
        </LazyWindowPanel>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Layer 2 body — shared by the peek, the window and the static mock   */
/* ------------------------------------------------------------------ */

export function ToastDetailBody({
  kind,
  message,
  detail,
}: {
  kind: SmartToastKind;
  message: string;
  detail: SmartToastDetail;
}) {
  const k = KIND[kind];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <k.icon className={cn("h-3 w-3", k.tone)} />
        <span>{k.label}</span>
      </div>
      <p className="text-[13px] font-medium text-foreground">{detail.title ?? message}</p>
      {detail.rows && detail.rows.length > 0 && (
        <dl className="flex flex-col gap-0.5">
          {detail.rows.map((r) => (
            <div key={r.label} className="flex items-baseline gap-2">
              <dt className="w-20 shrink-0 text-[11px] text-muted-foreground">{r.label}</dt>
              <dd className="min-w-0 break-words text-[13px] text-foreground">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {detail.body && (
        <p /* rich-content-exempt: dev-only demo page: raw model, log and request output */ className="border-t border-border pt-2 text-[13px] whitespace-pre-wrap text-foreground">
          {detail.body}
        </p>
      )}
    </div>
  );
}

export const PEEK_CLASS = "w-80 p-3 bg-card border border-border shadow-lg";

/* ------------------------------------------------------------------ */
/* THE toast — every layer, driven by props                            */
/* ------------------------------------------------------------------ */

/** Below this card width the optional layer buttons (details, window, new
 *  tab) fold into ONE "more" button, so copy + close + more always fit and the
 *  message keeps a readable column. */
export const TOAST_NARROW_PX = 300;

/** Measures the card (and whether the message is clamped) before paint, so a
 *  narrow toast never flashes the wide control row. A zero width means "not
 *  laid out yet" (SSR, jsdom) and keeps the full row. */
function useToastFit(card: RefObject<HTMLElement | null>, text: RefObject<HTMLElement | null>, message: string) {
  const [narrow, setNarrow] = useState(false);
  const [clamped, setClamped] = useState(false);
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    const read = () => {
      const w = el.getBoundingClientRect().width;
      setNarrow(w > 0 && w < TOAST_NARROW_PX);
      const t = text.current;
      setClamped(!!t && t.scrollHeight > t.clientHeight + 1);
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [card, text, message]);
  return { narrow, clamped };
}

export function SmartToastCard({
  kind,
  message,
  options = {},
  onClose,
  onCopied,
  className,
}: {
  kind: SmartToastKind;
  message: string;
  options?: SmartToastOptions;
  onClose: () => void;
  onCopied?: (text: string) => void;
  className?: string;
}) {
  const k = KIND[kind];
  const shownAt = useRef<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const { narrow, clamped } = useToastFit(cardRef, textRef, message);

  useEffect(() => {
    shownAt.current ??= new Date().toISOString();
  }, []);

  // A message longer than two lines is never lost: the clamp hides the rest
  // and the peek carries the whole text, even when the caller sent no detail.
  const detail = options.detail ?? (clamped ? {} : undefined);
  const windowTitle =
    typeof options.window === "object" && options.window.title ? options.window.title : detail?.title ?? message;
  const canWindow = !!(options.detail && options.window);
  const optionalCount = (detail ? 1 : 0) + (canWindow ? 1 : 0) + (options.href ? 1 : 0);
  const folded = narrow && optionalCount > 0;
  const openWindow = () => {
    if (options.detail) openToastWindow({ title: windowTitle, kind, message, detail: options.detail });
  };

  // The clamp sits on an inner element: padding on a line-clamped box would
  // show the top of the third line inside the padding.
  const messageNode = (
    <div
      data-toast-message=""
      className={cn("min-w-0 flex-1 py-2", detail && "cursor-pointer")}
      onClick={detail ? () => setPinned((p) => !p) : undefined}
    >
      <div className="flex min-w-0 items-start">
        <p ref={textRef} className="line-clamp-2 min-w-0 flex-1 break-words text-[13px] leading-snug text-foreground">
          {message}
        </p>
      </div>
    </div>
  );

  return (
    <div
      ref={cardRef}
      role={kind === "error" ? "alert" : "status"}
      data-toast-kind={kind}
      data-toast-narrow={narrow ? "" : undefined}
      className={cn(
        "flex w-[356px] min-w-[240px] max-w-full items-center rounded-lg border bg-card pl-2.5 pr-[calc(var(--matrx-tap-gap)/2)] py-[calc(var(--matrx-tap-gap)/2-1px)] shadow-lg",
        k.surface,
        className,
      )}
    >
      <k.icon aria-hidden className={cn("mr-2 h-3.5 w-3.5 shrink-0", k.tone)} />
      {detail ? (
        <HoverCard
          openDelay={250}
          closeDelay={140}
          open={hoverOpen || pinned}
          onOpenChange={(open) => {
            setHoverOpen(open);
            if (!open) setPinned(false);
          }}
        >
          <HoverCardTrigger asChild>{messageNode}</HoverCardTrigger>
          <HoverCardContent side="top" align="start" sideOffset={8} className={PEEK_CLASS}>
            <ToastDetailBody kind={kind} message={message} detail={detail} />
          </HoverCardContent>
        </HoverCard>
      ) : (
        messageNode
      )}
      <div data-toast-controls="" className="flex shrink-0 flex-nowrap items-center">
        {!folded && detail && (
          <TapTargetButtonTransparent
            icon={<ChevronDown />}
            ariaLabel="Details"
            tooltip="Details"
            pressed={pinned}
            onClick={() => setPinned((p) => !p)}
          />
        )}
        {!folded && canWindow && (
          <MaximizeTapButton
            variant="transparent"
            ariaLabel="Open in window"
            tooltip="Open in window"
            onClick={openWindow}
          />
        )}
        {!folded && options.href && (
          <ExternalLinkTapButton
            variant="transparent"
            ariaLabel="Open in new tab"
            tooltip="Open in new tab"
            href={options.href}
            target="_blank"
            rel="noopener noreferrer"
          />
        )}
        {folded && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <MoreHorizontalTapButton variant="transparent" ariaLabel="More" tooltip="More" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              {detail && (
                <DropdownMenuItem onSelect={() => setPinned(true)}>
                  <ChevronDown aria-hidden /> Details
                </DropdownMenuItem>
              )}
              {canWindow && (
                <DropdownMenuItem onSelect={openWindow}>
                  <Maximize2 aria-hidden /> Open in window
                </DropdownMenuItem>
              )}
              {options.href && (
                <DropdownMenuItem asChild>
                  <a href={options.href} target="_blank" rel="noopener noreferrer">
                    <ExternalLink aria-hidden /> Open in new tab
                  </a>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {/* ONE copy affordance per toast. An error's is the Alchemy Menu (every
            error on screen carries it, inside its own box); it takes the copy
            slot instead of sitting beside a second copy glyph. */}
        {kind === "error" ? (
          <ErrorAlchemyMenu
            input={{ message, source: "toast" }}
            label={message}
            details={{
              route: typeof window !== "undefined" ? window.location.pathname : "",
              ...(options.aiContext !== undefined ? { ai_context: options.aiContext } : {}),
              ...(options.detail ? { detail: options.detail } : {}),
            }}
          />
        ) : (
          <TapTargetCopyButton
            variant="transparent"
            ariaLabel="Copy for AI"
            tooltip="Copy for AI"
            value={() =>
              buildToastAiPayload(kind, message, options, shownAt.current ?? new Date().toISOString())
            }
            onCopied={onCopied}
          />
        )}
        <XTapButton variant="transparent" ariaLabel="Close" tooltip="Close" onClick={onClose} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The prototype API — a natural extension of `toast.success(m, opts)` */
/* ------------------------------------------------------------------ */

function fire(kind: SmartToastKind, message: string, options?: SmartToastOptions) {
  return toast.custom(
    // The toaster mounts outside the app's TooltipProvider, and every tap
    // button carries a tooltip — the toast brings its own provider.
    (id) => (
      <TooltipProvider delayDuration={300}>
        <SmartToastCard kind={kind} message={message} options={options} onClose={() => toast.dismiss(id)} />
      </TooltipProvider>
    ),
    { duration: kind === "error" || kind === "warning" ? 5000 : 4000 },
  );
}

export const smartToast = {
  info: (m: string, o?: SmartToastOptions) => fire("info", m, o),
  success: (m: string, o?: SmartToastOptions) => fire("success", m, o),
  warning: (m: string, o?: SmartToastOptions) => fire("warning", m, o),
  error: (m: string, o?: SmartToastOptions) => fire("error", m, o),
};

/* ------------------------------------------------------------------ */
/* Specimen                                                            */
/* ------------------------------------------------------------------ */

export const SAMPLE_DETAIL: SmartToastDetail = {
  title: "Note saved",
  rows: [
    { label: "Note", value: "Q4 intake checklist" },
    { label: "Revision", value: "14" },
    { label: "Folder", value: "Clinic / Intake" },
  ],
  body: "3 paragraphs changed since revision 13.",
};

export const TOAST_LONG_SAMPLE =
  "Couldn't save the note: the folder Clinic / Intake was moved by Ana Ruiz while you were editing, so the save was held";

const SAMPLE_CONTEXT = { noteId: "c1f0-demo", revision: 14, autosave: false };

export const ALL_LAYERS: SmartToastOptions = {
  aiContext: SAMPLE_CONTEXT,
  detail: SAMPLE_DETAIL,
  window: { title: "Note saved" },
  href: "/notes",
};

const FIRE: ReadonlyArray<{ label: string; run: () => void }> = [
  { label: "Info", run: () => smartToast.info("Sync resumes when you reconnect") },
  { label: "Success", run: () => smartToast.success("Note saved", { aiContext: SAMPLE_CONTEXT }) },
  { label: "Warning", run: () => smartToast.warning("2 fields were left blank") },
  { label: "Error", run: () => smartToast.error("Couldn't save the note") },
  { label: "Peek", run: () => smartToast.success("Note saved", { detail: SAMPLE_DETAIL }) },
  { label: "Window", run: () => smartToast.success("Note saved", { detail: SAMPLE_DETAIL, window: true }) },
  { label: "New tab", run: () => smartToast.success("Note saved", { href: "/notes" }) },
  { label: "All layers", run: () => smartToast.success("Note saved", ALL_LAYERS) },
];

function Column({ n, label, children }: { n: number; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="text-[11px] font-medium text-muted-foreground">
        {n} · {label}
      </div>
      {children}
    </div>
  );
}

function WindowMock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="w-[356px] max-w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg">
      <div className="flex h-8 items-center justify-between border-b border-border bg-muted/40 px-3">
        <span className="text-[11px] font-medium text-foreground">{title}</span>
        <span className="text-[11px] text-muted-foreground">Window (mock)</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

export function ToastSystemSpecimen() {
  const [copied, setCopied] = useState<string>("");

  useEffect(() => {
    setCopied((current) => current || buildToastAiPayload("success", "Note saved", ALL_LAYERS));
  }, []);

  const noop = () => {};

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {FIRE.map((f) => (
          <Button key={f.label} variant="outline" onClick={f.run}>
            {f.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="text-[11px] font-medium text-muted-foreground">Kinds</div>
        {(["info", "success", "warning", "error"] as const).map((kind) => (
          <SmartToastCard
            key={kind}
            kind={kind}
            message={`${KIND[kind].label} message`}
            options={{ aiContext: { specimen: kind } }}
            onClose={noop}
            onCopied={setCopied}
          />
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="text-[11px] font-medium text-muted-foreground">Narrow · 240px</div>
        <SmartToastCard kind="success" message="Note saved" options={ALL_LAYERS} onClose={noop} onCopied={setCopied} className="w-[240px]" />
        <SmartToastCard kind="error" message={TOAST_LONG_SAMPLE} options={{ href: "/notes" }} onClose={noop} onCopied={setCopied} className="w-[240px]" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <Column n={1} label="Default">
          <SmartToastCard kind="success" message="Note saved" onClose={noop} onCopied={setCopied} />
        </Column>
        <Column n={2} label="Peek">
          <SmartToastCard
            kind="success"
            message="Note saved"
            options={{ detail: SAMPLE_DETAIL }}
            onClose={noop}
            onCopied={setCopied}
          />
          <div className={cn("rounded-md", PEEK_CLASS)}>
            <ToastDetailBody kind="success" message="Note saved" detail={SAMPLE_DETAIL} />
          </div>
        </Column>
        <Column n={3} label="Window">
          <SmartToastCard
            kind="success"
            message="Note saved"
            options={{ detail: SAMPLE_DETAIL, window: true }}
            onClose={noop}
            onCopied={setCopied}
          />
          <WindowMock title="Note saved">
            <ToastDetailBody kind="success" message="Note saved" detail={SAMPLE_DETAIL} />
          </WindowMock>
        </Column>
        <Column n={4} label="New tab">
          <SmartToastCard
            kind="success"
            message="Note saved"
            options={ALL_LAYERS}
            onClose={noop}
            onCopied={setCopied}
          />
        </Column>
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-[11px] font-medium text-muted-foreground">Copied for AI</div>
        <pre
          data-testid="toast-ai-payload"
          className="max-h-72 overflow-auto rounded-md border border-border bg-muted/40 p-2 text-[11px] leading-snug text-foreground"
        >
          {copied}
        </pre>
      </div>

      <ToastWindowHost />
    </div>
  );
}
