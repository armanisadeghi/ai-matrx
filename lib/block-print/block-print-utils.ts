/**
 * Block Print System — Shared Contract & Utilities
 *
 * BlockPrinter is the only interface the host system needs to know about.
 * Each block exports its own BlockPrinter alongside its render component.
 * When blocks migrate to the database, the printer travels with the block code.
 */

// ─── Contract ────────────────────────────────────────────────────────────────

export interface PrintVariant {
  id: string;
  label: string;
  description?: string;
}

/**
 * A single user-configurable setting shown in the print dialog.
 * Extend the discriminated union for new control types (select, etc.)
 * without breaking existing printers.
 */
export type PrintSetting =
  | {
      type: "boolean";
      id: string;
      label: string;
      description?: string;
      /** Default value shown when the dialog first opens */
      defaultValue: boolean;
      /** Which variant IDs this setting applies to. Omit = applies to all. */
      appliesTo?: string[];
    }
  | {
      /**
       * A numeric "from → to" range control, rendered as two small number inputs.
       * Writes two entries into the resolved PrintSettings map — one under fromId,
       * one under toId. Printers interpret 0 (or missing) as "no bound" by convention.
       */
      type: "range";
      /** Stable id used as React key — not written to the settings map */
      id: string;
      label: string;
      description?: string;
      /** Settings map key for the lower bound value */
      fromId: string;
      /** Settings map key for the upper bound value */
      toId: string;
      defaultFrom: number;
      defaultTo: number;
      /** Minimum accepted value for each input (inclusive). Default 0. */
      min?: number;
      /** Placeholder shown when the input is empty (0). Default "start" / "end". */
      fromPlaceholder?: string;
      toPlaceholder?: string;
      /** Which variant IDs this setting applies to. Omit = applies to all. */
      appliesTo?: string[];
    };

/** A resolved map of setting id → current value, passed to print(). */
export type PrintSettings = Record<string, boolean | string | number>;

/**
 * The self-contained print capability that each block can export.
 * Host code only ever calls print(data, variantId, settings) — it never inspects internals.
 */
export interface BlockPrinter {
  /** Tooltip / aria-label for the print button in the block header */
  label: string;

  /**
   * Variants offered to the user before printing.
   * Empty array = no options dialog shown; prints immediately with defaults.
   */
  variants: PrintVariant[];

  /**
   * Optional user-configurable settings shown below the variant picker.
   * Omit entirely if the block has no configurable settings.
   */
  settings?: PrintSetting[];

  /**
   * Execute the print.
   * data      — the block's structured data (serverData or parsed content)
   * variantId — which variant was chosen (undefined = default / no variants)
   * settings  — resolved setting values chosen by the user
   */
  print: (
    data: unknown,
    variantId?: string,
    settings?: PrintSettings,
  ) => void | Promise<void>;
}

// ─── Shared Utilities ─────────────────────────────────────────────────────────

const PRINT_STYLES = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #1a1a1a;
    background: #fff;
    max-width: 860px;
    margin: 0 auto;
    padding: 28px 36px;
  }

  .print-actions {
    display: flex;
    gap: 10px;
    margin-bottom: 24px;
    padding-bottom: 18px;
    border-bottom: 2px solid #e5e7eb;
  }

  .print-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 20px;
    border-radius: 8px;
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
    border: none;
    font-weight: 600;
  }

  .print-btn-primary { background: #2563eb; color: #fff; }
  .print-btn-secondary { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }

  h1 { font-size: 22pt; font-weight: 700; margin-bottom: 0.5em; }
  h2 { font-size: 16pt; font-weight: 700; margin: 1.2em 0 0.4em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.2em; }
  h3 { font-size: 13pt; font-weight: 600; margin: 1em 0 0.3em; }
  p  { margin-bottom: 0.7em; }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1em 0;
    font-size: 10pt;
  }
  th {
    background: #1e293b;
    color: #f8fafc;
    font-weight: 600;
    text-align: left;
    padding: 7px 12px;
    border: 1px solid #334155;
  }
  td {
    padding: 6px 12px;
    border: 1px solid #e2e8f0;
    vertical-align: top;
  }
  tr:nth-child(even) td { background: #f8fafc; }

  @media print {
    body { max-width: 100%; padding: 0; }
    .print-actions { display: none !important; }
    th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Wrap body HTML in a complete, styled print document.
 */
export function buildPrintDocument(
  bodyHtml: string,
  title = "AI Response",
  extraStyles = "",
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
${PRINT_STYLES}
${extraStyles}
  </style>
</head>
<body>
  <div class="print-actions">
    <button class="print-btn print-btn-primary" onclick="window.print()">Print / Save as PDF</button>
    <button class="print-btn print-btn-secondary" onclick="window.close()">Close</button>
  </div>
  <div class="content">
${bodyHtml}
  </div>
</body>
</html>`;
}

/**
 * Open a new browser window and write a complete HTML document into it.
 * Falls back to downloading an .html file if the popup is blocked.
 */
export function openPrintWindow(
  htmlDocument: string,
  filename = "print",
): void {
  const win = window.open("", "_blank", "width=920,height=720,scrollbars=yes");
  if (!win) {
    // Popup blocked — fall back to file download
    const blob = new Blob([htmlDocument], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename.replace(/\s+/g, "-").toLowerCase()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }
  win.document.open();
  win.document.write(htmlDocument);
  win.document.close();
}

/**
 * Shorthand: build the document and open it in one call.
 */
export function printHtmlContent(
  bodyHtml: string,
  title = "AI Response",
  extraStyles = "",
): void {
  const doc = buildPrintDocument(bodyHtml, title, extraStyles);
  openPrintWindow(doc, title);
}

export { escapeHtml };
