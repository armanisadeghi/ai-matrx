"use client";

/**
 * `google_workspace_result` — the ONE component for the `google_workspace` tool.
 *
 * THE READER'S QUESTION: *what did this touch of mine, and did it actually
 * change anything?*
 *
 * Fifteen actions share one kind (Docs, Sheets, Slides, the prepared-but-never-sent
 * email, and the read/import halves of Calendar, Contacts and Tasks). They are
 * NOT fifteen renderers: every branch below keys on the SHAPE that arrived —
 * `would_append` / `would_write` / `would_create` for a preview, `text` for a
 * document window, `rows` for a sheet range, `resources` / `events` / `contacts`
 * / `task_lists` for a read, `needs_client` for the one step only the browser can
 * take — because the action name is a label, while the shape is the contract.
 *
 * 🚨 A PREVIEW IS NOT A RECEIPT. `dry_run: true` (and the organization's
 * approval hold, `awaiting_approval`) mean NOTHING WAS WRITTEN, and that
 * sentence leads the block, above the change it describes. An append shows the
 * exact block and where it lands; a range write shows the cells now and the
 * cells that would replace them, side by side, because a range write destroys
 * whatever is in the range.
 *
 * 🚨 A REFUSAL OR A HALF-DONE STEP IS A SENTENCE WITH ITS REMEDY. `needs_client`
 * is the tool telling the truth that a Table is minted in the app and not on the
 * server; it renders as what to do next, never as a failure and never as a
 * silent nothing.
 *
 * Record ids are DOORS (`RecordDoor`, the one open path): a named calendar
 * event, the Person an import landed on, each imported task. Google's own copy
 * gets its own link — a `web_view_link` is where the person edits the file, and
 * it is never a substitute for the Record.
 *
 * See `google-result-shared.tsx` for the route contract and the wrapper law.
 */

import React from "react";
import {
  CalendarDays,
  CheckCircle2,
  Contact,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  ListChecks,
  Mail,
  Presentation,
  Table2,
  UserPlus,
  Wrench,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ResultValue } from "@/features/tool-call-visualization/result-fields/ResultValue";
import { humanizeKey } from "@/features/tool-call-visualization/result-fields/shape";
import {
  ChipRow,
  CopyValueButton,
  CountChip,
  LeftoverFields,
  MetaStrip,
  RawRegion,
  Section,
  StateChip,
  StillArriving,
  isRecord,
  readBool,
  readKindValue,
  readNumber,
  readText,
  type ResultKindBlockProps,
} from "../result-kinds/result-kind-shared";
import {
  BodyRegion,
  Bounds,
  NothingWasWritten,
  OpenInGoogle,
  RecordDoor,
  RecordSyncState,
  ServerSentence,
  TruncationChip,
  UnmodelledPreviews,
  WRITE_CLAIM_KEYS,
  readBlock,
  readRows,
  readWhen,
  readWriteClaim,
} from "./google-result-shared";

/**
 * Keys the branches below promote themselves, and never repeat in the strip.
 *
 * 🚨 `WRITE_CLAIM_KEYS` replaces the hand-listed `dry_run`, `awaiting_approval`,
 * `approval`, `appended`, `written`, `created`, `imported`, `sent` — the same
 * family `readWriteClaim`/`NothingWasWritten` consumes, now ONE source shared
 * with `GoogleMarketingResultBlock` so the list and the reader can never drift
 * (F-95). `would_append` / `would_write` / `would_create` stay hand-listed:
 * they are this tool's own fixed, known `would_*` names, each already rendered
 * in full by a dedicated preview section below (`AppendPreview` etc.) — a
 * different reason to omit than the write-claim summary. The render call sites
 * also merge `claim.previewKeys` into `omit`, so an unmodelled `would_*` name
 * this list has not caught up to still gets suppressed rather than doubled.
 */
export const PROMOTED = [
  ...WRITE_CLAIM_KEYS,
  "action",
  "google_account",
  "note",
  "limit_note",
  "bounds",
  "truncated",
  "would_append",
  "would_write",
  "would_create",
  "needs_client",
  "resources",
  "accounts",
  "count",
  "title",
  "name",
  "file_id",
  "kind",
  "open_in_google",
  "text",
  "total_chars",
  "showing_chars",
  "has_more",
  "next_start_char",
  "tab",
  "range",
  "rows",
  "row_count",
  "sheet_size",
  "next_range_a1",
  "fields",
  "header_row",
  "draft",
  "from_email",
  "next_step",
  "events",
  "window_start",
  "window_end",
  "contacts",
  "field_map",
  "person",
  "matched_by",
  "task_lists",
  "tasks",
  "imported_tasks",
  "already_imported",
  "skipped",
] as const;

