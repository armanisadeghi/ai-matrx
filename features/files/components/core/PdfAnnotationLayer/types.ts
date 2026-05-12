/**
 * Shared types for the PdfAnnotationLayer overlay primitive.
 *
 * Coordinates are always in PDF user-space points (PyMuPDF convention,
 * top-left origin). The layer translates between PDF-points and canvas-px
 * via the page's natural dimensions + current render scale + rotation.
 */

export interface PdfBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PdfRegion {
  /** Stable identifier — annotation id, candidate result_id+index, entity id, etc. */
  id: string;
  page_number: number;
  bbox: PdfBbox;
  /** Visual style hints. The layer auto-picks a category color when omitted. */
  color?: string;
  fill?: string;
  /** Free-text label rendered at the top-left of the rect (small, never overflowing). */
  label?: string;
  /** Semantic kind drives the color palette: "annotation" | "candidate" | "search" | "selection" | "page-overlay" */
  kind?: RegionKind;
  /** When true the layer draws a dim/strike pattern on top — used for excluded pages
   *  or rejected candidates. */
  muted?: boolean;
}

export type RegionKind =
  | "annotation"
  | "candidate"
  | "search"
  | "selection"
  | "page-overlay";

export interface PendingDraw {
  page_number: number;
  bbox: PdfBbox;
}

export type AnnotationLayerMode = "view" | "draw" | "select";
