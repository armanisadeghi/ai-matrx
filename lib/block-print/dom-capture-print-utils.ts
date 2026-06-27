/**
 * DOM-Capture Print Utilities — Tier 2 Full-Message Print
 *
 * Captures a rendered DOM element using html2canvas, then pipes it into jsPDF.
 * This handles ALL block types because it screenshots the actual rendered output.
 *
 * Problem: Tailwind CSS 4 uses modern CSS color functions (oklch, lab, color(display-p3))
 * that html2canvas cannot parse. It calls console.error for each one, which gets
 * captured by AdminDebugContextCollector and shows up as false errors.
 *
 * Solution: Patch window.getComputedStyle during the capture so html2canvas always
 * receives safe hex fallbacks instead of unparseable color function strings.
 */

export interface DomCaptureOptions {
  /** Paper size — 'a4' (default) or 'letter' */
  paperSize?: "a4" | "letter";
  /** Orientation */
  orientation?: "portrait" | "landscape";
  /** Scale factor for html2canvas (higher = sharper, slower). Default: 2 */
  scale?: number;
  /** Background colour for the capture. Default: '#ffffff' */
  background?: string;
  /** Filename for the downloaded PDF (without extension). Default: 'ai-response' */
  filename?: string;
  /** Called after each page is captured, with current page / total estimate */
  onProgress?: (page: number, total: number) => void;
}

const PAGE_DIMS = {
  a4: { w: 210, h: 297 },
  letter: { w: 215.9, h: 279.4 },
} as const;

// Matches any modern CSS color function html2canvas cannot parse
const UNSAFE_COLOR_RE = /\b(oklch|oklab|lab|lch|color)\s*\(/i;

function isSafeColor(value: string): boolean {
  return !UNSAFE_COLOR_RE.test(value);
}

/**
 * Replaces modern CSS color functions in a single value string with a
 * context-appropriate hex fallback.
 */
function safenColor(value: string, prop: string, isDark: boolean): string {
  if (isSafeColor(value)) return value;
  const lp = prop.toLowerCase();
  if (lp.includes("background")) return isDark ? "#1f2937" : "#ffffff";
  if (lp === "color") return isDark ? "#f3f4f6" : "#111827";
  if (lp.includes("border") || lp.includes("outline"))
    return isDark ? "#4b5563" : "#d1d5db";
  if (lp === "fill") return isDark ? "#9ca3af" : "#374151";
  if (lp === "stroke") return isDark ? "#6b7280" : "#6b7280";
  return isDark ? "#6b7280" : "#6b7280";
}

/**
 * Patch window.getComputedStyle so that any call during the capture returns
 * safe hex values instead of oklch/lab/etc.
 *
 * html2canvas calls getComputedStyle extensively — this is the authoritative
 * intercept point. Returns a restore function.
 */
function patchGetComputedStyle(isDark: boolean): () => void {
  const original = window.getComputedStyle.bind(window);

  window.getComputedStyle = function patchedGetComputedStyle(
    elt: Element,
    pseudoElt?: string | null,
  ): CSSStyleDeclaration {
    const computed = original(elt, pseudoElt);

    return new Proxy(computed, {
      get(target, prop: string | symbol) {
        const value = (target as unknown as Record<string | symbol, unknown>)[
          prop
        ];

        // Intercept string property accesses (color values)
        if (typeof prop === "string" && typeof value === "string" && value) {
          if (!isSafeColor(value)) {
            return safenColor(value, prop, isDark);
          }
        }

        // Intercept getPropertyValue
        if (prop === "getPropertyValue") {
          return (propName: string) => {
            const raw = target.getPropertyValue(propName);
            if (raw && !isSafeColor(raw)) {
              return safenColor(raw, propName, isDark);
            }
            return raw;
          };
        }

        if (typeof value === "function") {
          return (value as Function).bind(target);
        }

        return value;
      },
    });
  };

  return () => {
    window.getComputedStyle = original;
  };
}

/**
 * Capture a DOM element and export it as a multi-page PDF.
 */
export async function captureToPDF(
  element: HTMLElement,
  options: DomCaptureOptions = {},
): Promise<void> {
  const {
    paperSize = "a4",
    orientation = "portrait",
    scale = 2,
    background = "#ffffff",
    filename = "ai-response",
    onProgress,
  } = options;

  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const dims = PAGE_DIMS[paperSize];
  const pageW = orientation === "portrait" ? dims.w : dims.h;
  const pageH = orientation === "portrait" ? dims.h : dims.w;

  onProgress?.(0, 1);

  const isDark =
    document.documentElement.classList.contains("dark") ||
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const bgColor = background === "#ffffff" && isDark ? "#111827" : background;

  const restoreGetComputedStyle = patchGetComputedStyle(isDark);

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(element, {
      scale,
      useCORS: true,
      backgroundColor: bgColor,
      logging: false,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    });
  } finally {
    restoreGetComputedStyle();
  }

  const imgData = canvas.toDataURL("image/png");
  const imgW = pageW;
  const imgH = (canvas.height * pageW) / canvas.width;

  const pdf = new jsPDF({ orientation, unit: "mm", format: paperSize });

  let heightLeft = imgH;
  let yOffset = 0;
  let page = 0;

  pdf.addImage(imgData, "PNG", 0, yOffset, imgW, imgH);
  heightLeft -= pageH;
  page++;

  const totalPages = Math.ceil(imgH / pageH);
  while (heightLeft > 0) {
    yOffset -= pageH;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, yOffset, imgW, imgH);
    heightLeft -= pageH;
    page++;
    onProgress?.(page, totalPages);
  }

  pdf.save(`${filename}.pdf`);
}

/**
 * Capture a DOM element and copy it to clipboard (or download) as PNG.
 */
export async function captureToClipboardImage(
  element: HTMLElement,
): Promise<void> {
  const { default: html2canvas } = await import("html2canvas");

  const isDark =
    document.documentElement.classList.contains("dark") ||
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const restoreGetComputedStyle = patchGetComputedStyle(isDark);

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: isDark ? "#111827" : "#ffffff",
      logging: false,
    });
  } finally {
    restoreGetComputedStyle();
  }

  canvas.toBlob(async (blob) => {
    if (!blob) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
    } catch {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "capture.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, "image/png");
}
