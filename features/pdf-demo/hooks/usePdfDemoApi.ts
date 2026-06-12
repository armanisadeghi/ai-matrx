"use client";

/**
 * usePdfDemoApi — compatibility shim over the canonical PDF client.
 *
 * The real implementation moved to `features/pdf/api/client.ts`
 * (`usePdfClient`) during the 2026-06 PDF domain consolidation — one typed
 * transport for every surface. This file keeps the old import path + names
 * alive for the 27 demo pages until they're repointed; import
 * `usePdfClient` directly in new code.
 */

export {
  usePdfClient as usePdfDemoApi,
  pdfErrorFromResponse,
  type PdfClient as PdfDemoApi,
  type PdfEndpointKey,
  type PdfBinaryResult as BinaryResult,
} from "@/features/pdf/api/client";
