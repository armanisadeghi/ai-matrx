---
name: block-print-system
description: >-
  Implement, fix, extend, or audit the three-tier block-aware print/PDF system in matrx-admin.
  Covers the BlockPrinter interface, HTML template printers, DOM capture printers,
  PrintOptionsDialog, usePrintOptions, useDomCapturePrint, and fullscreen print wiring.
  Use when adding print support to a block, fixing print bugs, improving print output quality,
  creating new print variants or settings, or understanding how the print system works.
---

# Block Print System

Three-tier architecture for printing AI response messages, each tier handling a different scope.

## Architecture Overview

```
Tier 1 — Quick Print (prose only)
  MessageOptionsMenu "Print / Save PDF" → printMarkdownContent() → regex → HTML window
  File: features/chat/utils/markdown-print-utils.ts
  Limitation: ignores all custom blocks

Tier 2 — Full Message (DOM screenshot)
  MessageOptionsMenu "Full Print (all blocks)" → useDomCapturePrint → html2canvas + jsPDF
  Files: features/chat/hooks/useDomCapturePrint.ts, features/chat/utils/dom-capture-print-utils.ts
  Hook returns: { captureRef, isCapturing, progress, captureAsPDF, error }
  isCapturing must be wired to the menu item (disabled state + label change)

Tier 3 — Per-Block (best quality, block owns its output)
  Print button in each block's header → either HTML template printer or DOM capture
  Dialog: features/chat/components/print/PrintOptionsDialog.tsx
```

## The BlockPrinter Interface

Source of truth: `features/chat/utils/block-print-utils.ts`

```typescript
interface BlockPrinter {
    label: string;
    variants: PrintVariant[];
    settings?: PrintSetting[];
    print: (data: unknown, variantId?: string, settings?: PrintSettings) => void | Promise<void>;
}

interface PrintVariant { id: string; label: string; description?: string; }

type PrintSetting = {
    type: "boolean";
    id: string;
    label: string;
    description?: string;
    defaultValue: boolean;
    appliesTo?: string[];   // which variantIds; omit = all variants
};

type PrintSettings = Record<string, boolean | string | number>;
```

If `variants.length === 0` AND `settings.length === 0`, `usePrintOptions` calls `print(data)` immediately with no dialog. Otherwise the `PrintOptionsDialog` opens first.

## Existing Printers

| Block | Strategy | File |
|---|---|---|
| FlashcardsBlock | HTML template | `blocks/flashcards/flashcards-printer.ts` |
| MultipleChoiceQuiz | HTML template | `blocks/quiz/quiz-printer.ts` |
| MathProblemBlock | HTML template | `blocks/math/math-printer.ts` |
| TimelineBlock | DOM capture | inline in component |
| ComparisonTableBlock | DOM capture | inline in component |
| DecisionTreeBlock | DOM capture | inline in component |
| InteractiveDiagramBlock | DOM capture | inline in component |
| cookingRecipeDisplay | DOM capture (portrait) | inline in component |
| ProgressTrackerBlock | DOM capture (portrait) | inline in component |
| TroubleshootingBlock | DOM capture (portrait) | inline in component |
| ResearchBlock | DOM capture (portrait) | inline in component |
| ResourceCollectionBlock | DOM capture (portrait) | inline in component |

## Adding an HTML Template Printer

1. Create `<block-name>-printer.ts` alongside the component file.
2. Import `buildPrintDocument, openPrintWindow, escapeHtml, type BlockPrinter, type PrintSettings` from `@/features/chat/utils/block-print-utils`.
3. Define `variants` and optional `settings` arrays.
4. In `print(data, variantId = "default", settings?)`:
   - Cast and guard: `if (!typed?.items?.length) { openPrintWindow(buildPrintDocument("<p>No data.</p>", ...), "fallback"); return; }`
   - Call `escapeHtml()` on every user string.
   - Read settings as: `const show = (settings?.showX ?? false) as boolean`.
5. In the component: call `usePrintOptions(printer, data)`, wire `triggerPrint` to a `<Printer>` button, render `<PrintOptionsDialog>` outside (not inside) the block wrapper.

Full example: `flashcards-printer.ts` (HTML template with variants + settings).

## Adding a DOM Capture Block

Required pattern — copy exactly:

```typescript
const blockContentRef = useRef<HTMLDivElement>(null);
const [isPrinting, setIsPrinting] = useState(false);

const handlePrint = useCallback(async () => {
    if (!blockContentRef.current || isPrinting) return;
    setIsPrinting(true);
    try {
        const { captureBlockElement } = await import('@/features/chat/utils/dom-capture-block-printer');
        await captureBlockElement(blockContentRef.current, 'filename', 'landscape'); // or 'portrait'
    } catch (err) {
        console.error('[BlockName] Print failed:', err);
    } finally {
        setIsPrinting(false);
    }
}, [isPrinting]);
```

Key rules:
- `captureBlockElement` signature: `(element, filename, orientation?: "landscape" | "portrait")` — default is `"landscape"`
- Always `await` it — missing await means errors are invisible silent rejections
- Attach `ref` to the **content container**, not the whole block shell or a stats summary
- `disabled={isPrinting}` on the button; show `"Saving…"` label while active
- If the block has fullscreen mode, add a print button in the fullscreen header too — the regular toolbar is hidden

## Wiring Tier 2 `isCapturing`

In AssistantMessage / PromptAssistantMessage:

```typescript
const { captureRef, isCapturing, captureAsPDF } = useDomCapturePrint();
```

Pass `isCapturing` to `MessageOptionsMenu` as a prop. The menu item should be `disabled` and show `"Generating PDF…"` while true.

## Key Utilities

- `buildPrintDocument(bodyHtml, title?, extraStyles?)` → complete `<!DOCTYPE html>` string
- `openPrintWindow(htmlDoc, filename?)` → popup window with `window.print()` autofire; falls back to `.html` download if popup blocked
- `printHtmlContent(bodyHtml, title?, extraStyles?)` → shorthand combo (not used by any block currently)
- `captureBlockElement(el, filename, orientation?)` → delegates to `captureToPDF` with scale:2

## Common Bugs to Watch For

1. **Missing `await` on `captureBlockElement`** — errors silently swallowed
2. **`ref` on wrong element** — attach to content, not stats/header/outer shell
3. **Print button absent in fullscreen** — must add to fullscreen header explicitly
4. **Missing `settings` param in `print()`** — use `settings?.key ?? defaultValue` pattern
5. **`isCapturing` not wired** — users get no feedback during Tier 2 PDF generation

## For Detailed Reference

- `features/chat/components/print/README.md` — full block inventory, roadmap, DB-dynamic architecture plan
- `features/chat/components/print/BLOCK-PRINTER-GUIDE.md` — step-by-step with complete checklists
