/**
 * host/content-ir-slots — the app's kind / component registries, region-envelope memo, kind
 * correctors, splitter primitives and shape browser, registered into the package
 * (chat-package-move P14).
 *
 * The stream accumulator and the message selectors need these at call time; the registries are
 * the app's (database-backed kinds, org overrides, `crm` correctors), so the package reaches
 * them through typed function slots and never imports them. The app registers them in
 * `providers/chatContentIrRegistration.ts`. A bare host gets an honest default: no envelope is
 * attached (the block renders as the text it is), no kind schemas are known, nothing is
 * validated — each reported once (Law 4). The splitter primitives have no honest stand-in (they
 * ARE the block classifier), so a host without them fails loudly by name.
 *
 * The slot names extend `ChatUiSlots` by augmentation, so `registerChatUi` accepts them.
 */

import type { CanonicalBlockIR, KindSchema } from "@ai-matrx/content-ir";
import { sanitizeInboundEnvelopeMetadata as sanitizeInboundEnvelopeMetadataPure } from "@ai-matrx/content-ir";
import type { KindValidator } from "@ai-matrx/content-ir/registry";
import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import { captureError } from "./diagnostics";
import { createElement, type ComponentType } from "react";
import { hostFn, hostSlot } from "./ui-slots";

/** The registry a streaming parse resolves kind schemas through (the host's `kindRegistry`). */
export interface ContentIrKindRegistryPort {
  /** The parser-facing resolver: a sync fast path plus a cold request. */
  resolver(): { get(kind: string): KindSchema | undefined; request(kind: string): void };
  onSchemaArrived(listener: (kind: string, schema: KindSchema | null) => void): () => void;
  ensureWarm(): Promise<void>;
  requestSchema(kind: string): void;
}

/** The registry of rendering components per kind (the host's `componentRegistry`). */
export interface ContentIrComponentRegistryPort {
  ensureWarm(): Promise<void>;
  requestComponent(kind: string, platform: string, role: string): void;
}

/** The block classifier's text primitives (the host's content splitter). */
export interface ContentSplitterPrimitives {
  /** The code languages that open a registered special block rather than plain code. */
  SPECIAL_CODE_LANGUAGES: readonly string[];
  detectJsonBlockType(content: string): string | null;
  parseXmlAttributes(openingTag: string): Record<string, string>;
  extractAudioLink(line: string): { src: string; alt: string } | null;
  detectImageMarkdown(line: string): { isImage: boolean; src?: string; alt?: string };
  countInlineImages(line: string): number;
  detectVideoMarkdown(line: string): { isVideo: boolean; src?: string; alt?: string };
  detectMatrxFileMarkdown(line: string): { isMatrxFile: boolean; url?: string; label?: string; pre?: string; post?: string };
  isCompleteUnrecognizedXmlContainer(source: string): boolean;
  isUnclosedGenericXmlOpening(source: string): boolean;
  startUnrecognizedXmlContainer(line: string): { tracker: UnrecognizedXmlContainerTracker; [prop: string]: unknown } | null;
  normalizeCodeLanguage(language: string | undefined): string | undefined;
}

export interface UnrecognizedXmlContainerTracker {
  readonly rootTag: string;
  consumeLine(line: string, startOffset?: number): number | null;
}

declare module "./ui-slots" {
  interface ChatUiSlots {
    /** Seeds the region-envelope memo with one already-validated envelope. */
    seedEnvelope: (envelope: CanonicalBlockIR) => void;
    /** Seeds the memo from a message part's persisted `metadata.__ir` cache; returns the count seeded. */
    seedPersistedEnvelopeCache: (metadata: Record<string, unknown> | null | undefined) => number;
    /** Merges the canonical envelope for a region's source into a block's metadata. */
    withIrEnvelope: (
      source: string,
      metadata: Record<string, unknown> | undefined,
      options?: { allowTerminalError?: boolean },
    ) => Record<string, unknown> | undefined;
    /** A finished parse session's envelope, with the host's kind correctors applied. */
    sessionEnvelope: (session: { buildEnvelope(): CanonicalBlockIR } | null | undefined) => CanonicalBlockIR | null;
    /** The envelope for a completed xml region whose tag a surface claims, else null. */
    envelopeForCompletedXmlRegion: (tag: string, regionText: string) => CanonicalBlockIR | null;
    /** The envelope for a completed fence region whose language a surface claims, else null. */
    envelopeForCompletedFenceRegion: (language: string, regionText: string) => CanonicalBlockIR | null;
    /** The host's kind registry. */
    contentIrKindRegistry: () => ContentIrKindRegistryPort;
    /** The host's kind component registry. */
    contentIrComponentRegistry: () => ContentIrComponentRegistryPort;
    /** The host's kind validator (the live kind catalog's contracts). */
    contentIrKindValidator: () => KindValidator;
    /** A server progress event's `content_ir` as a render block, or null. */
    progressDataRenderBlock: (data: unknown, eventIndex: number, blockIndex: number) => RenderBlockPayload | null;
    /** The block classifier's text primitives. */
    contentSplitterPrimitives: () => ContentSplitterPrimitives;
    /** Draws a kind instance through the host's one value door (`KindInstanceRender`), same props. */
    KindInstanceRender: ComponentType<{ kind: string; value: unknown; variant?: string; [prop: string]: unknown }>;
    /** The list of records anchored to one thing (the host's `AnchorRecordsList`), same props. */
    AnchorRecordsList: ComponentType<{ state: AnchorRecordsState; loadingText: string; emptyText: string; label?: string; className?: string }>;
    /** Reads the records anchored to one thing; `enabled` false reads nothing (zero-prefetch). */
    useAnchorRecords: (anchor: { type: string; id: string } | null, enabled?: boolean) => AnchorRecordsState;
    /** One page of the host's shape (kind) catalog. */
    fetchShapePage: (query: unknown, sort: unknown) => Promise<{ rows: ShapeBrowseRow[]; total: number }>;
    /** One shape row by kind slug, or null. */
    fetchShapeByKind: (kind: string) => Promise<ShapeBrowseRow | null>;
  }
}