/**
 * The `would_*` names THIS block already renders through a dedicated preview
 * section below (`AppendPreview`, `SheetWritePreview`/`GenericWritePreview`,
 * the "file that would be created" section) — passed to `UnmodelledPreviews`
 * so an unmodelled `would_*` (e.g. `would_delete`) still gets its own generic
 * preview instead of vanishing into `omit`.
 */
const DEDICATED_PREVIEW_KEYS = ["would_append", "would_write", "would_create"] as const;

/** The action's own icon — the fastest "which of my things is this" cue. */
function headIcon(action: string, value: Record<string, unknown>) {
  if (action.includes("presentation")) return Presentation;
  if (action.includes("sheet") && action.includes("import")) return Table2;
  if (action.includes("sheet")) return FileSpreadsheet;
  if (action.includes("document")) return FileText;
  if (action === "list_resources") return FolderOpen;
  if (action.includes("email")) return Mail;
  if (action.includes("calendar")) return CalendarDays;
  if (action.includes("contact")) return action.startsWith("import") ? UserPlus : Contact;
  if (action.includes("task")) return ListChecks;
  return value.created ? CheckCircle2 : Wrench;
}

/**
 * A timestamp for a person, or the tool's own text when it is not an instant.
 * `readWhen` is the platform's ONE formatter; nothing here formats a date twice.
 */
function whenText(value: unknown): string | null {
  return readWhen(value) ?? readText(value);
}

/** "append_document" → "Append document". The kind carries no display names. */
function actionLabel(action: string): string {
  return action ? humanizeKey(action) : "Google Workspace";
}

/** One preview row: a label and the value, as the tool stated it. */
const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-xs">
    <span className="text-muted-foreground">{label}</span>
    <span className="min-w-0 break-words font-medium text-foreground">{children}</span>
  </div>
);

/** append_document's preview: the exact block, and exactly where it lands. */
const AppendPreview: React.FC<{
  preview: Record<string, unknown>;
  title: string | null;
}> = ({ preview, title }) => {
  const text = readText(preview.text);
  const afterChar = readNumber(preview.after_char);
  const position = readText(preview.position)?.replace(/_/g, " ") ?? null;
  const endsWith = readText(preview.document_ends_with);
  const revision = readText(preview.revision_id);
  return (
    <Section
      label="This exact block will be appended"
      trailing={text ? <CopyValueButton text={text} what="block" /> : null}
    >
      <div className="space-y-1.5">
        <ChipRow>
          {position ? <StateChip label={position} /> : null}
          {afterChar !== null ? (
            <StateChip label={`after character ${afterChar.toLocaleString()}`} />
          ) : null}
          {title ? <StateChip label={`in ${title}`} /> : null}
          {revision ? (
            <StateChip label="pinned to the version shown" tone="good" />
          ) : (
            <StateChip label="no version pin — re-read before approving" tone="warn" />
          )}
        </ChipRow>
        {endsWith ? (
          <div className="space-y-0.5">
            <div className="text-xs text-muted-foreground">
              The document ends like this today
            </div>
            <BodyRegion max="max-h-32">{endsWith}</BodyRegion>
          </div>
        ) : null}
        {text ? <BodyRegion tone="added">{text}</BodyRegion> : null}
      </div>
    </Section>
  );
};

/**
 * write_sheet's preview: BOTH halves, because a range write replaces every cell
 * in the range. One column would let a reader approve a deletion they never saw.
 */
