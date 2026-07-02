/**
 * lib/chat-protocol/from-db.ts
 *
 * Converts CxMessage[] (from Supabase / API) into CanonicalMessage[].
 *
 * DESIGN PRINCIPLES
 * ─────────────────
 * • Zero platform deps — pure TypeScript, no JSX, no React.
 * • Single source of truth — all DB-to-canonical logic lives here.
 * • Handles both V1 (tool_result-role messages) and V2 (empty tool-role,
 *   output in cx_tool_call) schema shapes.
 * • Thinking, media, text, tool_call, tool_result blocks all handled.
 * • Immutable output — every returned object is readonly.
 *
 * V1  — tool results embedded as tool_result blocks in role="tool" messages
 * V2  — role="tool" messages are empty; output lives in cx_tool_call.output
 *
 * Both shapes are supported simultaneously so old conversations still render.
 */

import type {
    CxMessage,
    CxToolCall,
    CxContentBlock,
    CxTextContent,
    CxThinkingContent,
    CxMediaContent,
} from '@/features/public-chat/types/cx-tables';

import type {
    CanonicalMessage,
    CanonicalBlock,
    TextBlock,
    ThinkingBlock,
    MediaBlock,
    ToolCallBlock,
    ToolInput,
    ToolOutput,
    MessageRole,
} from './types';

import { PROTOCOL_VERSION } from './types';
import { isJsonObject } from '@/types/json';

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Read a legacy/undeclared string field off an object without casting the
 * whole value — used for pre-migration field names that never made it into
 * the current CxContentBlock union (e.g. `tool_call_id` / `tool_use_id`).
 */
function readLegacyStringField(value: object, key: string): unknown {
    return (value as Record<string, unknown>)[key];
}

/**
 * Coerce an arbitrary DB value into a Record<string, unknown>.
 *
 * The DB stores arguments as JSON objects (already parsed by Supabase),
 * but legacy rows may have stringified JSON or null — handle them all.
 */
function toRecord(value: unknown): Record<string, unknown> {
    if (value === null || value === undefined) return {};
    if (typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
                ? parsed as Record<string, unknown>
                : { value: parsed };
        } catch {
            return { raw: value };
        }
    }
    return { value };
}

/**
 * Build a ToolOutput from a CxToolCall record.
 * Parses output_type='json' strings; passes through other values unchanged.
 */
function buildToolOutput(tc: CxToolCall): ToolOutput {
    let result: unknown = tc.output;
    if (tc.output_type === 'json' && typeof tc.output === 'string') {
        try { result = JSON.parse(tc.output); } catch { /* keep as string */ }
    }
    return { status: 'success', result };
}

// ============================================================================
// SINGLE-BLOCK CONVERTERS
// ============================================================================

function convertTextContent(block: CxTextContent): TextBlock | null {
    return block.text ? { type: 'text', content: block.text } : null;
}

function convertThinkingContent(block: CxThinkingContent): ThinkingBlock {
    let content = block.text;
    if (!content && block.summary?.length) {
        // summary items are objects with a .text field from Python
        content = block.summary
            .map(item => (typeof item === 'string' ? item : item.text))
            .filter(Boolean)
            .join('\n');
    }
    return { type: 'thinking', content: content || 'Thinking…' };
}

function convertMediaContent(block: CxMediaContent): MediaBlock | null {
    // Use url OR fall back to file_uri (Google Gemini File API)
    const url = block.url ?? block.file_uri ?? null;
    if (!url) return null;
    return {
        type: 'media',
        kind: block.kind as MediaBlock['kind'], // youtube support added via cast
        url,
        ...(block.file_uri ? { fileUri: block.file_uri } : {}),
        ...(block.mime_type ? { mimeType: block.mime_type } : {}),
    };
}

// ============================================================================
// CONTENT-BLOCK ARRAY → CANONICAL BLOCKS
// ============================================================================

/**
 * Convert a single message's CxContentBlock[] into an ordered array of
 * CanonicalBlocks.
 *
 * tool_call blocks produce ToolCallBlocks with input only — outputs are
 * patched in after this step via the callId lookup maps.
 */
