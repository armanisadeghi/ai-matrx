/**
 * StreamBlockAccumulator — Incremental block detection for streaming text.
 *
 * Sits inside the processStream() closure and ingests rAF-batched text
 * deltas. For each delta it runs the cheap content-prefilter (classifyLine)
 * to detect block boundaries and emits upsertRenderBlock dispatches so
 * Redux stores typed RenderBlockPayloads incrementally.
 *
 * 97% of lines are plain text — they append to the current text block
 * with zero regex or parsing. The remaining 3% trigger boundary
 * transitions (code fences, XML tags, tables, images, etc.).
 *
 * Key constraint: each character is processed exactly once. The
 * accumulator never re-reads completed blocks.
 */

import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import {
  classifyLine,
  isPlainText,
  hasCandidate,
  Candidate,
  type CandidateFlags,
} from "./content-prefilter";
import {
  detectJsonBlockType,
  parseXmlAttributes,
  extractAudioLink,
  detectImageMarkdown,
  detectVideoMarkdown,
} from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";

// ============================================================================
// Types
// ============================================================================

type DispatchFn = (action: unknown) => unknown;

type BlockSubState =
  | { kind: "none" }
  | {
      kind: "code_fence";
      language: string;
      fenceTicks: number;
      /** Set to true once we've found the JSON root key and upgraded the block type. */
      earlyTypeResolved: boolean;
    }
  | {
      kind: "xml_tag";
      tagName: string;
      closingTag: string;
      /**
       * The literal opening tag text (e.g. `<decision prompt="..." id="...">`),
       * captured at open-time. Used to (a) re-derive attributes after streaming
       * emits and (b) build `metadata.rawXml` that the renderer / inline-edit
       * flows feed back into `replaceBlockContent`.
       */
      openingTagText: string;
      /** Parsed attributes for attribute-XML blocks (decision/artifact/editor_*). Empty for simple XML. */
      attributes: Record<string, string>;
      /** True for tags in ATTR_XML_TAGS — drives whether we build typed metadata. */
      isAttrXml: boolean;
    }
  | { kind: "table" }
  | {
      kind: "bare_json";
      /** Running count of `{` characters seen so far — including the opening line. */
      openBraces: number;
      /** Running count of `}` characters seen so far. */
      closeBraces: number;
    };

// ============================================================================
// Known XML tag sets (mirrored from content-prefilter for closing-tag matching)
// ============================================================================

const SIMPLE_XML_TAGS = new Set([
  "thinking",
  "think",
  "reasoning",
  "info",
  "task",
  "database",
  "private",
  "plan",
  "event",
  "tool",
  "questionnaire",
  "flashcards",
  "cooking_recipe",
  "timeline",
  "progress_tracker",
  "troubleshooting",
  "resources",
  "research",
]);

const ATTR_XML_TAGS = new Set([
  "decision",
  "artifact",
  // Editor pills — round-trip representation of code-editor errors and selected
  // code snippets. Attributes carry file/line/severity/language; the body
  // carries `<message>`+`<surrounding_code>` for errors, raw code for snippets.
  // Must mirror ATTRIBUTE_XML_BLOCKS in content-splitter-v2.ts.
  "editor_error",
  "editor_code_snippet",
]);

// ============================================================================
// Helpers
// ============================================================================

/**
 * True when `text` parses as a JSON object/array. Mirrors the V2 splitter's
 * `JSON.parse` guard for bare `{…}` blocks so both parsers agree that prose
 * like an indented `{ some code }` is text, not a JSON code block.
 */
function isParseableJsonObject(text: string): boolean {
  try {
    const parsed = JSON.parse(text);
    return parsed !== null && typeof parsed === "object";
  } catch {
    return false;
  }
}

function extractFenceInfo(
  trimmed: string,
): { language: string; ticks: number } | null {
  let ticks = 0;
  while (ticks < trimmed.length && trimmed[ticks] === "`") ticks++;
  if (ticks < 3) return null;
  const language = trimmed.slice(ticks).trim().split(/\s/)[0] || "";
  return { language, ticks };
}