/** What an anchor's record read reports (the host's `AnchorRecordsState`). */
export interface AnchorRecordsState {
  status: "loading" | "ready" | "error";
  records: readonly unknown[];
  active: readonly unknown[];
  archived: readonly unknown[];
  message: string | null;
  reload: () => void;
}

/** The anchor type of a conversation's own records. */
export const CONVERSATION_ANCHOR_TYPE = "conversation";

/** A host with no record store shows nothing for the records of a chat (reported once). */
export const KindInstanceRender = hostSlot("KindInstanceRender", ({ value }: { value?: unknown }) =>
  createElement(
    "pre",
    { className: "whitespace-pre-wrap break-words text-xs", "data-chat-slot-fallback": "KindInstanceRender" },
    typeof value === "string" ? value : JSON.stringify(value ?? null, null, 2),
  ),
);
export const AnchorRecordsList = hostSlot("AnchorRecordsList");
/** A host with no record store reads no records: the list stays empty and says nothing is stored here. */
export const useAnchorRecords = hostFn("useAnchorRecords", (): AnchorRecordsState => ({
  status: "ready",
  records: [],
  active: [],
  archived: [],
  message: null,
  reload: () => undefined,
}));

/** One row, exactly as the host's shape list returns it. */
export interface ShapeBrowseRow {
  access_level: string;
  authoring_owner: string;
  created_at: string;
  created_by: string;
  description: string;
  family: string;
  has_component: boolean;
  id: string;
  is_active: boolean;
  is_owner: boolean;
  kind: string;
  label: string;
  organization_id: string;
  organization_name: string;
  origin: string;
  owner_email: string;
  total_count: number;
  updated_at: string;
  version: number;
  visibility: string;
}

/** A host with no memo seeds nothing: its blocks are parsed fresh each time. */
export const seedEnvelope = hostFn("seedEnvelope", () => undefined);
export const seedPersistedEnvelopeCache = hostFn("seedPersistedEnvelopeCache", () => 0);
/** A host with no region memo attaches no envelope: the block renders as the text it is. */
export const withIrEnvelope = hostFn("withIrEnvelope", (_source: string, metadata: Record<string, unknown> | undefined) => metadata);
/** A host with no correctors takes the parse session's own envelope, uncorrected. */
export const sessionEnvelope = hostFn("sessionEnvelope", (session: { buildEnvelope(): CanonicalBlockIR } | null | undefined) =>
  session ? session.buildEnvelope() : null,
);
/** A host with no surface table claims no xml/fence region: the legacy rendering stands. */
export const envelopeForCompletedXmlRegion = hostFn("envelopeForCompletedXmlRegion", () => null);
export const envelopeForCompletedFenceRegion = hostFn("envelopeForCompletedFenceRegion", () => null);

