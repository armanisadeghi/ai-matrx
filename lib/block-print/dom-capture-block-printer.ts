/**
 * DOM-Capture BlockPrinter factory
 *
 * Creates a BlockPrinter that captures a provided DOM element and exports it as PDF.
 * Used by visual blocks (Timeline, ComparisonTable, DecisionTree, Diagram) where
 * the rendered DOM is the most faithful representation.
 *
 * Usage inside a block component:
 *   const { captureRef, printAction } = useBlockDomCapture('Timeline');
 *   // attach captureRef to the block's root element
 *   // add printAction to customActions or controls
 */

import type { BlockPrinter } from "./block-print-utils";

/**
 * Create a BlockPrinter backed by DOM capture.
 * The printer's `print(data)` call is a no-op — actual printing is triggered
 * imperatively via `captureElement(el)`.
 *
 * This exists so the block can register itself in the BlockPrinter contract
 * while keeping the DOM reference local to the component.
 */
export function createDomCapturePrinter(blockLabel: string): BlockPrinter {
    return {
        label: `Print ${blockLabel}`,
        variants: [],
        // No-op: DOM capture blocks use captureElement() directly
        print: () => {},
    };
}

/**
 * Capture a DOM element as PDF.
 * Called directly by block components when their print button is clicked.
 *
 * @param element  - The DOM element to capture
 * @param filename - Output filename (without extension)
 * @param orientation - "landscape" (default) for wide visual blocks; "portrait" for tall/list content
 */
export async function captureBlockElement(
    element: HTMLElement,
    filename: string,
    orientation: "landscape" | "portrait" = "landscape",
): Promise<void> {
    const { captureToPDF } = await import("./dom-capture-print-utils");
    await captureToPDF(element, {
        filename,
        scale: 2,
        orientation,
    });
}
