/**
 * THE STORED RICH-TEXT CORPUS — every row of every store the rich-content
 * gates prove themselves against (rich-content PLAN decision 6). One reader, so
 * the tokenizer gate (`check-source-roundtrip-corpus.ts`) and the editor gate
 * (`check-rich-editor-roundtrip-corpus.ts`) always judge the same rows.
 *
 * Sources (all rows, soft-deleted included; callers set the session READ ONLY
 * before the first query):
 *   workbench.notes.content · chat.message.content text parts · agent.definition.messages text
 *   parts · agent.template.messages text parts · agent.message_template.content ·
 *   skill.definition.body
 *
 * PRIVACY: row ids only ever leave this module as identities — a chat part is
 * `<message id>#<part index>`, an agent message `<agent id>#<message>.<part>`.
 */
import type pg from "pg";

export type CorpusSourceName =
  | "notes"
  | "chat"
  | "agent_messages"
  | "template_messages"
  | "message_templates"
  | "skills";

export const CORPUS_SOURCES: readonly CorpusSourceName[] = [
  "notes",
  "chat",
  "agent_messages",
  "template_messages",
  "message_templates",
  "skills",
];

export interface CorpusRow {
  id: string;
  text: string;
}

const PAGE = 500;
const SKIP = "\u0000skip";

function textPartsOf(content: unknown): string[] {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  const out: string[] = [];
  for (const part of content) {
    if (
      part &&
      typeof part === "object" &&
      (part as { type?: unknown }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string"
    ) {
      out.push((part as { text: string }).text);
    } else {
      out.push(SKIP);
    }
  }
  return out;
}

function messageRows(id: string, messages: unknown): CorpusRow[] {
  if (!Array.isArray(messages)) return [];
  const out: CorpusRow[] = [];
  messages.forEach((message, messageIndex) => {
    const content = (message as { content?: unknown } | null)?.content;
    textPartsOf(content).forEach((text, partIndex) => {
      if (text !== SKIP) out.push({ id: `${id}#${messageIndex}.${partIndex}`, text });
    });
  });
  return out;
}

/** Keyset pages over one table; yields rows of stored text with their public identity. */
export async function* readCorpusSource(
  cx: pg.Client,
  source: CorpusSourceName,
): AsyncGenerator<CorpusRow> {
  const plans: Record<
    CorpusSourceName,
    { sql: string; expand: (r: Record<string, unknown>) => CorpusRow[] }
  > = {
    notes: {
      sql: `select id::text as id, content from workbench.notes where content is not null and id > $1::uuid order by id limit ${PAGE}`,
      expand: (r) => [{ id: String(r.id), text: String(r.content) }],
    },
    message_templates: {
      sql: `select id::text as id, content from agent.message_template where content is not null and id > $1::uuid order by id limit ${PAGE}`,
      expand: (r) => [{ id: String(r.id), text: String(r.content) }],
    },
    skills: {
      sql: `select id::text as id, body as content from skill.definition where body is not null and id > $1::uuid order by id limit ${PAGE}`,
      expand: (r) => [{ id: String(r.id), text: String(r.content) }],
    },
    chat: {
      sql: `select id::text as id, content from chat.message where id > $1::uuid order by id limit ${PAGE}`,
      expand: (r) =>
        textPartsOf(r.content)
          .map((text, index) => ({ id: `${String(r.id)}#${index}`, text }))
          .filter((row) => row.text !== SKIP),
    },
    agent_messages: {
      sql: `select id::text as id, messages as content from agent.definition where id > $1::uuid order by id limit ${PAGE}`,
      expand: (r) => messageRows(String(r.id), r.content),
    },
    template_messages: {
      sql: `select id::text as id, messages as content from agent.template where id > $1::uuid order by id limit ${PAGE}`,
      expand: (r) => messageRows(String(r.id), r.content),
    },
  };
  const plan = plans[source];
  let after = "00000000-0000-0000-0000-000000000000";
  for (;;) {
    const { rows } = await cx.query<Record<string, unknown>>(plan.sql, [after]);
    if (rows.length === 0) return;
    for (const row of rows) for (const expanded of plan.expand(row)) yield expanded;
    after = String(rows[rows.length - 1]?.id);
    if (rows.length < PAGE) return;
  }
}