function extractOpeningXmlTag(trimmed: string): string | null {
  if (trimmed[0] !== "<") return null;
  let i = 1;
  while (i < trimmed.length) {
    const c = trimmed.charCodeAt(i);
    if (
      (c >= 97 && c <= 122) ||
      (c >= 65 && c <= 90) ||
      (c >= 48 && c <= 57) ||
      c === 95
    ) {
      i++;
    } else {
      break;
    }
  }
  if (i === 1) return null;
  const tag = trimmed.substring(1, i).toLowerCase();
  if (SIMPLE_XML_TAGS.has(tag) || ATTR_XML_TAGS.has(tag)) return tag;
  return null;
}

function mapXmlTagToBlockType(tag: string): string {
  if (tag === "think") return "thinking";
  return tag;
}

/**
 * Extracts the literal opening tag text from the start of a trimmed line.
 * Returns e.g. `<decision prompt="...">` or `<thinking>`.
 * Returns the raw bracketed string verbatim; attribute parsing is a separate step.
 */
function extractOpeningTagText(trimmed: string, tag: string): string {
  const close = trimmed.indexOf(">");
  if (close === -1) return `<${tag}>`;
  return trimmed.slice(0, close + 1);
}

/**
 * Mid-line attribute-XML detection. Mirrors `detectMidLineAttributeXml` in
 * content-splitter-v2.ts so the streaming path doesn't miss `<decision …>`
 * (and friends) when the model emits them inline (e.g.
 * "Here's a question: <decision prompt='…'>…").
 *
 * Only attribute-bearing tags can appear mid-line — simple tags like
 * `<flashcards>` are never emitted mid-sentence by models.
 */
function findMidLineAttrXml(rawLine: string): {
  tagStart: number;
  tag: string;
  openingTagText: string;
  attributes: Record<string, string>;
} | null {
  for (const tag of ATTR_XML_TAGS) {
    const prefix = `<${tag}`;
    const idx = rawLine.indexOf(prefix);
    if (idx === -1) continue;
    if (rawLine.trimStart().startsWith(prefix)) continue;
    const after = rawLine[idx + prefix.length];
    if (after !== " " && after !== ">") continue;
    const close = rawLine.indexOf(">", idx);
    if (close === -1) continue;
    const openingTagText = rawLine.slice(idx, close + 1);
    return {
      tagStart: idx,
      tag,
      openingTagText,
      attributes: parseXmlAttributes(openingTagText),
    };
  }
  return null;
}

interface DecisionOption {
  id: string;
  label: string;
  text: string;
}

interface DecisionData {
  id: string;
  prompt: string;
  options: DecisionOption[];
}

/**
 * Parses `<option label="...">…</option>` children out of a `<decision>` body.
 * Only counts options whose closing `</option>` has streamed in — partial
 * options are skipped so the renderer never shows a half-rendered choice.
 * Mirrors the parsing in content-splitter-v2.ts:extractAttributeXmlBlock.
 */
function parseDecisionOptions(
  blockSourceText: string,
  decisionId: string,
): DecisionOption[] {
  const options: DecisionOption[] = [];
  const optionRegex = /<option\s+label="([^"]*)">([\s\S]*?)<\/option>/g;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = optionRegex.exec(blockSourceText)) !== null) {
    options.push({
      id: `${decisionId}-opt-${i}`,
      label: match[1],
      text: match[2].trim(),
    });
    i++;
  }
  return options;
}

// ============================================================================
// StreamBlockAccumulator
// ============================================================================

