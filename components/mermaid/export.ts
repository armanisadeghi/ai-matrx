"use client";

/**
 * Export utilities for rendered mermaid diagrams.
 *
 * Source exports ALWAYS use the original block source (never the sanitized
 * variant) — we render fixes, we don't rewrite the user's data.
 * PNG rasterization is safe because the runtime renders with
 * flowchart.htmlLabels=false (no <foreignObject> → no canvas taint).
 */

import { fileHandler } from "@/features/files/handler/handler";
import type { NormalizedFile } from "@/features/files/handler/types";

function svgBlob(svg: string): Blob {
  return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function safeFileName(title: string | null | undefined, extension: string): string {
  const base = (title || "diagram")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "diagram"}.${extension}`;
}

export async function copyMermaidSource(source: string): Promise<void> {
  await navigator.clipboard.writeText(source);
}

/** Copies the SVG markup as text — the universally pasteable form. */
export async function copyMermaidSvg(svg: string): Promise<void> {
  await navigator.clipboard.writeText(svg);
}

export function downloadMermaidSvg(svg: string, title?: string | null): void {
  triggerDownload(svgBlob(svg), safeFileName(title, "svg"));
}

export function downloadMermaidSource(source: string, title?: string | null): void {
  triggerDownload(new Blob([source], { type: "text/plain;charset=utf-8" }), safeFileName(title, "mmd"));
}

/** Rasterize the SVG to PNG at `scale`x and download it. */
export async function downloadMermaidPng(
  svg: string,
  title?: string | null,
  scale = 2,
): Promise<void> {
  const blob = await rasterizeSvgToPng(svg, scale);
  triggerDownload(blob, safeFileName(title, "png"));
}

async function rasterizeSvgToPng(svg: string, scale: number): Promise<Blob> {
  const dimensions = readSvgDimensions(svg);
  const url = URL.createObjectURL(svgBlob(svg));
  try {
    const image = await loadImage(url);
    const width = Math.max(1, Math.round((dimensions?.width ?? image.naturalWidth ?? 800) * scale));
    const height = Math.max(1, Math.round((dimensions?.height ?? image.naturalHeight ?? 600) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))),
        "image/png",
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function readSvgDimensions(svg: string): { width: number; height: number } | null {
  const viewBox = /viewBox="([\d.\s-]+)"/.exec(svg);
  if (viewBox) {
    const parts = viewBox[1].trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }
  return null;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("SVG image decode failed"));
    img.src = url;
  });
}

/**
 * Save the diagram into the user's cloud file system (Diagrams folder):
 * the rendered SVG plus the .mmd source as a sibling, so the diagram is both
 * viewable anywhere and re-editable later.
 */
export async function saveMermaidToWorkspace(args: {
  svg: string;
  source: string;
  title?: string | null;
}): Promise<{ svgFile: NormalizedFile; sourceFile: NormalizedFile }> {
  const { svg, source, title } = args;
  const svgFile = await fileHandler.upload(
    { kind: "blob", blob: svgBlob(svg), fileName: safeFileName(title, "svg") },
    {
      folderPath: "Diagrams",
      metadata: { source: "mermaid-block", title: title ?? undefined },
    },
  );
  const sourceFile = await fileHandler.upload(
    {
      kind: "blob",
      blob: new Blob([source], { type: "text/plain;charset=utf-8" }),
      fileName: safeFileName(title, "mmd"),
    },
    {
      folderPath: "Diagrams",
      metadata: { source: "mermaid-block", title: title ?? undefined },
    },
  );
  return { svgFile, sourceFile };
}
