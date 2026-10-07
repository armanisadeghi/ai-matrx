/** Frame-safe CopyButtons seam: local copy and download only, no host runtime. */
import { useState, type MouseEvent } from "react";
import { copyText } from "@ai-matrx/kit/clipboard";
import { cn } from "@/lib/utils";
import { serializeFrameAgentPayload } from "./FrameAgentPayload";
import type { MatrxCopyMenuProps } from "@ai-matrx/alchemy/react/workspace";
import { downloadFile } from "@ai-matrx/kit/download";

export type CopyButtonsProps = MatrxCopyMenuProps;

type ExportItem = NonNullable<MatrxCopyMenuProps["export"]>["items"][number];

async function resolve<T>(value: T | (() => T)): Promise<T> {
  return typeof value === "function" ? (value as () => T)() : value;
}
function download(item: ExportItem): void | Promise<void> {
  if (item.onSelect) return item.onSelect();
  const built = item.build?.();
  if (!built) return;
  return Promise.resolve(built).then(
    ({ content, extension, mime, filename }) => {
      downloadFile(filename ?? `export.${extension}`, new Blob([content], { type: mime }), "application/octet-stream");
    },
  );
}

export function CopyButtons({
  label,
  human,
  json,
  agent,
  export: exportConfig,
  hide = [],
  contentFlavor = "plain",
  richCopy,
  disabled = false,
  className,
  size = "sm",
  stopPropagation,
}: CopyButtonsProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const action = async (getText: () => Promise<string>) => {
    try {
      if (!(await copyText(await getText()))) throw new Error("Could not copy");
      setStatus("copied");
      setOpen(false);
    } catch {
      setStatus("error");
    }
  };
  const menuAction =
    (run: () => void | Promise<void>) =>
    (event: MouseEvent<HTMLButtonElement>) => {
      if (stopPropagation) event.stopPropagation();
      void run();
    };
  const copyHuman = async (flavor: "default" | "markdown" | "text") => {
    const content = await resolve(human!);
    if (richCopy) {
      const outcome = await richCopy(content, flavor);
      if (
        outcome === false ||
        (typeof outcome === "object" &&
          outcome &&
          "status" in outcome &&
          outcome.status === "error")
      )
        throw new Error("Could not copy");
      setStatus("copied");
      setOpen(false);
      return;
    }
    await action(async () => content);
  };
  const buttonClass = cn(
    "inline-flex items-center justify-center rounded-md border border-border bg-background text-xs font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50",
    size === "xs" ? "h-6 px-2" : size === "icon" ? "h-8 w-8" : "h-8 px-3",
    className,
  );
  return (
    <span
      className="relative inline-flex"
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={`Copy, transform or export ${label}`}
        aria-expanded={open}
        title={
          status === "error"
            ? "Could not copy"
            : `Copy, transform or export ${label}`
        }
        disabled={disabled}
        onMouseEnter={() => setHovered(true)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onClick={(event) => {
          if (stopPropagation) event.stopPropagation();
          setOpen((current) => !current);
        }}
        className={buttonClass}
      >
        {status === "copied" ? "Copied" : "Copy"}
      </button>
      {hovered && !open ? (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            zIndex: 50,
            right: 0,
            top: "calc(100% + 6px)",
            whiteSpace: "nowrap",
          }}
          className="rounded bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
        >
          Copy, transform or export {label}
        </span>
      ) : null}
      {open ? (
        <span
          role="menu"
          aria-label={`Copy options for ${label}`}
          style={{
            position: "absolute",
            zIndex: 50,
            right: 0,
            top: "calc(100% + 6px)",
          }}
          className="flex min-w-36 flex-col gap-1 rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {!hide.includes("copy") && human ? (
            <button
              type="button"
              role="menuitem"
              onClick={menuAction(() => copyHuman(contentFlavor === "markdown" ? "markdown" : "default"))}
            >
              {contentFlavor === "markdown" ? "Copy markdown" : "Copy"}
            </button>
          ) : null}
          {!hide.includes("copy") &&
          human &&
          contentFlavor === "markdown" &&
          richCopy ? (
            <button
              type="button"
              role="menuitem"
              onClick={menuAction(() => copyHuman("text"))}
            >
              Copy text
            </button>
          ) : null}
          {!hide.includes("ai") && agent ? (
            <button
              type="button"
              role="menuitem"
              onClick={menuAction(
                () =>
                  void action(async () => {
                    const payload = await resolve(agent);
                    return typeof payload === "string"
                      ? payload
                      : serializeFrameAgentPayload(payload as Parameters<typeof serializeFrameAgentPayload>[0]);
                  }),
              )}
            >
              Copy for AI
            </button>
          ) : null}
          {!hide.includes("copy") && json ? (
            <button
              type="button"
              role="menuitem"
              onClick={menuAction(
                () =>
                  void action(async () =>
                    JSON.stringify(await resolve(json), null, 2),
                  ),
              )}
            >
              Copy JSON
            </button>
          ) : null}
          {!hide.includes("export") &&
            exportConfig?.items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={menuAction(() => {
                  setOpen(false);
                  return download(item);
                })}
              >
                Export {item.label}
              </button>
            ))}
        </span>
      ) : null}
    </span>
  );
}