function convertContentBlocks(
    content: CxContentBlock[] | unknown,
    callIdOutputMap: Map<string, ToolOutput>,
    callIdErrorMap: Map<string, string>,
): CanonicalBlock[] {
    if (!Array.isArray(content)) {
        // Legacy: content stored as a plain string
        if (typeof content === 'string' && content) {
            return [{ type: 'text', content }];
        }
        return [];
    }

    const blocks: CanonicalBlock[] = [];

    for (const raw of content) {
        if (!raw || typeof raw !== 'object' || !('type' in raw)) continue;
        const block = raw as CxContentBlock;

        switch (block.type) {
            case 'text': {
                const b = convertTextContent(block as CxTextContent);
                if (b) blocks.push(b);
                break;
            }

            case 'thinking': {
                blocks.push(convertThinkingContent(block as CxThinkingContent));
                break;
            }

            case 'media': {
                const b = convertMediaContent(block as CxMediaContent);
                if (b) blocks.push(b);
                break;
            }

            case 'tool_call': {
                // DB stores: { type, id (or tool_call_id), name, arguments }.
                // `tool_call_id`/`tool_use_id` are pre-migration legacy field
                // names not on CxToolCallContent — read those two defensively
                // via readLegacyStringField rather than casting the whole block.
                // call_id (OpenAI) takes priority; fall back to id (Anthropic/Google) or tool_use_id (legacy)
                const callId   = String(
                    block.call_id ??
                    block.id ??
                    readLegacyStringField(block, 'tool_call_id') ??
                    readLegacyStringField(block, 'tool_use_id') ??
                    ''
                );
                const toolName = String(block.name);
                const args     = toRecord(block.arguments);

                const input: ToolInput = { name: toolName, arguments: args };
                const output  = callIdOutputMap.get(callId);
                const errMsg  = callIdErrorMap.get(callId);

                const toolBlock: ToolCallBlock = {
                    type: 'tool_call',
                    callId,
                    toolName,
                    input,
                    ...(output ? { output }                    : {}),
                    ...(errMsg ? { error: { message: errMsg } } : {}),
                    progress: [],   // progress events are not persisted in the DB
                    phase: output ? 'complete'
                         : errMsg ? 'error'
                         :           'complete',  // no result recorded yet — still done
                };
                blocks.push(toolBlock);
                break;
            }

            case 'tool_result': {
                // V1 legacy — tool_result blocks embedded in role="tool" messages.
                // Normally handled by extractResultsFromToolRoleContent below.
                // Encountering them inside an assistant message body is unusual
                // but safe — extract the error case and emit an error block.
                const isError   = Boolean(block.is_error);
                const resultRaw = block.content;

                if (isError) {
                    blocks.push({
                        type: 'error',
                        errorType: 'tool_result',
                        message: typeof resultRaw === 'string' ? resultRaw : JSON.stringify(resultRaw),
                    });
                }
                // Non-error orphan result — nothing renderable here
                break;
            }

            case 'code_exec': {
                // Render code blocks as text for now
                blocks.push({ type: 'text', content: `\`\`\`${block.language}\n${block.code}\n\`\`\`` });
                break;
            }

            case 'code_result': {
                if (block.output) {
                    blocks.push({ type: 'text', content: `\`\`\`\n${block.output}\n\`\`\`` });
                }
                break;
            }

            case 'web_search': {
                // Web search is informational — gracefully skip rendering a visual block
                // since the system will use tool_call blocks for the actual queries.
                break;
            }

            default: {
                // Unknown block type (not in CxContentBlock — malformed or a
                // future wire shape) — salvage any text field if present.
                if (isJsonObject(raw) && typeof raw.text === 'string' && raw.text) {
                    blocks.push({ type: 'text', content: raw.text });
                }
            }
        }
    }

    return blocks;
}

// ============================================================================
// V1 TOOL-ROLE MESSAGE MERGER
// ============================================================================

/**
 * Extract tool results from a V1 tool-role message (content contains tool_result blocks)
 * and return them as { callId → ToolOutput } and { callId → errorMessage } maps.
 *
 * These are then merged onto the preceding assistant message's ToolCallBlocks.
 */
function extractResultsFromToolRoleContent(
    content: CxContentBlock[] | unknown,
): { outputs: Map<string, ToolOutput>; errors: Map<string, string> } {
    const outputs = new Map<string, ToolOutput>();
    const errors  = new Map<string, string>();

    if (!Array.isArray(content)) return { outputs, errors };

    for (const raw of content) {
        if (!raw || typeof raw !== 'object' || !('type' in raw)) continue;
        const block = raw as Record<string, unknown>;

        if (block.type === 'tool_result') {
            // MATRX-EXCEPTION: `?? ''` is the honest "no id recognized" default
            // for a map lookup key (checked via `if (!callId) continue` below),
            // not data written anywhere.
            const callId  = String(block.tool_call_id ?? block.tool_use_id ?? '');
            const isError = Boolean(block.is_error);
            const result  = block.content;

            if (!callId) continue;

            if (isError) {
                errors.set(callId, typeof result === 'string' ? result : JSON.stringify(result));
            } else {
                outputs.set(callId, {
                    status: 'success',
                    result: typeof result === 'object' ? result : result,
                });
            }
        }
    }

    return { outputs, errors };
}

// ============================================================================
// CxToolCall LOOKUP MAPS
// ============================================================================

/**
 * Build a callId → ToolOutput map from cx_tool_call records.
 * Only includes completed (non-error) tool calls.
 */
