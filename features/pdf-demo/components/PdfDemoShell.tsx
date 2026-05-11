"use client";

/**
 * PdfDemoShell — thin adapter that forwards every existing demo onto the
 * new full-width split-pane `PdfWorkbench`. Keeping the old prop shape so
 * the 24 demo pages don't need to be rewritten.
 *
 * The original `binaryResult` + `jsonResult` props are rendered through
 * the same `<PdfBinaryResult>` / `<PdfJsonResult>` components as before,
 * just composed into the workbench's `results` slot.
 */

import { ReactNode } from "react";

import {
  Field,
  FieldGroup,
  PdfWorkbench,
} from "./PdfWorkbench";
import { PdfBinaryResult } from "./PdfBinaryResult";
import { PdfJsonResult } from "./PdfJsonResult";
import type { PdfSourceState } from "./PdfSourcePicker";
import type { BinaryResult } from "../hooks/usePdfDemoApi";

interface Props {
  title: string;
  endpoint: string;
  description?: string;
  children?: ReactNode;
  source: PdfSourceState;
  onSourceChange: (next: PdfSourceState) => void;
  requiresSource?: boolean;
  runDisabled?: boolean;
  onRun: () => Promise<void> | void;
  running: boolean;
  binaryResult?: BinaryResult | null;
  jsonResult?: unknown;
  error?: string | null;
  /** Slot rendered between knobs and Run button — preserved from the
   * old API for demos that needed an inline extras pane. */
  extra?: ReactNode;
  /** Optional overlay drawn ON TOP of the PDF viewer (e.g. region boxes). */
  overlay?: ReactNode;
  /** Controlled page sync for demos that want to drive the viewer. */
  pageNumber?: number;
  onPageChange?: (page: number) => void;
}

export function PdfDemoShell({
  title,
  endpoint,
  description,
  children,
  source,
  onSourceChange,
  requiresSource = true,
  runDisabled = false,
  onRun,
  running,
  binaryResult,
  jsonResult,
  error,
  extra,
  overlay,
  pageNumber,
  onPageChange,
}: Props) {
  const controls = children || extra ? (
    <>
      {children}
      {extra}
    </>
  ) : null;

  const results = (
    <>
      {binaryResult ? <PdfBinaryResult result={binaryResult} /> : null}
      {jsonResult ? <PdfJsonResult data={jsonResult} /> : null}
    </>
  );

  return (
    <PdfWorkbench
      title={title}
      endpoint={endpoint}
      description={description}
      source={source}
      onSourceChange={onSourceChange}
      requiresSource={requiresSource}
      runDisabled={runDisabled}
      onRun={onRun}
      running={running}
      controls={controls}
      results={results}
      overlay={overlay}
      pageNumber={pageNumber}
      onPageChange={onPageChange}
      error={error}
    />
  );
}

// Re-export the form helpers from the workbench so existing demos that
// imported them from this file keep working.
export { Field, FieldGroup };
