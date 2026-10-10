/**
 * The device console's files: Termius SFTP bones. A 36px breadcrumb, 52px rows (28px icon, name,
 * size · date), pull to refresh, tap a folder to open it, tap a file to preview it. Swipe a row
 * left for Rename / Move / Trash (desktop: the row's … menu); Trash is undoable from the toast,
 * because it is the OS Trash and the protocol returns where it went. The folder lives in the URL
 * (?path=). Every call goes through the device protocol client; nothing here touches a server.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ChevronRight,
  File,
  FileCode,
  FileImage,
  FileText,
  Folder,
  FolderPlus,
  Link2,
  MoreHorizontal,
  RefreshCw,
  Upload,
} from "lucide-react";
import { useDesktopRequest } from "@ai-matrx/desktop-protocol/react";
import { isDesktopProtocolError } from "@ai-matrx/desktop-protocol/client";
import type { DesktopClient } from "@ai-matrx/desktop-protocol/client";
import type { FsEntry } from "@ai-matrx/desktop-protocol";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ai-matrx/design-system";
import { formatAbsoluteDate, formatFileSize } from "@ai-matrx/kit/format";

import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { TextInputDialog } from "@ai-matrx/design-system";

import { FilePreview } from "./FilePreview";
import { crumbs, extensionOf, joinPath, parentPath, previewKind } from "./paths";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
/** One swipe reveals three 72px actions. */
const ACTION_W = 72;
const ACTIONS_W = ACTION_W * 3;
/** Pull this far (px, after damping) and let go to refresh. */
const PULL_TRIGGER = 56;
/** fs.write carries at most 4 MiB of bytes in one message (protocol limit). */
const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

type Prompt =
  | { kind: "rename"; entry: FsEntry }
  | { kind: "move"; entry: FsEntry }
  | { kind: "mkdir" };

export interface FilesPanelProps {
  client: DesktopClient;
  live: boolean;
  /** Why this computer cannot be used right now; null = usable. */
  blocked: string | null;
  /** Folder from the URL; null = the device's home folder. */
  path: string | null;
  onPathChange: (path: string) => void;
  visible: boolean;
}

function EntryIcon({ entry }: { entry: FsEntry }) {
  const cls = "h-7 w-7 shrink-0";
  if (entry.kind === "dir") return <Folder className={cn(cls, "fill-sky-500/20 text-sky-500")} strokeWidth={1.5} aria-hidden="true" />;
  if (entry.kind === "symlink") return <Link2 className={cn(cls, "text-muted-foreground")} strokeWidth={1.5} aria-hidden="true" />;
  const kind = previewKind(entry.name);
  if (kind === "image") return <FileImage className={cn(cls, "text-violet-500")} strokeWidth={1.5} aria-hidden="true" />;
  if (kind === "text") {
    const code = !["txt", "md", "markdown", "log", "csv", "tsv"].includes(extensionOf(entry.name));
    return code ? (
      <FileCode className={cn(cls, "text-emerald-600 dark:text-emerald-400")} strokeWidth={1.5} aria-hidden="true" />
    ) : (
      <FileText className={cn(cls, "text-muted-foreground")} strokeWidth={1.5} aria-hidden="true" />
    );
  }
  return <File className={cn(cls, "text-muted-foreground")} strokeWidth={1.5} aria-hidden="true" />;
}