function buildOutputMap(toolCalls: CxToolCall[]): Map<string, ToolOutput> {
    const map = new Map<string, ToolOutput>();
    for (const tc of toolCalls) {
        if (!tc.is_error && tc.output != null) {
            map.set(tc.call_id, buildToolOutput(tc));
        }
    }
    return map;
}

/**
 * Build a callId → errorMessage map from cx_tool_call records.
 */
function buildErrorMap(toolCalls: CxToolCall[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const tc of toolCalls) {
        if (tc.is_error) {
            map.set(tc.call_id, tc.error_message ?? tc.output ?? 'Tool execution failed');
        }
    }
    return map;
}

// ============================================================================
// PATCH HELPER — fill in outputs onto blocks that were created before results arrived
// ============================================================================

/**
 * Patch ToolCallBlocks on an existing message with newly discovered outputs/errors.
 * Returns the updated blocks array (does not mutate the input).
 */
function patchToolBlocks(
    blocks: CanonicalBlock[],
    outputMap: Map<string, ToolOutput>,
    errorMap: Map<string, string>,
): CanonicalBlock[] {
    return blocks.map(block => {
        if (block.type !== 'tool_call') return block;

        const output = outputMap.get(block.callId);
        const errMsg = errorMap.get(block.callId);

        if (!output && !errMsg) return block;

        return {
            ...block,
            ...(output ? { output, phase: 'complete' as const } : {}),
            ...(errMsg ? { error: { message: errMsg }, phase: 'error' as const } : {}),
        } satisfies ToolCallBlock;
    });
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Convert an array of CxMessage rows from the database into an ordered array
 * of CanonicalMessages ready for rendering.
 *
 * Handles:
 *   • All content block types (text, thinking, media, tool_call, tool_result)
 *   • V2 schema: empty tool-role messages — results come from cx_tool_call records
 *   • V1 schema: tool_result blocks embedded in role="tool" messages
 *   • CxToolCall output enrichment via callId cross-reference
 *   • condensed / summary / deleted message filtering
 *   • Correct role mapping (tool-role messages are merged, not emitted separately)
 *
 * @param dbMessages  Messages ordered by position ascending (as returned by the API).
 * @param toolCalls   Optional cx_tool_call records for the conversation.
 *                    Provide these for V2 conversations so tool outputs are shown.
 */
export function buildCanonicalMessages(
    dbMessages: CxMessage[],
    toolCalls?: CxToolCall[],
): CanonicalMessage[] {
    // Build lookup maps from cx_tool_call records (V2 enrichment)
    const v2OutputMap = toolCalls ? buildOutputMap(toolCalls)  : new Map<string, ToolOutput>();
    const v2ErrorMap  = toolCalls ? buildErrorMap(toolCalls)   : new Map<string, string>();

    const result: CanonicalMessage[] = [];

    for (const msg of dbMessages) {
        // ── Skip non-renderable messages ────────────────────────────────────
        if (msg.status === 'summary' || msg.status === 'deleted') continue;

        const isCondensed = msg.status === 'condensed';

        // ── V1: tool-role messages — merge results onto the preceding assistant ──
        if (msg.role === 'tool') {
            const hasContent = Array.isArray(msg.content) && msg.content.length > 0;
            if (!hasContent) continue; // V2 empty placeholder — skip

            // V1: extract results from embedded tool_result blocks
            const { outputs, errors } = extractResultsFromToolRoleContent(msg.content);
            if (outputs.size === 0 && errors.size === 0) continue;

            // Patch the last assistant message
            for (let i = result.length - 1; i >= 0; i--) {
                if (result[i].role === 'assistant') {
                    // Need to update a readonly object — create new one
                    const existing = result[i];
                    result[i] = {
                        ...existing,
                        blocks: patchToolBlocks([...existing.blocks], outputs, errors),
                    };
                    break;
                }
            }
            continue;
        }

        // ── Map message role ────────────────────────────────────────────────
        const role: MessageRole =
            msg.role === 'user'   ? 'user'
            : msg.role === 'system' ? 'system'
            :                         'assistant';

        // ── Convert content blocks ──────────────────────────────────────────
        // Pass V2 maps so tool_call blocks get their outputs immediately
        const blocks = convertContentBlocks(msg.content, v2OutputMap, v2ErrorMap);

        result.push({
            id: msg.id,
            role,
            timestamp: new Date(msg.created_at),
            status: 'complete',
            isCondensed,
            blocks,
            schemaVersion: PROTOCOL_VERSION,
        });
    }

    return result;
}

// ============================================================================
// SINGLE-MESSAGE CONVENIENCE
// ============================================================================

/**
 * Convert a single CxMessage into a CanonicalMessage.
 * Useful for incrementally loading new messages.
 */
export function buildCanonicalMessage(
    msg: CxMessage,
    toolCalls?: CxToolCall[],
): CanonicalMessage | null {
    const messages = buildCanonicalMessages([msg], toolCalls);
    return messages[0] ?? null;
}
