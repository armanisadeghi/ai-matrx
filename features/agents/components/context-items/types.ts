/**
 * Context-item drawer — shared types.
 *
 * A "context item" is anything attached to a user turn that shows up as a chip:
 * a pre-submit resource (ManagedResource, still editable before send) or a
 * post-submit content block (RenderBlockPayload, already sent). Both normalize
 * to a single {@link ContextDrawerItem} so the registry + drawer treat them
 * uniformly.
 *
 * THE registry of these types lives in `registry.tsx`. To add a custom UI for a
 * new attachable type, add a `ContextItemTypeDef` there — never branch on type
 * inside the drawer.
 */

import type { ComponentType } from "react";
import type { DataRef } from "@/features/agents/types/message-types";

/** Where a normalized item came from in the message lifecycle. */
export type ContextItemOrigin = "resource" | "block";

/** Underlying records a body component may render, pulled off block/source data. */
export interface ContextItemRefs {
  noteIds?: string[];
  taskIds?: string[];
  urls?: string[];
  dataRefs?: DataRef[];
  /** cld_files UUID for media blocks (MediaRef contract). */
  fileId?: string | null;
  /** Direct durable URL when no file_id is present. */
  fileUrl?: string | null;
  projectIds?: string[];
  agentIds?: string[];
  /** Active-context layer ids (org / single scope). */
  orgId?: string | null;
  scopeId?: string | null;
  transcriptIds?: string[];
  workbookIds?: string[];
  documentIds?: string[];
  /** Free text payload (text / editor pills). */
  text?: string | null;
}

/** The single normalized descriptor the registry + drawer operate on. */
export interface ContextDrawerItem {
  /** Stable id for React keys + nav. */
  id: string;
  /** ResourceBlockType-style spelling (e.g. `input_notes`, `image`). */
  blockType: string;
  /** Short type label, e.g. "Note". */
  typeLabel: string;
  /** Display title — one line. */
  title: string;
  icon: ComponentType<{ className?: string }>;
  /** Theme key for ResourceAttachmentTile / chrome. */
  themeKey: string;
  origin: ContextItemOrigin;
  conversationId: string;
  /** Whether this type can be edited in place. */
  editable: boolean;
  refs: ContextItemRefs;
  /** Raw underlying payload for fallback rendering. */
  raw: unknown;
  /** Pre-submit only: the resource id, for write-back / option toggles. */
  resourceId?: string;
}

/** Props every drawer body (and footer) receives. */
export interface ContextItemBodyProps {
  item: ContextDrawerItem;
  /**
   * Report the resolved record title up to the drawer's title bar. Lets a body
   * show the real label (e.g. the note's title) without rendering its own
   * duplicate header. Call once the record loads.
   */
  setTitle?: (title: string) => void;
}

/**
 * A registered context-item type.
 *
 * Layout contract: `Body` owns the FULL content area and must fill its height
 * (`h-full`/flex). Any links, lists, or metadata belong in the compact `Footer`
 * (a single thin row of icon actions / inline meta) — never a tall header that
 * steals vertical space. The drawer's title bar already shows the icon + title.
 */
export interface ContextItemTypeDef {
  /** Every blockType spelling that resolves to this def. */
  blockTypes: string[];
  typeLabel: string;
  icon: ComponentType<{ className?: string }>;
  themeKey: string;
  /** Can instances of this type be edited in place? */
  editable: boolean;
  /** The drawer body — fills the full content area. */
  Body: ComponentType<ContextItemBodyProps>;
  /** Optional compact footer row (links / meta / icon actions). */
  Footer?: ComponentType<ContextItemBodyProps>;
  /**
   * Optional inline actions rendered beside the drawer title (icon toggles,
   * view modes). Keeps high-frequency controls out of the footer.
   */
  TitleActions?: ComponentType<ContextItemBodyProps>;
}
