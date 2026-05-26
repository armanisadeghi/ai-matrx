"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft,
  Bell,
  Camera,
  Clipboard,
  ClipboardPaste,
  ExternalLink,
  FolderOpen,
  Loader2,
  Monitor,
} from "lucide-react";
import { ConnectionBar } from "../_lib/ConnectionBar";
import { MessageLog, ResultPanel } from "../_lib/ResultPanel";
import { useMatrxLocalContext } from "../_lib/MatrxLocalContext";
import type { ToolResult } from "../_lib/types";

export default function SystemPage() {
  const local = useMatrxLocalContext();
  const { invokeTool, loading, logs, clearLogs } = local;

  const [activeResult, setActiveResult] = useState<ToolResult | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [screenshotImage, setScreenshotImage] = useState<{
    media_type: string;
    base64_data: string;
  } | null>(null);

  const [dirPath, setDirPath] = useState("~");
  const [dirShowHidden, setDirShowHidden] = useState(false);
  const [clipboardText, setClipboardText] = useState("Hello from Matrx!");
  const [clipboardReadResult, setClipboardReadResult] = useState<string | null>(
    null,
  );
  const [notifyTitle, setNotifyTitle] = useState("Matrx Local");
  const [notifyMessage, setNotifyMessage] = useState(
    "Test notification from the web app!",
  );
  const [openUrl, setOpenUrl] = useState("https://aimatrx.com");
  const [openPath, setOpenPath] = useState("~");

  const run = async (
    section: string,
    tool: string,
    input: Record<string, unknown>,
  ) => {
    setActiveSection(section);
    setActiveResult(null);
    setScreenshotImage(null);
    const result = await invokeTool(tool, input);
    setActiveResult(result);
    if (tool === "Screenshot" && result.image) {
      setScreenshotImage(result.image);
    }
    if (tool === "ClipboardRead" && result.type === "success") {
      setClipboardReadResult(result.output);
    }
  };

  const inputCls =
    "w-full h-7 text-xs font-mono rounded border px-2 bg-background";
  const isLoading = (section: string) => !!loading && activeSection === section;

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-textured">
      {/* Header strip */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-card shrink-0">
        <Link href="/demos/local-tools">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 h-6 text-xs px-1.5"
          >
            <ArrowLeft className="w-3 h-3" />
            Back
          </Button>
        </Link>
        <Monitor className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-sm font-semibold">System Tools</span>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          SystemInfo · Screenshot · Directory · Clipboard · Notify · Open
        </span>
      </div>
      <div className="shrink-0 border-b px-3 py-1">
        <ConnectionBar hook={local} />
      </div>

      {/* Body: left = tools, right = results */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT: tool controls ── */}
        <div className="w-64 shrink-0 border-r overflow-y-auto flex flex-col divide-y bg-card">
          {/* System Info */}
          <div className="p-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Monitor className="w-3 h-3 text-primary" />
              <span className="text-xs font-semibold">System Info</span>
            </div>
            <Button
              size="sm"
              disabled={!!loading}
              className="w-full h-7 text-xs gap-1"
              onClick={() => run("sysinfo", "SystemInfo", {})}
            >
              {isLoading("sysinfo") ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Monitor className="w-3 h-3" />
              )}
              Get System Info
            </Button>
          </div>

          {/* Screenshot */}
          <div className="p-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Camera className="w-3 h-3 text-primary" />
              <span className="text-xs font-semibold">Screenshot</span>
            </div>
            <Button
              size="sm"
              disabled={!!loading}
              className="w-full h-7 text-xs gap-1"
              onClick={() => run("screenshot", "Screenshot", {})}
            >
              {isLoading("screenshot") ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Camera className="w-3 h-3" />
              )}
              Capture Screen
            </Button>
          </div>

          {/* List Directory */}
          <div className="p-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <FolderOpen className="w-3 h-3 text-primary" />
              <span className="text-xs font-semibold">List Directory</span>
            </div>
            <label className="text-[10px] text-muted-foreground">Path</label>
            <input
              type="text"
              value={dirPath}
              onChange={(e) => setDirPath(e.target.value)}
              className={inputCls}
              style={{ fontSize: "16px" }}
              placeholder="~"
            />
            <label className="flex items-center gap-1.5 cursor-pointer text-xs">
              <Checkbox
                checked={dirShowHidden}
                onCheckedChange={(v) => setDirShowHidden(v === true)}
                className="shrink-0"
              />
              Show hidden
            </label>
            <Button
              size="sm"
              disabled={!!loading}
              className="w-full h-7 text-xs gap-1"
              onClick={() =>
                run("listdir", "ListDirectory", {
                  path: dirPath,
                  show_hidden: dirShowHidden,
                })
              }
            >
              {isLoading("listdir") ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <FolderOpen className="w-3 h-3" />
              )}
              List Directory
            </Button>
          </div>

          {/* Clipboard */}
          <div className="p-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Clipboard className="w-3 h-3 text-primary" />
              <span className="text-xs font-semibold">Clipboard</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!!loading}
              className="w-full h-7 text-xs gap-1"
              onClick={() => run("clipboard-read", "ClipboardRead", {})}
            >
              {isLoading("clipboard-read") ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <ClipboardPaste className="w-3 h-3" />
              )}
              Read Clipboard
            </Button>
            {clipboardReadResult && (
              <div className="text-[10px] bg-muted/40 rounded p-1.5 font-mono break-all max-h-16 overflow-y-auto">
                {clipboardReadResult}
              </div>
            )}
            <label className="text-[10px] text-muted-foreground">
              Write text
            </label>
            <input
              type="text"
              value={clipboardText}
              onChange={(e) => setClipboardText(e.target.value)}
              className={inputCls}
              style={{ fontSize: "16px" }}
            />
            <Button
              size="sm"
              disabled={!!loading}
              className="w-full h-7 text-xs gap-1"
              onClick={() =>
                run("clipboard-write", "ClipboardWrite", {
                  content: clipboardText,
                })
              }
            >
              {isLoading("clipboard-write") ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Clipboard className="w-3 h-3" />
              )}
              Write Clipboard
            </Button>
          </div>

          {/* Notify */}
          <div className="p-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Bell className="w-3 h-3 text-primary" />
              <span className="text-xs font-semibold">Notify</span>
            </div>
            <label className="text-[10px] text-muted-foreground">Title</label>
            <input
              type="text"
              value={notifyTitle}
              onChange={(e) => setNotifyTitle(e.target.value)}
              className={inputCls}
              style={{ fontSize: "16px" }}
            />
            <label className="text-[10px] text-muted-foreground">Message</label>
            <input
              type="text"
              value={notifyMessage}
              onChange={(e) => setNotifyMessage(e.target.value)}
              className={inputCls}
              style={{ fontSize: "16px" }}
            />
            <Button
              size="sm"
              disabled={!!loading}
              className="w-full h-7 text-xs gap-1"
              onClick={() =>
                run("notify", "Notify", {
                  title: notifyTitle,
                  message: notifyMessage,
                })
              }
            >
              {isLoading("notify") ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Bell className="w-3 h-3" />
              )}
              Send Notification
            </Button>
          </div>

          {/* Open URL / Path */}
          <div className="p-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <ExternalLink className="w-3 h-3 text-primary" />
              <span className="text-xs font-semibold">Open URL / Path</span>
            </div>
            <label className="text-[10px] text-muted-foreground">URL</label>
            <div className="flex gap-1">
              <input
                type="text"
                value={openUrl}
                onChange={(e) => setOpenUrl(e.target.value)}
                className={`${inputCls} flex-1`}
                style={{ fontSize: "16px" }}
                placeholder="https://example.com"
              />
              <Button
                size="sm"
                disabled={!!loading}
                className="h-7 px-2 shrink-0"
                onClick={() => run("openurl", "OpenUrl", { url: openUrl })}
              >
                {isLoading("openurl") ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <ExternalLink className="w-3 h-3" />
                )}
              </Button>
            </div>
            <label className="text-[10px] text-muted-foreground">
              File / Folder path
            </label>
            <div className="flex gap-1">
              <input
                type="text"
                value={openPath}
                onChange={(e) => setOpenPath(e.target.value)}
                className={`${inputCls} flex-1`}
                style={{ fontSize: "16px" }}
                placeholder="~/Documents"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!!loading}
                className="h-7 px-2 shrink-0"
                onClick={() => run("openpath", "OpenPath", { path: openPath })}
              >
                {isLoading("openpath") ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <FolderOpen className="w-3 h-3" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* ── MIDDLE: result ── */}
        <div className="flex-1 flex flex-col overflow-hidden border-r">
          <div className="px-3 py-1.5 border-b bg-muted/40 flex items-center gap-2 shrink-0">
            <span className="text-xs font-semibold">
              {activeSection ? `Result — ${activeSection}` : "Result"}
            </span>
            {activeResult && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                  activeResult.type === "success"
                    ? "text-green-600 border-green-400"
                    : "text-red-500 border-red-400"
                }`}
              >
                {activeResult.type}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && activeResult && (
              <div className="p-3 space-y-3">
                <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/30 rounded p-2">
                  {activeResult.output}
                </pre>
                {activeResult.image && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Image:</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:${activeResult.image.media_type};base64,${activeResult.image.base64_data}`}
                      alt="Tool result"
                      className="max-w-full rounded border"
                    />
                  </div>
                )}
                {activeResult.metadata && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                      Metadata
                    </summary>
                    <pre className="mt-1 p-2 bg-muted rounded font-mono text-[10px] overflow-auto">
                      {JSON.stringify(activeResult.metadata, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}
            {!loading && !activeResult && (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Run a tool to see results
              </div>
            )}
            {screenshotImage && !activeResult?.image && (
              <div className="p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:${screenshotImage.media_type};base64,${screenshotImage.base64_data}`}
                  alt="Screenshot"
                  className="w-full rounded border"
                />
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: message log ── */}
        <div className="w-80 shrink-0 flex flex-col overflow-hidden">
          <MessageLog
            logs={logs}
            onClear={clearLogs}
            className="flex-1 rounded-none border-0 border-none"
            maxHeight="max-h-full"
          />
        </div>
      </div>
    </div>
  );
}