export class StreamBlockAccumulator {
  private requestId: string;
  private currentBlockIndex = 0;
  private currentBlockType = "text";
  private currentBlockContent = "";
  /**
   * Number of lines appended to the current block. Used to preserve LEADING
   * blank lines: the first appended line is written verbatim (even if it's an
   * empty string), and every subsequent line is joined with "\n". Without this
   * counter, appending "" to an empty `currentBlockContent` was a no-op, which
   * silently swallowed a block's first blank line and produced a 1-byte drift
   * vs the V2 splitter / Python server (which keep that blank line).
   */
  private currentBlockLineCount = 0;
  private pendingLineFragment = "";
  /**
   * True once the block at the current index has been dispatched to Redux —
   * including speculative streaming projections of `pendingLineFragment`
   * (see `emitCurrentBlock`). Reset whenever a new block is opened. Used by
   * `closeCurrentBlock` to retract a speculative block whose line turned out
   * to be a different typed block (see the bare-JSON duplication note there).
   */
  private currentBlockEmitted = false;
  private subState: BlockSubState = { kind: "none" };
  /**
   * URL + label for the current `audio` block. The accumulator's single-line
   * media blocks (image/video) leave `data` null, which is why the legacy
   * client image/video markdown path never populated `src`. Audio MUST carry
   * its URL on `data.src` or BlockRenderer's `audio` case renders nothing —
   * so we stash the extracted link here and emit it via buildBlockData.
   */
  private pendingMediaData: { src: string; alt: string } | null = null;
  private ingestCount = 0;
  private emitCount = 0;
  private upsertAction: (payload: {
    requestId: string;
    block: RenderBlockPayload;
  }) => unknown;