const SheetWritePreview: React.FC<{ preview: Record<string, unknown> }> = ({
  preview,
}) => {
  const range = readText(preview.range);
  const before = preview.cells_before;
  const after = preview.cells_after;
  const rowsBefore = readNumber(preview.rows_before);
  const rowsAfter = readNumber(preview.rows_after);
  const replaces = readBool(preview.replaces_existing_values);
  return (
    <Section label={range ? `These cells would change — ${range}` : "These cells would change"}>
      <div className="space-y-1.5">
        <ChipRow>
          {rowsBefore !== null ? <CountChip value={rowsBefore} label="rows there now" /> : null}
          {rowsAfter !== null ? (
            <CountChip value={rowsAfter} label="rows after" tone="accent" />
          ) : null}
          {replaces === true ? (
            <StateChip label="replaces values that are there" tone="warn" />
          ) : replaces === false ? (
            <StateChip label="the range is empty today" tone="neutral" />
          ) : null}
        </ChipRow>
        <div className="grid min-w-0 gap-2 md:grid-cols-2">
          <div className="min-w-0 space-y-0.5">
            <div className="text-xs text-muted-foreground">Before</div>
            <ResultValue value={before ?? []} density="full" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="text-xs text-success">After</div>
            <ResultValue value={after ?? []} density="full" />
          </div>
        </div>
      </div>
    </Section>
  );
};

/**
 * The remaining `would_write` shapes — a contact-import plan and a task-import
 * set. Both are "what would land", so they share the promise line, the counts
 * the tool itself computed, and the full plan through the value viewer.
 */
const GenericWritePreview: React.FC<{ preview: Record<string, unknown> }> = ({
  preview,
}) => {
  const promise = readText(preview.promise);
  const creates = readNumber(preview.creates);
  const alreadyHere = readNumber(preview.already_here);
  const writes = readNumber(preview.writes);
  const contactPoints = readNumber(preview.contact_points);
  const personName = readText(preview.person_name);
  const matchedBy = readText(preview.matched_by);
  const shown = new Set([
    "promise",
    "creates",
    "already_here",
    "writes",
    "contact_points",
    "person_name",
    "matched_by",
  ]);
  const rest = Object.fromEntries(
    Object.entries(preview).filter(([key]) => !shown.has(key)),
  );
  return (
    <Section label="What would land">
      <div className="space-y-1.5">
        <ChipRow>
          {writes !== null ? <CountChip value={writes} label="fields written" tone="accent" /> : null}
          {contactPoints !== null ? (
            <CountChip value={contactPoints} label="contact points added" />
          ) : null}
          {creates !== null ? <CountChip value={creates} label="created" tone="accent" /> : null}
          {alreadyHere !== null ? (
            <CountChip value={alreadyHere} label="already here" tone="good" />
          ) : null}
          {matchedBy ? <StateChip label={`matched by ${matchedBy}`} /> : null}
        </ChipRow>
        {personName ? (
          <Fact label="On the Person">
            {personName}
            <RecordDoor type="party" id={preview.person_id} name={personName} />
          </Fact>
        ) : null}
        <ServerSentence text={promise} />
        {Object.keys(rest).length > 0 ? (
          <ResultValue value={rest} density="full" />
        ) : null}
      </div>
    </Section>
  );
};