function entryMeta(entry: FsEntry): string {
  const date = formatAbsoluteDate(entry.mtime * 1000, { month: "short", day: "numeric", year: "numeric" });
  return entry.kind === "dir" ? date : `${formatFileSize(entry.size)} · ${date}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A row that slides left to reveal its actions (touch), with a … menu for pointers. */
function SwipeRow({
  open,
  onOpenChange,
  actions,
  menu,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: { label: string; aria: string; className: string; onPress: () => void }[];
  menu: ReactNode;
  children: ReactNode;
}) {
  const [dragX, setDragX] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; base: number; horizontal: boolean | null } | null>(null);
  const offset = dragX ?? (open ? -ACTIONS_W : 0);

  return (
    <div className="relative overflow-hidden border-b border-border/60 last:border-b-0">
      <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTIONS_W }} aria-hidden={!open}>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            tabIndex={open ? 0 : -1}
            aria-label={a.aria}
            className={cn("flex h-full items-center justify-center text-[13px] font-medium text-white", a.className)}
            style={{ width: ACTION_W }}
            onClick={() => {
              onOpenChange(false);
              a.onPress();
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div
        className={cn("relative flex items-center bg-card [touch-action:pan-y]", dragX === null && "transition-transform duration-200 ease-out")}
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (!t) return;
          start.current = { x: t.clientX, y: t.clientY, base: open ? -ACTIONS_W : 0, horizontal: null };
        }}
        onTouchMove={(e) => {
          const s = start.current;
          const t = e.touches[0];
          if (!s || !t) return;
          const dx = t.clientX - s.x;
          const dy = t.clientY - s.y;
          if (s.horizontal === null && Math.hypot(dx, dy) > 8) s.horizontal = Math.abs(dx) > Math.abs(dy);
          if (s.horizontal) setDragX(Math.max(-ACTIONS_W - 24, Math.min(0, s.base + dx)));
        }}
        onTouchEnd={() => {
          const s = start.current;
          start.current = null;
          if (!s?.horizontal || dragX === null) {
            setDragX(null);
            return;
          }
          const shouldOpen = dragX < -ACTIONS_W / 2;
          setDragX(null);
          onOpenChange(shouldOpen);
        }}
      >
        {children}
        <div className="pr-2">{menu}</div>
      </div>
    </div>
  );
}

/** sonner's action button is ~24px tall; a phone needs a 44px target for Undo. */
const UNDO_BUTTON_STYLE = { minHeight: 44, minWidth: 64, padding: "0 16px", fontSize: 15 } as const;

export function FilesPanel({ client, live, blocked, path, onPathChange, visible }: FilesPanelProps) {
  const offline = blocked !== null;
  const sysinfo = useDesktopRequest("sysinfo.get", {}, { enabled: live, client });
  const home = sysinfo.data?.paths.home ?? null;
  const dir = path ?? home;
  const [showHidden, setShowHidden] = useState(false);
  const listing = useDesktopRequest(
    "fs.list",
    { path: dir ?? "/", show_hidden: showHidden, sort: "kind", limit: 2000 },
    { enabled: live && dir !== null, client },
  );
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [preview, setPreview] = useState<FsEntry | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [busy, setBusy] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullStart = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  // A new folder starts at the top with no row left open.
  useEffect(() => {
    setOpenRow(null);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [dir]);

  async function refresh(): Promise<void> {
    setRefreshing(true);
    await listing.refetch();
    setRefreshing(false);
  }

  async function trash(entry: FsEntry): Promise<void> {
    try {
      const res = await client.request("fs.delete", { path: entry.path, recursive: entry.kind === "dir", to_trash: true });
      void listing.refetch();
      const trashedTo = res.trashed_to;
      toast(`Moved “${entry.name}” to Trash`, {
        actionButtonStyle: UNDO_BUTTON_STYLE,
        action: trashedTo
          ? {
              label: "Undo",
              onClick: () => {
                client.request("fs.move", { from_path: trashedTo, to_path: entry.path }).then(
                  () => void listing.refetch(),
                  (error: unknown) => toast.error("Could not put it back", { description: errorText(error) }),
                );
              },
            }
          : undefined,
      });
    } catch (error) {
      toast.error("Could not move to Trash", { description: errorText(error) });
    }
  }

  async function onPrompt(value: string): Promise<void> {
    if (!prompt || dir === null) return;
    setBusy(true);
    try {
      if (prompt.kind === "mkdir") {
        await client.request("fs.mkdir", { path: joinPath(dir, value.trim()) });
      } else if (prompt.kind === "rename") {
        await client.request("fs.move", { from_path: prompt.entry.path, to_path: joinPath(parentPath(prompt.entry.path), value.trim()) });
      } else {
        const target = value.trim().replace(/\/+$/, "") || "/";
        await client.request("fs.move", { from_path: prompt.entry.path, to_path: joinPath(target, prompt.entry.name) });
      }
      setPrompt(null);
      void listing.refetch();
    } catch (error) {
      const exists = isDesktopProtocolError(error) && error.code === "CONFLICT";
      toast.error(exists ? "Something with that name is already there" : "That did not work", { description: exists ? undefined : errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  async function upload(files: FileList | null): Promise<void> {
    if (!files || dir === null) return;
    for (const file of Array.from(files)) {
      if (file.size > UPLOAD_MAX_BYTES) {
        toast.error(`“${file.name}” is over the 4 MB upload limit`);
        continue;
      }
      try {
        const content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
          reader.onerror = () => reject(reader.error ?? new Error("read failed"));
          reader.readAsDataURL(file);
        });
        await client.request("fs.write", { path: joinPath(dir, file.name), content, encoding: "base64", exclusive: true });
        toast.success(`Uploaded “${file.name}”`);
      } catch (error) {
        const exists = isDesktopProtocolError(error) && error.code === "CONFLICT";
        toast.error(exists ? `“${file.name}” already exists here` : `Could not upload “${file.name}”`, { description: exists ? undefined : errorText(error) });
      }
    }
    void listing.refetch();
  }

  const trail = dir ? crumbs(dir, home) : [];
  const entries = listing.data?.entries ?? [];

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", !visible && "hidden")}>
      {/* 36px breadcrumb + the folder's … menu */}
      <div className="flex h-9 shrink-0 items-center gap-1 px-4 lg:px-3">
        <nav className="flex min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none]" aria-label="Folder">
          {trail.map((c, i) => (
            <span key={c.path} className="flex shrink-0 items-center">
              {i > 0 ? <ChevronRight className="mx-0.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> : null}
              <button
                type="button"
                className={cn(
                  "max-w-[160px] truncate rounded px-1.5 py-1 text-sm",
                  i === trail.length - 1 ? "font-semibold text-foreground" : "text-primary hover:bg-muted",
                )}
                aria-current={i === trail.length - 1 ? "page" : undefined}
                onClick={() => onPathChange(c.path)}
              >
                {c.label}
              </button>
            </span>
          ))}
        </nav>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Folder actions" disabled={!live || dir === null} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40">
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setPrompt({ kind: "mkdir" })}>
              <FolderPlus className="mr-2 h-4 w-4" />
              New folder
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => uploadRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Upload
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void refresh()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={showHidden} onCheckedChange={(v) => setShowHidden(v === true)}>
              Show hidden
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input ref={uploadRef} type="file" multiple className="hidden" onChange={(e) => void upload(e.target.files).then(() => (e.target.value = ""))} />
      </div>

      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] lg:px-3"
        onTouchStart={(e) => {
          pullStart.current = (scrollRef.current?.scrollTop ?? 1) <= 0 ? (e.touches[0]?.clientY ?? null) : null;
        }}
        onTouchMove={(e) => {
          if (pullStart.current === null) return;
          const dy = (e.touches[0]?.clientY ?? 0) - pullStart.current;
          setPull(dy > 0 ? Math.min(80, dy * 0.5) : 0);
        }}
        onTouchEnd={() => {
          if (pull >= PULL_TRIGGER) void refresh();
          pullStart.current = null;
          setPull(0);
        }}
      >
        <div
          className="flex items-center justify-center overflow-hidden text-muted-foreground transition-[height] duration-150"
          style={{ height: refreshing ? 36 : pull }}
          aria-hidden={!refreshing}
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} style={{ transform: refreshing ? undefined : `rotate(${pull * 4}deg)`, opacity: refreshing ? 1 : Math.min(1, pull / PULL_TRIGGER) }} />
        </div>

        <div className="overflow-hidden rounded-[10px] border border-border bg-card">
          {dir !== null && dir !== parentPath(dir) ? (
            <button type="button" className="flex h-[52px] w-full items-center gap-3 border-b border-border/60 px-3 text-left hover:bg-muted/50" onClick={() => onPathChange(parentPath(dir))}>
              <Folder className="h-7 w-7 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
              <span className="text-base text-muted-foreground">..</span>
            </button>
          ) : null}
          {!offline && listing.loading && entries.length === 0
            ? Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="flex h-[52px] items-center gap-3 border-b border-border/60 px-3 last:border-b-0">
                  <div className="h-7 w-7 animate-pulse rounded bg-muted" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-2/5 animate-pulse rounded bg-muted" />
                    <div className="h-2.5 w-1/4 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))
            : null}
          {offline ? (
            <div className="flex h-[52px] items-center px-3 text-sm font-medium text-muted-foreground" role="status">
              {blocked}
            </div>
          ) : null}
          {!offline && listing.error && entries.length === 0 ? (
            <div className="flex h-[52px] items-center justify-between gap-3 px-3 text-sm">
              <span className="truncate text-destructive">{listing.error.code === "PERMISSION_DENIED_OS" ? "The computer blocked this folder" : listing.error.message}<ErrorAlchemyMenu error={listing.error.message} /></span>
              <button type="button" className="shrink-0 text-primary" onClick={() => void listing.refetch()}>
                Try again
              </button>
            </div>
          ) : null}
          {!offline && !listing.loading && !listing.error && entries.length === 0 && dir !== null ? (
            <div className="flex h-[52px] items-center px-3 text-sm text-muted-foreground">Empty folder</div>
          ) : null}
          {entries.map((entry) => (
            <SwipeRow
              key={entry.path}
              open={openRow === entry.path}
              onOpenChange={(o) => setOpenRow(o ? entry.path : null)}
              actions={[
                { label: "Rename", aria: `Rename ${entry.name}`, className: "bg-zinc-500", onPress: () => setPrompt({ kind: "rename", entry }) },
                { label: "Move", aria: `Move ${entry.name}`, className: "bg-primary", onPress: () => setPrompt({ kind: "move", entry }) },
                { label: "Trash", aria: `Move ${entry.name} to Trash`, className: "bg-destructive", onPress: () => void trash(entry) },
              ]}
              menu={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label={`Actions for ${entry.name}`} className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setPrompt({ kind: "rename", entry })}>Rename</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setPrompt({ kind: "move", entry })}>Move</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => void trash(entry)}>
                      Move to Trash
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            >
              <button
                type="button"
                className="flex h-[52px] min-w-0 flex-1 items-center gap-3 pl-3 pr-2 text-left"
                onClick={() => {
                  if (openRow !== null) {
                    setOpenRow(null);
                    return;
                  }
                  if (entry.kind === "dir") onPathChange(entry.path);
                  else setPreview(entry);
                }}
              >
                <EntryIcon entry={entry} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-base leading-5 text-foreground", entry.name.startsWith(".") && "text-muted-foreground")}>{entry.name}</span>
                  <span className="block truncate text-xs leading-4 text-muted-foreground">{entryMeta(entry)}</span>
                </span>
                {entry.kind === "dir" ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden="true" /> : null}
              </button>
            </SwipeRow>
          ))}
        </div>
        {listing.data?.truncated ? <p className="px-1 pt-2 text-xs text-muted-foreground">First {entries.length} items</p> : null}
      </div>

      <FilePreview client={client} entry={preview} onOpenChange={(o) => !o && setPreview(null)} />
      <TextInputDialog
        key={prompt ? `${prompt.kind}:${prompt.kind === "mkdir" ? "" : prompt.entry.path}` : "closed"}
        open={prompt !== null}
        onOpenChange={(o) => !o && setPrompt(null)}
        title={prompt?.kind === "mkdir" ? "New folder" : prompt?.kind === "rename" ? "Rename" : "Move to folder"}
        placeholder={prompt?.kind === "move" ? "/Users/me/Documents" : "Name"}
        defaultValue={prompt?.kind === "rename" ? prompt.entry.name : prompt?.kind === "move" ? (dir ?? "") : ""}
        confirmLabel={prompt?.kind === "mkdir" ? "Create" : prompt?.kind === "rename" ? "Rename" : "Move"}
        busy={busy}
        validate={(v) => {
          const t = v.trim();
          if (!t) return "Required";
          if (prompt?.kind !== "move" && t.includes("/")) return "A name cannot contain /";
          if (prompt?.kind === "move" && !t.startsWith("/") && !/^[A-Za-z]:\//.test(t)) return "Use a full path";
          return null;
        }}
        onConfirm={onPrompt}
      />
    </div>
  );
}