const BARE_KIND_REGISTRY: ContentIrKindRegistryPort = {
  resolver: () => ({ get: () => undefined, request: () => undefined }),
  onSchemaArrived: () => () => undefined,
  ensureWarm: async () => undefined,
  requestSchema: () => undefined,
};
const BARE_COMPONENT_REGISTRY: ContentIrComponentRegistryPort = {
  ensureWarm: async () => undefined,
  requestComponent: () => undefined,
};
/** A host with no kind catalog knows no kind: every kind stays as the text it arrived as. */
export const contentIrKindRegistry = hostFn("contentIrKindRegistry", () => BARE_KIND_REGISTRY);
export const contentIrComponentRegistry = hostFn("contentIrComponentRegistry", () => BARE_COMPONENT_REGISTRY);
/** The accumulator's `kindRegistry` / `componentRegistry`: each call resolves the host's registry at that moment. */
export const kindRegistry: ContentIrKindRegistryPort = {
  resolver: () => contentIrKindRegistry().resolver(),
  onSchemaArrived: (listener) => contentIrKindRegistry().onSchemaArrived(listener),
  ensureWarm: () => contentIrKindRegistry().ensureWarm(),
  requestSchema: (kind) => contentIrKindRegistry().requestSchema(kind),
};
export const componentRegistry: ContentIrComponentRegistryPort = {
  ensureWarm: () => contentIrComponentRegistry().ensureWarm(),
  requestComponent: (kind, platform, role) => contentIrComponentRegistry().requestComponent(kind, platform, role),
};

/** A host with no kind catalog checks nothing and says so: a skip is never a pass. */
export const contentIrKindValidator = hostFn("contentIrKindValidator", (): KindValidator => ({
  validate: async (_value, kind) => ({
    kind,
    checked: false,
    ok: false,
    errors: ["This host has no kind catalog to check against (registerChatUi contentIrKindValidator)."],
    degradedReason: "catalog_unreachable",
  }),
  cachedSchema: async () => null,
  invalidate: () => undefined,
}));

/** A host with no progress adapter promotes nothing: the event keeps only its ordinary typed data. */
export const progressDataRenderBlock = hostFn("progressDataRenderBlock", () => null);

/** The classifier primitives have no honest stand-in: a host without them fails loudly by name. */
export const contentSplitterPrimitives = hostFn("contentSplitterPrimitives");

/** A host with no shape catalog has no shapes to browse: the read says so, the picker shows it. */
export const fetchShapePage = hostFn("fetchShapePage", async () => {
  throw new Error("This host has no shape catalog (registerChatUi fetchShapePage)");
});
export const fetchShapeByKind = hostFn("fetchShapeByKind", async () => {
  throw new Error("This host has no shape catalog (registerChatUi fetchShapeByKind)");
});

/**
 * Ingest guard for SERVER-BUILT envelopes riding `metadata.__ir` on a `render_block` event:
 * valid -> same reference back + seeded into the host's region-envelope memo; malformed ->
 * stripped copy + a loud diagnostic. Semantics live on the pure function in `@ai-matrx/content-ir`.
 */
export function sanitizeInboundEnvelopeMetadata(
  metadata: Record<string, unknown> | null | undefined,
  context: { blockId: string },
): Record<string, unknown> | undefined {
  return sanitizeInboundEnvelopeMetadataPure(metadata, context, {
    seedEnvelope: (envelope) => seedEnvelope(envelope),
    reportMalformed: ({ blockId, engine, raw }) => {
      captureError({
        source: "content-ir",
        message: `render_block "${blockId}" carried a malformed metadata.__ir envelope (engine "${engine}") — dropped before Redux so it can't poison the pipeline`,
        relation: engine,
        raw,
      });
    },
  });
}

// The classifier primitives as plain functions (each resolves the host's at call time), so call
// sites read exactly as they did when they imported the splitter.
export const detectJsonBlockType = (content: string) => contentSplitterPrimitives().detectJsonBlockType(content);
export const parseXmlAttributes = (openingTag: string) => contentSplitterPrimitives().parseXmlAttributes(openingTag);
export const extractAudioLink = (line: string) => contentSplitterPrimitives().extractAudioLink(line);
export const detectImageMarkdown = (line: string) => contentSplitterPrimitives().detectImageMarkdown(line);
export const countInlineImages = (line: string) => contentSplitterPrimitives().countInlineImages(line);
export const detectVideoMarkdown = (line: string) => contentSplitterPrimitives().detectVideoMarkdown(line);
export const detectMatrxFileMarkdown = (line: string) => contentSplitterPrimitives().detectMatrxFileMarkdown(line);
export const isCompleteUnrecognizedXmlContainer = (source: string) =>
  contentSplitterPrimitives().isCompleteUnrecognizedXmlContainer(source);
export const isUnclosedGenericXmlOpening = (source: string) => contentSplitterPrimitives().isUnclosedGenericXmlOpening(source);
export const startUnrecognizedXmlContainer = (line: string) => contentSplitterPrimitives().startUnrecognizedXmlContainer(line);
export const normalizeCodeLanguage = (language: string | undefined) => contentSplitterPrimitives().normalizeCodeLanguage(language);
/** True when `language` opens a registered special block rather than plain code. */
export const isSpecialCodeLanguage = (language: string) => contentSplitterPrimitives().SPECIAL_CODE_LANGUAGES.includes(language);