const GoogleWorkspaceResultBlock: React.FC<ResultKindBlockProps> = ({
  content,
  metadata,
  className,
}) => {
  const { value, recovered, streaming } = readKindValue(content, metadata);
  if (!recovered || !isRecord(value)) {
    return <RawRegion content={content} className={className} />;
  }

  const action = readText(value.action) ?? "";
  const title = readText(value.title) ?? readText(value.name);
  const account = readText(value.google_account);
  const approval = readBlock(value.approval);

  /**
   * 🚨 THE ONE READING of "did this actually change anything" — the truth table
   * in `google-result-shared.tsx`, never a flag read here. A `would_*` shape
   * ALWAYS leads with "nothing was written" even when no `dry_run` arrived, and
   * no completed-write chip below renders unless the claim allows it, so a green
   * receipt can never sit beside a preview (V-22, NEW-8).
   */
  const claim = readWriteClaim(value);
  /** Merged into `omit` at every render site below: see {@link WRITE_CLAIM_KEYS}. */
  const omitKeys = [...PROMOTED, ...claim.previewKeys];

  const wouldAppend = readBlock(value.would_append);
  const wouldWrite = readBlock(value.would_write);
  const wouldCreate = readBlock(value.would_create);
  const needsClient = readBlock(value.needs_client);
  const draft = readBlock(value.draft);
  const person = readBlock(value.person);

  const text = readText(value.text);
  const rows = Array.isArray(value.rows) ? value.rows : null;
  const resources = readRows(value.resources);
  const accounts = readRows(value.accounts);
  const events = readRows(value.events);
  const contacts = readRows(value.contacts);
  const fields = readRows(value.fields);
  const fieldMap = readRows(value.field_map);
  const taskLists = readRows(value.task_lists);
  const tasks = readRows(value.tasks);
  const importedTasks = readRows(value.imported_tasks);
  const skipped = readRows(value.skipped);

  const totalChars = readNumber(value.total_chars);
  const showing = readText(value.showing_chars);
  const hasMore = readBool(value.has_more) === true;
  const nextStartChar = readNumber(value.next_start_char);
  const nextRange = readText(value.next_range_a1);
  const sheetSize = readText(value.sheet_size);
  const tab = readText(value.tab);
  const range = readText(value.range);
  const count = readNumber(value.count);
  const rowCount = readNumber(value.row_count);

  const appended = readBool(value.appended) === true;
  const written = readBool(value.written) === true;
  const created = readBool(value.created) === true;
  const imported = readBool(value.imported) === true;
  const sent = readBool(value.sent);

  const HeadIcon = headIcon(action, value);

  return (
    <div className={cn("my-2 min-w-0 space-y-2.5", className)}>
      {streaming ? <StillArriving /> : null}

      {/* Headline: what was touched, then what happened to it. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        <HeadIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 break-words text-sm font-medium text-foreground">
          {title ?? actionLabel(action)}
        </span>
        {title ? (
          <span className="text-xs text-muted-foreground">{actionLabel(action)}</span>
        ) : null}
        <OpenInGoogle href={value.open_in_google} />
      </div>

      <ChipRow>
        {/* A RECEIPT ONLY WHEN THE CLAIM IS A RECEIPT. `sent === false` is a
            negation and is always honest, so it is never gated. */}
        {claim.showsReceiptChips && created ? (
          <StateChip label="created in the user's Drive" tone="good" />
        ) : null}
        {claim.showsReceiptChips && appended ? (
          <StateChip label="appended" tone="good" />
        ) : null}
        {claim.showsReceiptChips && written ? (
          <StateChip label="cells written" tone="good" />
        ) : null}
        {claim.showsReceiptChips && imported ? (
          <StateChip label="imported" tone="good" />
        ) : null}
        {sent === false ? <StateChip label="not sent" tone="warn" /> : null}
        {account ? <StateChip label={account} /> : null}
        {tab ? <StateChip label={`tab ${tab}`} /> : null}
        {range ? <StateChip label={range} /> : null}
        {sheetSize ? <StateChip label={sheetSize} /> : null}
        {count !== null ? <CountChip value={count} label="found" tone="accent" /> : null}
        {rowCount !== null && rows ? <CountChip value={rowCount} label="rows shown" /> : null}
        {showing && totalChars !== null ? (
          <StateChip
            label={`characters ${showing} of ${totalChars.toLocaleString()}`}
            tone={hasMore ? "warn" : "neutral"}
          />
        ) : null}
        {hasMore ? (
          <StateChip
            label={
              nextStartChar !== null
                ? `more to read — continue at character ${nextStartChar.toLocaleString()}`
                : nextRange
                  ? `more to read — continue at ${nextRange}`
                  : "more to read"
            }
            tone="warn"
          />
        ) : null}
      </ChipRow>

      <NothingWasWritten claim={claim} approval={approval} />

      {wouldAppend ? <AppendPreview preview={wouldAppend} title={title} /> : null}
      {wouldWrite && (wouldWrite.cells_before !== undefined || wouldWrite.cells_after !== undefined) ? (
        <SheetWritePreview preview={wouldWrite} />
      ) : wouldWrite ? (
        <GenericWritePreview preview={wouldWrite} />
      ) : null}
      {wouldCreate ? (
        <Section label="The file that would be created">
          <ResultValue value={wouldCreate} density="full" />
        </Section>
      ) : null}

      {/* Any `would_*` key this block does not have a dedicated preview for
          (e.g. `would_delete`) — never dropped, never doubled: see
          `UnmodelledPreviews` in `google-result-shared.tsx`. */}
      <UnmodelledPreviews value={value} claim={claim} rendered={DEDICATED_PREVIEW_KEYS} />

      {/* A step only the browser can take — stated with what to do, never as a
          failure the agent can retry. */}
      {needsClient ? (
        <Section label="One step happens in the app, not here">
          <div className="space-y-1.5 rounded-md border border-border bg-card p-2.5">
            <ServerSentence text={needsClient.do_this} />
            <ChipRow>
              {readNumber(needsClient.fields_ready) !== null ? (
                <CountChip
                  value={readNumber(needsClient.fields_ready) as number}
                  label="fields ready"
                  tone="accent"
                />
              ) : null}
              {readNumber(needsClient.rows_ready) !== null ? (
                <CountChip value={readNumber(needsClient.rows_ready) as number} label="rows ready" />
              ) : null}
              {readText(needsClient.reason) ? (
                <StateChip label={(readText(needsClient.reason) as string).replace(/_/g, " ")} />
              ) : null}
            </ChipRow>
          </div>
        </Section>
      ) : null}

      {/* A document or deck window. Prose, not code — but a bounded region, so a
          40,000-character read cannot own the whole conversation. */}
      {text ? (
        <Section
          label="What it says"
          trailing={<CopyValueButton text={text} what="text" />}
        >
          <BodyRegion>{text}</BodyRegion>
        </Section>
      ) : null}

      {rows ? (
        <Section label={range ? `Cells — ${range}` : "Cells"}>
          <ResultValue value={rows} density="full" />
        </Section>
      ) : null}

      {/* The email that was PREPARED. Never sent from here — the draft is shown
          whole so the person can read what they are about to send. */}
      {draft ? (
        <Section label="The message, ready for the person to send">
          <div className="space-y-1.5">
            <div className="space-y-0.5">
              <Fact label="To">{readText(draft.to) ?? "—"}</Fact>
              {Array.isArray(draft.cc) && draft.cc.length > 0 ? (
                <Fact label="Cc">{(draft.cc as unknown[]).join(", ")}</Fact>
              ) : null}
              <Fact label="From">{readText(value.from_email) ?? "—"}</Fact>
              <Fact label="Subject">{readText(draft.subject) ?? "—"}</Fact>
            </div>
            {readText(draft.body) ? <BodyRegion>{readText(draft.body)}</BodyRegion> : null}
            <ServerSentence text={value.next_step} tone="warn" />
          </div>
        </Section>
      ) : null}

      {/* The reachable files, each with what to call to read it. */}
      {resources ? (
        <Section label="Files AI Matrx can reach">
          <div className="divide-y divide-border rounded-md border border-border">
            {resources.map((resource, index) => (
              <div key={readText(resource.file_id) ?? index} className="min-w-0 px-2.5 py-1.5">
                <div className="flex min-w-0 flex-wrap items-center gap-x-1.5">
                  <span className="min-w-0 break-words text-xs font-medium text-foreground">
                    {readText(resource.name) ?? readText(resource.file_id) ?? "Untitled"}
                  </span>
                  {readText(resource.kind) ? (
                    <StateChip label={readText(resource.kind) as string} />
                  ) : null}
                  {readText(resource.google_account) ? (
                    <span className="text-xs text-muted-foreground">
                      {readText(resource.google_account)}
                    </span>
                  ) : null}
                  <OpenInGoogle href={resource.open_in_google} label="Open" />
                </div>
                <ServerSentence text={resource.read_with} />
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {accounts ? (
        <Section label="Connected Google accounts">
          <ResultValue value={accounts} density="full" />
        </Section>
      ) : null}

      {/* The agenda. Each event that IS an AI Matrx record gets its door — the
          server's own note says to act on that row, not the Google id. */}
      {events ? (
        <Section
          label={
            readText(value.window_start) && readText(value.window_end)
              ? `Coming up — ${whenText(value.window_start)} to ${whenText(value.window_end)}`
              : "Coming up"
          }
        >
          <div className="divide-y divide-border rounded-md border border-border">
            {events.map((event, index) => {
              const name = readText(event.title) ?? "Untitled event";
              // A machine instant is formatted for a person through the ONE
              // formatter; anything that is not an instant prints as the tool
              // said it (V-22, NEW-14).
              const when = whenText(event.starts_at);
              return (
                <div
                  key={readText(event.record_id) ?? readText(event.event_id) ?? index}
                  className="flex min-w-0 flex-wrap items-center gap-x-1.5 px-2.5 py-1.5"
                >
                  <span className="min-w-0 break-words text-xs font-medium text-foreground">
                    {name}
                  </span>
                  {when ? (
                    <span className="text-xs tabular-nums text-muted-foreground">{when}</span>
                  ) : null}
                  {readBool(event.all_day) === true ? <StateChip label="all day" /> : null}
                  {readText(event.location) ? (
                    <span className="min-w-0 break-words text-xs text-muted-foreground">
                      {readText(event.location)}
                    </span>
                  ) : null}
                  <RecordSyncState
                    status={event.record_sync_status}
                    reason={event.record_sync_status_reason}
                  />
                  <OpenInGoogle href={event.html_url} label="In Google" />
                  {/* 🚨 The TYPE comes from the server's own `record_table`
                      (F-93, V-22 NEW-9); `calendar_event` is only the answer for
                      an older payload that carries no stamp. */}
                  <RecordDoor
                    type="calendar_event"
                    recordTable={event.record_table}
                    id={event.record_id}
                    name={name}
                    fallbackLabel="event"
                  />
                </div>
              );
            })}
          </div>
        </Section>
      ) : null}

      {contacts ? (
        <Section label={imported || fieldMap ? "The contact" : "Contacts"}>
          <ResultValue value={contacts} density="full" />
        </Section>
      ) : null}

      {/* import_contact: where every value LANDS, field by field. */}
      {fieldMap ? (
        <Section label="Where each value lands">
          <ResultValue value={fieldMap} density="full" />
        </Section>
      ) : null}

      {person ? (
        <Section label="The Person">
          <div className="space-y-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5">
              <span className="min-w-0 break-words text-xs font-medium text-foreground">
                {readText(person.name) ?? "Person"}
              </span>
              {readBool(person.created) === true ? (
                <StateChip label="new Person" tone="good" />
              ) : readBool(person.created) === false ? (
                <StateChip label="existing Person" />
              ) : null}
              {readText(value.matched_by) ? (
                <StateChip label={`matched by ${readText(value.matched_by)}`} />
              ) : null}
              <RecordDoor
                type="party"
                id={person.person_id}
                name={readText(person.name)}
                fallbackLabel="Person"
              />
            </div>
            <ResultValue
              value={Object.fromEntries(
                Object.entries(person).filter(
                  ([key]) => !["person_id", "name", "created"].includes(key),
                ),
              )}
              density="full"
            />
          </div>
        </Section>
      ) : null}

      {/* import_sheet_as_table: one field per header column, with the letter it
          came from — the whole point of the dry run. */}
      {fields ? (
        <Section
          label={
            readNumber(value.header_row) !== null
              ? `Fields from row ${readNumber(value.header_row)}`
              : "Fields"
          }
        >
          <ResultValue value={fields} density="full" />
        </Section>
      ) : null}

      {taskLists ? (
        <Section label="Task lists">
          <ResultValue value={taskLists} density="full" />
        </Section>
      ) : null}

      {tasks && !importedTasks ? (
        <Section label="Tasks">
          <ResultValue value={tasks} density="full" />
        </Section>
      ) : null}

      {/* What actually landed — each new task openable where it now lives. */}
      {importedTasks ? (
        <Section label="Imported">
          <div className="divide-y divide-border rounded-md border border-border">
            {importedTasks.map((task, index) => {
              const name = readText(task.title) ?? "Task";
              return (
                <div
                  key={readText(task.matrx_task_id) ?? index}
                  className="flex min-w-0 flex-wrap items-center gap-x-1.5 px-2.5 py-1.5"
                >
                  <span className="min-w-0 break-words text-xs font-medium text-foreground">
                    {name}
                  </span>
                  <RecordDoor
                    type="task"
                    id={task.matrx_task_id}
                    name={name}
                    fallbackLabel="task"
                  />
                </div>
              );
            })}
          </div>
        </Section>
      ) : null}

      {skipped ? (
        <Section label="Skipped — already here">
          <ResultValue value={skipped} density="full" />
        </Section>
      ) : null}

      {/* The honesty fields, last and never dropped. */}
      <Bounds bounds={value.bounds} />
      {value.truncated !== undefined ? (
        <ChipRow>
          <TruncationChip truncated={value.truncated} />
        </ChipRow>
      ) : null}
      <ServerSentence text={value.note} />
      <ServerSentence text={value.limit_note} />

      <MetaStrip value={value} omit={omitKeys} />
      <LeftoverFields value={value} omit={omitKeys} />
    </div>
  );
};

export default GoogleWorkspaceResultBlock;
