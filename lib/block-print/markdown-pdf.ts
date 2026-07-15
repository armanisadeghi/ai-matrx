"use client";

/**
 * markdownToPdfBlob — render a markdown string to a styled, multi-page PDF
 * Blob without any visible UI.
 *
 * Pipeline: markdown → WordPress-styled HTML (the same converter the
 * publish/copy-HTML flows use) → sanitized offscreen DOM host → html2canvas +
 * jsPDF via `captureToPDFBlob`. Everything heavy stays lazy-loaded behind
 * this module.
 *
 * Used by the chat "Save as → PDF Document" action, which uploads the blob
 * into the user's Files. Reuse this for any "content → PDF file" need — do
 * not fork another markdown-to-pdf path.
 */

import { captureToPDFBlob } from "./dom-capture-print-utils";

/**
 * Markdown can carry raw HTML; we are about to attach it to the live
 * document, so strip anything executable. html2canvas ignores scripts, but
 * inline handlers (`onerror`) and javascript: URLs would fire on attach.
 */
function sanitizeForCapture(html: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = html;
  const fragment = template.content;

  fragment
    .querySelectorAll("script, iframe, object, embed, link, meta")
    .forEach((el) => el.remove());
  fragment.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      if (
        (name === "href" || name === "src") &&
        attr.value.trim().toLowerCase().startsWith("javascript:")
      ) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return fragment;
}

export async function markdownToPdfBlob(markdown: string): Promise<Blob> {
  if (!markdown.trim()) {
    throw new Error("Nothing to convert — the content is empty.");
  }
  const [{ convertMarkdownToHtml }, { loadWordPressCSS }] = await Promise.all([
    import("@/features/html-pages/utils/html-preview-utils"),
    import("@/features/html-pages/css/wordpress-styles"),
  ]);

  const bodyHtml = convertMarkdownToHtml(markdown);
  const css = await loadWordPressCSS();

  // Offscreen host — must be in the document for html2canvas to compute
  // styles, but never visible and never intercepting input.
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:800px;background:#ffffff;color:#111827;pointer-events:none;";
  host.setAttribute("aria-hidden", "true");

  const style = document.createElement("style");
  style.textContent = css;
  host.appendChild(style);

  const contentEl = document.createElement("div");
  // The WP stylesheet is class-scoped (.matrx-*) and expects this container.
  contentEl.className = "matrx-content-container";
  contentEl.style.cssText = "padding:32px;background:#ffffff;";
  contentEl.appendChild(sanitizeForCapture(bodyHtml));
  host.appendChild(contentEl);

  document.body.appendChild(host);
  try {
    // Always-light document render: "#fff" (not "#ffffff") bypasses the
    // dark-mode background flip, and theme:"light" keeps the oklch-fallback
    // patch from substituting dark text colors while the app is in dark mode.
    return await captureToPDFBlob(host, { background: "#fff", theme: "light" });
  } finally {
    host.remove();
  }
}
