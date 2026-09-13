#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const scratch = join(root, "../common-docs/projects/no-db-assigned-org/census/notes-2a-mutation-probes");
rmSync(scratch, { recursive: true, force: true });
mkdirSync(scratch, { recursive: true });

const probes = [
  ["prepared-full-body", "features/rich-document/actions/handlers/edit.ts", "content: prepared.content", "content: ctx.content"],
  ["missing-org", "features/rich-document/actions/sources/note.ts", "expectedOrganizationId: source.editBase.organizationId", "expectedOrganizationId: undefined"],
  ["missing-base", "features/rich-document/actions/sources/note.ts", "expectedVersion: source.editBase.version", "expectedVersion: undefined"],
  ["void-receipt", "features/rich-document/actions/handlers/preparedEdit.ts", "The note save did not return an acknowledgement receipt.", "return source;"],
  ["typed-receipt-loss", "features/rich-document/actions/handlers/preparedEdit.ts", "advanceAcknowledgedErrorSource(source, error, newContent)", "advancePreparedNoteSource(source, error.receipt, newContent)"],
  ["save-time-refetch", "features/rich-document/actions/sources/note.ts", "return persistNoteUpdate(source.noteId", "const note = await fetchNoteById(source.noteId);\n    return persistNoteUpdate(source.noteId"],
  ["zero-revision", "features/notes/service/notesService.ts", "options.expectedVersion < 0", "options.expectedVersion < 1"],
];

const hash = (text) => createHash("sha256").update(text).digest("hex");
const failures = [];
for (const [name, relativeFile, required, mutant] of probes) {
  const original = readFileSync(join(root, relativeFile), "utf8");
  if (!original.includes(required)) {
    failures.push(`${name}: current invariant anchor missing`);
    continue;
  }
  const mutated = original.replace(required, mutant);
  if (mutated === original) {
    failures.push(`${name}: mutation could not be isolated`);
    continue;
  }
  const output = join(scratch, `${name}-${relativeFile.replaceAll("/", "__")}`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, original);
  const before = hash(readFileSync(output, "utf8"));
  writeFileSync(output, mutated);
  const mutantHash = hash(readFileSync(output, "utf8"));
  writeFileSync(output, original);
  const restored = hash(readFileSync(output, "utf8"));
  if (before !== restored || before === mutantHash) failures.push(`${name}: isolated copy restoration hash failed`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`isolated Notes 2A mutation copies restored (${probes.length} probes) at ${scratch}`);
