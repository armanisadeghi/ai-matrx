// draw-math — one display formula → PNG data URL, in the browser. KaTeX (with
// the platform's safety options) lays it out off-screen; html-to-image draws
// it at 2× for print. Null (never a throw) when it cannot — the caller then
// writes readable text instead, so an export never fails over one formula.

import { REHYPE_KATEX_OPTIONS } from "@/components/markdown-core/math-normalizer";

export async function drawDisplayMath(tex: string): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const [{ default: katex }, { toPng }] = await Promise.all([
    import("katex"),
    import("html-to-image"),
    import("katex/dist/katex.min.css"),
  ]);
  let html: string;
  try {
    html = katex.renderToString(tex, { ...REHYPE_KATEX_OPTIONS, displayMode: true, throwOnError: true });
  } catch {
    return null;
  }
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;padding:4px 8px;background:#fff;color:#000;font-size:20px;display:inline-block;";
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    await document.fonts?.ready;
    return await toPng(host, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: false });
  } catch (err) {
    console.error("[draw-math] could not draw a formula", err);
    return null;
  } finally {
    host.remove();
  }
}