  constructor(
    requestId: string,
    upsertAction: (payload: {
      requestId: string;
      block: RenderBlockPayload;
    }) => unknown,
  ) {
    this.requestId = requestId;
    this.upsertAction = upsertAction;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Ingest a text delta (the rAF-batched textBuffer content).
   * Processes only complete lines; the trailing fragment is held until the
   * next call or finalize().
   */
  ingest(text: string, dispatch: DispatchFn): void {
    this.ingestCount++;
    const combined = this.pendingLineFragment + text;
    const parts = combined.split("\n");

    // Last element may be incomplete (no trailing newline)
    this.pendingLineFragment = parts.pop()!;

    for (const rawLine of parts) {
      this.processLine(rawLine, dispatch);
    }

    this.emitCurrentBlock(dispatch, "streaming");
  }

  /**
   * Flush remaining content and mark the final block as complete.
   * Called once after the stream loop ends.
   */
  finalize(dispatch: DispatchFn): void {
    if (this.pendingLineFragment) {
      this.processLine(this.pendingLineFragment, dispatch);
      this.pendingLineFragment = "";
    }
    // If the stream ended while still inside a bare JSON block (unbalanced braces),
    // run a final type detection pass so we at least get the right block type.
    if (this.subState.kind === "bare_json") {
      const jsonType = detectJsonBlockType(this.currentBlockContent);
      if (jsonType) {
        this.currentBlockType = jsonType;
      }
    }
    this.emitCurrentBlock(dispatch, "complete");
    // console.log(
    //   `%c[BlockAccumulator] FINALIZED for ${this.requestId.slice(0, 8)} — ${this.ingestCount} ingests, ${this.emitCount} dispatches, ${this.currentBlockIndex + 1} blocks total`,
    //   "color: #4ade80; font-weight: bold",
    // );
  }

  /**
   * Close the current text block at an interleaved-content boundary — a tool
   * call that lands BETWEEN two text runs. The NEXT text run then opens a
   * FRESH render block instead of appending onto the block that held the text
   * BEFORE the tool.
   *
   * Why this exists: the accumulator lives for the whole stream and is never
   * otherwise told about tool calls. Without this break, "text → tool → text"
   * collapses both runs into a single `client_block_N`. The timeline still
   * records a `text_end` for the second run, but its
   * `[blockStartIndex, blockEndIndex)` range comes out EMPTY (no new blockId
   * was pushed), so `selectUnifiedSlots` emits `[merged_text, tool]` — the
   * tool card renders AFTER all the text, destroying chronological order.
   * (The persisted/DB path is unaffected because it rebuilds each run's text
   * from `text_end.rawText`, which is why a reload renders correctly.)
   *
   * Call this once per tool event, BEFORE the tool's `appendTimeline` dispatch
   * and AFTER the pre-tool text has been flushed into the accumulator
   * (process-stream's `dispatchBatch()` does that flush). It is a no-op when
   * there is nothing open to break (back-to-back tool events, a tool with no
   * preceding text, a tool right after a media block), so it is always safe.
   */
  breakTextBlock(dispatch: DispatchFn): void {
    if (
      !this.currentBlockContent &&
      !this.pendingLineFragment &&
      !this.currentBlockEmitted
    ) {
      return;
    }
    if (this.pendingLineFragment) {
      this.processLine(this.pendingLineFragment, dispatch);
      this.pendingLineFragment = "";
    }
    // A tool call landing mid bare-JSON means the model closed that content
    // here. Run the same final type detection finalize() does so a partially
    // streamed bare-JSON block still commits with its resolved type.
    if (this.subState.kind === "bare_json") {
      const jsonType = detectJsonBlockType(this.currentBlockContent);
      if (jsonType) this.currentBlockType = jsonType;
    }
    this.closeCurrentBlock(dispatch);
    this.subState = { kind: "none" };
    this.openBlock("text", dispatch);
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private get currentBlockId(): string {
    return `client_block_${this.currentBlockIndex}`;
  }

  private processLine(rawLine: string, dispatch: DispatchFn): void {
    const trimmed = rawLine.trim();

    // If we're inside a multi-line sub-state, delegate to the appropriate handler
    if (this.subState.kind !== "none") {
      this.processSubStateLine(rawLine, trimmed, dispatch);
      return;
    }

    const flags = classifyLine(rawLine, trimmed);

    if (isPlainText(flags)) {
      this.appendToCurrentBlock(rawLine);
      return;
    }

    // ── Code fence opening ────────────────────────────────────────────
    if (hasCandidate(flags, Candidate.CODE)) {
      const fence = extractFenceInfo(trimmed);
      if (fence) {
        this.closeCurrentBlock(dispatch);
        // Mermaid fences promote to a first-class block type at open time so
        // the diagram renders progressively during the stream. The fence line
        // arrives as a complete line (pendingLineFragment holds partials), so
        // the language token is never truncated here. Mirrors the splitter's
        // SPECIAL_CODE_LANGUAGES promotion; other special languages keep
        // their established close-time/server-side promotion paths.
        const lang = fence.language.toLowerCase();
        const blockType =
          lang === "mermaid" || lang === "mmd"
            ? "mermaid"
            : lang === "svg"
              ? "svg"
              : "code";
        this.openBlock(blockType, dispatch);
        this.subState = {
          kind: "code_fence",
          language: fence.language,
          fenceTicks: fence.ticks,
          earlyTypeResolved: false,
        };
        return;
      }
    }

    // ── XML tag opening (simple or attribute-bearing) ──────────────────
    if (
      hasCandidate(flags, Candidate.XML_SIMPLE) ||
      hasCandidate(flags, Candidate.XML_ATTR)
    ) {
      const tag = extractOpeningXmlTag(trimmed);
      if (tag) {
        this.openXmlTagBlock(tag, rawLine, trimmed, dispatch);
        return;
      }
    }

    // ── Mid-line attribute XML (e.g. `Some text <decision …>`) ─────────
    // Prefilter doesn't flag XML_ATTR unless the line starts with `<` after
    // trim, so this branch is the streamer's mirror of step 5.5 in
    // content-splitter-v2. Attribute-bearing tags only — simple tags are
    // never emitted mid-sentence.
    {
      const midLine = findMidLineAttrXml(rawLine);
      if (midLine) {
        const before = rawLine.slice(0, midLine.tagStart);
        const fromTag = rawLine.slice(midLine.tagStart);
        if (before.trimEnd()) {
          this.appendToCurrentBlock(before.trimEnd());
        }
        this.closeCurrentBlock(dispatch);
        const blockType = mapXmlTagToBlockType(midLine.tag);
        this.openBlock(blockType, dispatch);
        this.subState = {
          kind: "xml_tag",
          tagName: midLine.tag,
          closingTag: `</${midLine.tag}>`,
          openingTagText: midLine.openingTagText,
          attributes: midLine.attributes,
          isAttrXml: true,
        };
        this.appendToCurrentBlock(fromTag);
        if (fromTag.includes(`</${midLine.tag}>`)) {
          this.closeCurrentBlock(dispatch);
          this.subState = { kind: "none" };
          this.openBlock("text", dispatch);
        }
        return;
      }
    }

    // ── Table row ─────────────────────────────────────────────────────
    if (
      hasCandidate(flags, Candidate.TABLE) &&
      this.currentBlockType !== "table"
    ) {
      this.closeCurrentBlock(dispatch);
      this.openBlock("table", dispatch);
      this.subState = { kind: "table" };
      this.appendToCurrentBlock(rawLine);
      return;
    }

    // ── Image ─────────────────────────────────────────────────────────
    // The prefilter only checks the line starts with `![` (or `[Image URL:`).
    // Validate with the SAME detector the V2 splitter uses so the two agree:
    // incomplete or reference-style images (![alt][id]) fall through to text.
    if (
      hasCandidate(flags, Candidate.IMAGE) &&
      detectImageMarkdown(rawLine).isImage
    ) {
      this.closeCurrentBlock(dispatch);
      this.openBlock("image", dispatch);
      this.appendToCurrentBlock(trimmed);
      this.closeCurrentBlock(dispatch);
      this.openBlock("text", dispatch);
      return;
    }

    // ── Video ─────────────────────────────────────────────────────────
    if (
      hasCandidate(flags, Candidate.VIDEO) &&
      detectVideoMarkdown(rawLine).isVideo
    ) {
      this.closeCurrentBlock(dispatch);
      this.openBlock("video", dispatch);
      this.appendToCurrentBlock(trimmed);
      this.closeCurrentBlock(dispatch);
      this.openBlock("text", dispatch);
      return;
    }

    // ── Audio ─────────────────────────────────────────────────────────
    // An audio response that streamed in as a markdown/text link. We split it
    // into its own `audio` block carrying the resolved URL on `data.src` so
    // BlockRenderer renders the same player the DB (audio_output) path does,
    // live and without waiting for reload. Falls through to text if the
    // prefilter flagged a false positive (extraction returns null).
    if (hasCandidate(flags, Candidate.AUDIO)) {
      const audio = extractAudioLink(rawLine);
      if (audio) {
        this.closeCurrentBlock(dispatch);
        this.openBlock("audio", dispatch);
        this.pendingMediaData = audio;
        this.appendToCurrentBlock(rawLine);
        this.closeCurrentBlock(dispatch);
        this.openBlock("text", dispatch);
        return;
      }
    }

    // ── MATRX broker ──────────────────────────────────────────────────
    if (hasCandidate(flags, Candidate.MATRX)) {
      this.closeCurrentBlock(dispatch);
      this.openBlock("matrxBroker", dispatch);
      this.appendToCurrentBlock(rawLine);
      this.closeCurrentBlock(dispatch);
      this.openBlock("text", dispatch);
      return;
    }

    // ── Divider ───────────────────────────────────────────────────────
    if (hasCandidate(flags, Candidate.DIVIDER)) {
      this.closeCurrentBlock(dispatch);
      const isHeavy = trimmed.startsWith("#");
      this.openBlock(isHeavy ? "heavy-divider" : "accent-divider", dispatch);
      this.appendToCurrentBlock(rawLine);
      this.closeCurrentBlock(dispatch);
      this.openBlock("text", dispatch);
      return;
    }

    // ── Bare JSON object (no ``` fences) ──────────────────────────────
    // A model sometimes outputs {"key": ...} directly. We track brace
    // depth across lines so the block closes when the object is complete.
    if (hasCandidate(flags, Candidate.BARE_JSON) && trimmed.startsWith("{")) {
      const openCount = (trimmed.match(/\{/g) || []).length;
      const closeCount = (trimmed.match(/\}/g) || []).length;
      // A balanced single-line {…} is only a JSON block if it actually parses
      // as JSON (V2 does the same). Otherwise it's ordinary prose — e.g. an
      // indented "{ some code }" — and must stay in the text flow rather than
      // becoming its own code block. Multi-line {…} stays speculative (we can't
      // look ahead while streaming).
      if (
        openCount === closeCount &&
        openCount > 0 &&
        !isParseableJsonObject(trimmed)
      ) {
        this.appendToCurrentBlock(rawLine);
        return;
      }
      this.closeCurrentBlock(dispatch);
      this.openBlock("code", dispatch); // may be upgraded to a typed JSON block
      this.subState = {
        kind: "bare_json",
        openBraces: openCount,
        closeBraces: closeCount,
      };
      this.appendToCurrentBlock(rawLine);
      // Single-line JSON — close immediately after type detection
      if (openCount === closeCount && openCount > 0) {
        const jsonType = detectJsonBlockType(this.currentBlockContent);
        this.currentBlockType = jsonType ?? "code";
        this.closeCurrentBlock(dispatch);
        this.subState = { kind: "none" };
        this.openBlock("text", dispatch);
      }
      return;
    }

    // ── Tree lines are accumulated as text (the tree detector in
    // splitContentIntoBlocksV2 requires 3+ consecutive lines — we defer
    // that consolidation to finalization or to BlockRenderer). ──────────

    // Fallback: treat as text
    this.appendToCurrentBlock(rawLine);
  }

  private processSubStateLine(
    rawLine: string,
    trimmed: string,
    dispatch: DispatchFn,
  ): void {
    switch (this.subState.kind) {
      case "code_fence": {
        const fence = extractFenceInfo(trimmed);
        if (
          fence &&
          fence.ticks >= this.subState.fenceTicks &&
          trimmed.slice(fence.ticks).trim() === ""
        ) {
          // Fence is closing. For any JSON fence, run type detection on the
          // full accumulated content. This handles cases where early detection
          // failed (e.g. model split `{` and `"diagram":` across lines).
          // If detection finds a known type, upgrade; otherwise keep "code".
          if (this.subState.language === "json") {
            const confirmed = detectJsonBlockType(this.currentBlockContent);
            this.currentBlockType = confirmed ?? "code";
          }
          this.closeCurrentBlock(dispatch);
          this.subState = { kind: "none" };
          this.openBlock("text", dispatch);
        } else {
          // Early JSON sub-type detection: run on each content line until we
          // find the root key. The blockId is index-based (stable), so upgrading
          // currentBlockType mid-stream safely overwrites the same Redux entry
          // with the new type and status:"streaming" → loading skeleton shows.
          if (
            this.subState.language === "json" &&
            !this.subState.earlyTypeResolved
          ) {
            const soFar = this.currentBlockContent
              ? this.currentBlockContent + "\n" + rawLine
              : rawLine;
            const jsonType = detectJsonBlockType(soFar);
            if (jsonType) {
              this.subState.earlyTypeResolved = true;
              this.currentBlockType = jsonType;
            }
          }
          this.appendToCurrentBlock(rawLine);
        }
        return;
      }

      case "xml_tag": {
        this.appendToCurrentBlock(rawLine);
        if (trimmed.includes(this.subState.closingTag)) {
          this.closeCurrentBlock(dispatch);
          this.subState = { kind: "none" };
          this.openBlock("text", dispatch);
        }
        return;
      }

      case "table": {
        const flags = classifyLine(rawLine, trimmed);
        // Only table rows extend the table. A blank line (or anything else)
        // ENDS it — matching V2's extractTable, which stops at the first
        // non-table-row. Eating the blank line here was adding a trailing
        // newline to the table and stealing the leading newline from the
        // following text block (V2/Redux table drift).
        if (hasCandidate(flags, Candidate.TABLE)) {
          this.appendToCurrentBlock(rawLine);
        } else {
          this.closeCurrentBlock(dispatch);
          this.subState = { kind: "none" };
          this.openBlock("text", dispatch);
          this.processLine(rawLine, dispatch);
        }
        return;
      }

      case "bare_json": {
        this.appendToCurrentBlock(rawLine);
        this.subState.openBraces += (trimmed.match(/\{/g) || []).length;
        this.subState.closeBraces += (trimmed.match(/\}/g) || []).length;

        if (
          this.subState.openBraces === this.subState.closeBraces &&
          this.subState.openBraces > 0
        ) {
          // Braces balanced — detect specific JSON type, then close the block.
          // closeCurrentBlock must be called BEFORE resetting subState so that
          // buildBlockData can still return { language: "json" } if needed.
          const jsonType = detectJsonBlockType(this.currentBlockContent);
          this.currentBlockType = jsonType ?? "code";
          this.closeCurrentBlock(dispatch);
          this.subState = { kind: "none" };
          this.openBlock("text", dispatch);
        }
        return;
      }
    }
  }

  // ── XML opening helper ──────────────────────────────────────────────

  private openXmlTagBlock(
    tag: string,
    rawLine: string,
    trimmed: string,
    dispatch: DispatchFn,
  ): void {
    this.closeCurrentBlock(dispatch);
    const blockType = mapXmlTagToBlockType(tag);
    this.openBlock(blockType, dispatch);
    const isAttrXml = ATTR_XML_TAGS.has(tag);
    const openingTagText = extractOpeningTagText(trimmed, tag);
    const attributes = isAttrXml ? parseXmlAttributes(openingTagText) : {};
    this.subState = {
      kind: "xml_tag",
      tagName: tag,
      closingTag: `</${tag}>`,
      openingTagText,
      attributes,
      isAttrXml,
    };
    this.appendToCurrentBlock(rawLine);
    if (trimmed.includes(`</${tag}>`)) {
      this.closeCurrentBlock(dispatch);
      this.subState = { kind: "none" };
      this.openBlock("text", dispatch);
    }
  }

  // ── Block lifecycle helpers ─────────────────────────────────────────

  private appendToCurrentBlock(line: string): void {
    // Join on "\n" from the second line onward. Keyed off the line COUNT (not
    // whether content is currently empty) so a leading blank line is preserved
    // verbatim — matching V2's `currentText += line + "\n"` accumulation.
    if (this.currentBlockLineCount === 0) {
      this.currentBlockContent = line;
    } else {
      this.currentBlockContent += "\n" + line;
    }
    this.currentBlockLineCount++;
  }

  private closeCurrentBlock(dispatch: DispatchFn): void {
    if (!this.currentBlockContent.trim()) {
      // No committed content. But the block may already exist in Redux as a
      // speculative streaming projection of `pendingLineFragment` — e.g. a
      // single-line bare JSON `{"entities": []}` (structured output) that
      // arrived with no trailing newline. That fragment streamed in here as a
      // plain `text` block, and is now being reclassified into its own typed
      // block (bare_json / code_fence / xml / table / divider) at the NEXT
      // index. Without retracting it, the stale text block lingers and renders
      // *alongside* the typed block — the JSON-duplication bug (raw copy +
      // fenced copy). Emit a content-less "complete" upsert so the renderer
      // (which filters on `content?.trim()`) drops it.
      if (this.currentBlockEmitted) {
        this.retractCurrentBlock(dispatch);
        this.currentBlockEmitted = false;
      }
      return;
    }
    this.emitCurrentBlock(dispatch, "complete");
    this.currentBlockContent = "";
    this.currentBlockLineCount = 0;
  }

  /**
   * Overwrites the block at the current index with an empty, completed payload
   * so a previously-projected speculative streaming block is removed from the
   * rendered output. Keyed by `currentBlockId`, so it replaces the exact
   * Redux entry the speculative projection created.
   */
  private retractCurrentBlock(dispatch: DispatchFn): void {
    const block: RenderBlockPayload = {
      blockId: this.currentBlockId,
      blockIndex: this.currentBlockIndex,
      type: this.currentBlockType,
      status: "complete",
      content: null,
      data: null,
      metadata: undefined,
    };
    dispatch(this.upsertAction({ requestId: this.requestId, block }));
  }

  private openBlock(type: string, _dispatch: DispatchFn): void {
    this.currentBlockIndex++;
    this.currentBlockType = type;
    this.currentBlockContent = "";
    this.currentBlockLineCount = 0;
    this.currentBlockEmitted = false;
    this.pendingMediaData = null;
  }

  private emitCurrentBlock(
    dispatch: DispatchFn,
    status: "streaming" | "complete",
  ): void {
    let content = this.currentBlockContent;

    // Project in-flight characters so the UI physically streams char-by-char,
    // avoiding the broken line-by-line visual stuttering.
    if (status === "streaming" && this.pendingLineFragment) {
      if (
        this.subState.kind === "none" ||
        this.subState.kind === "code_fence" ||
        this.subState.kind === "bare_json"
      ) {
        content = content
          ? content + "\n" + this.pendingLineFragment
          : this.pendingLineFragment;
      }
    }

    // Strip trailing whitespace/newlines from plain text blocks to match the
    // V2 splitter (`currentText.trimEnd()`). Code and all other typed blocks
    // are left verbatim — V2 keeps code content untrimmed, which is what keeps
    // it byte-equal to the Python server.
    if (this.currentBlockType === "text") {
      content = content.trimEnd();
    }

    if (!content && status === "streaming") return;

    this.emitCount++;

    const block: RenderBlockPayload = {
      blockId: this.currentBlockId,
      blockIndex: this.currentBlockIndex,
      type: this.currentBlockType,
      status,
      content: content || null,
      data: this.buildBlockData(),
      metadata: this.buildBlockMetadata(status, content),
    };

    dispatch(this.upsertAction({ requestId: this.requestId, block }));
    // Record that this block index now exists in Redux — even when the only
    // thing emitted was a speculative `pendingLineFragment` projection with no
    // committed content. `closeCurrentBlock` consults this to retract such a
    // block if its line is reclassified into a different typed block.
    this.currentBlockEmitted = true;
  }

  /**
   * Builds metadata for the block currently being emitted.
   *
   * Critical for attribute-XML tags (`<decision>`, `<artifact>`, `<editor_*>`):
   * BlockRenderer reads `metadata.decision` / `metadata.artifactId` /
   * `metadata.rawXml` etc. and falls back to raw-markdown rendering when those
   * are missing — which is exactly the bug we're fixing (decision tags
   * appearing as plain text mid-stream because metadata was hard-coded to
   * `undefined` here previously).
   *
   * For simple XML tags we emit `{ isComplete, rawXml }` so consumers (loaders,
   * inline-edit flows) can both gate on completion and round-trip the source.
   */
  private buildBlockMetadata(
    status: "streaming" | "complete",
    emittedContent: string,
  ): Record<string, unknown> | undefined {
    if (this.subState.kind !== "xml_tag") return undefined;

    const { tagName, attributes, isAttrXml } = this.subState;
    const isComplete = status === "complete";
    // For streaming emits we use the visible content (which includes the
    // pending line fragment), so partial `<option>` text is reflected in
    // rawXml the moment it arrives.
    const rawXml = emittedContent;

    if (tagName === "decision") {
      const decisionId = this.currentBlockId;
      const prompt = attributes.prompt || "Make a selection";
      const options = parseDecisionOptions(rawXml, decisionId);
      const decision: DecisionData = { id: decisionId, prompt, options };
      return { isComplete, decision, rawXml };
    }

    if (tagName === "artifact") {
      const artifactId =
        attributes.id || `artifact-client-${this.currentBlockIndex}`;
      // Mirror content-splitter-v2: numeric suffix after `_` if present,
      // otherwise the running block index.
      const artifactIndex = artifactId.includes("_")
        ? parseInt(artifactId.split("_").pop() || "0", 10) ||
          this.currentBlockIndex
        : this.currentBlockIndex;
      return {
        isComplete,
        artifactId,
        artifactIndex,
        artifactType: attributes.type || "text",
        artifactTitle: attributes.title || "",
        rawXml,
      };
    }

    if (tagName === "editor_error" || tagName === "editor_code_snippet") {
      return {
        isComplete,
        ...attributes,
        rawXml,
      };
    }

    if (isAttrXml) {
      // Future attribute-XML types — pass attributes through verbatim.
      return { isComplete, ...attributes, rawXml };
    }

    // Simple XML — minimal metadata so loaders / consumers can still gate.
    return { isComplete, rawXml };
  }

  private buildBlockData(): Record<string, unknown> | null {
    // Audio blocks carry the resolved link so the renderer has a `src`.
    if (this.currentBlockType === "audio" && this.pendingMediaData) {
      return { ...this.pendingMediaData };
    }
    if (this.subState.kind === "code_fence") {
      // Only emit language data for plain code blocks. When the type has been
      // upgraded to a JSON sub-type (diagram, quiz, etc.), `data` must be null
      // so BlockRenderer takes the content-parse path, not the serverData path.
      if (this.currentBlockType !== "code") return null;
      return this.subState.language
        ? { language: this.subState.language }
        : null;
    }
    if (this.subState.kind === "bare_json") {
      // Same rule: only include language metadata for untyped code blocks.
      if (this.currentBlockType !== "code") return null;
      return { language: "json" };
    }
    return null;
  }
}
