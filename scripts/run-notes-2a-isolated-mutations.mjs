import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";

const sourceRoot = process.cwd();
const artifactRoot = "/Users/armanisadeghi/.codex/artifacts/org-integrity/notes-2a-behavioral-mutations";
const runRoot = join(artifactRoot, `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${process.pid}`);
const tests = [
  "features/rich-document/actions/handlers/preparedActions.bridge.integration.test.tsx",
  "features/rich-document/actions/handlers/preparedEdit.test.ts",
  "features/notes/richDocumentSource.test.ts",
  "features/notes/usePreparedNoteContentSource.test.tsx",
  "features/notes/service/notesService.convergence.test.ts",
  "features/overlays/callbacks/fullScreenEditor.test.ts",
];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const writeManifest = (manifest) => writeFileSync(join(runRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
const git = spawnSync("/usr/bin/git", ["ls-files", "-z"], { cwd: sourceRoot, encoding: "buffer" });
if (git.status !== 0) throw new Error(git.stderr.toString());
mkdirSync(runRoot, { recursive: true });
const tracked = git.stdout.toString("utf8").split("\0").filter(Boolean);
const sourceHash = createHash("sha256");
for (const file of tracked) {
  const source = join(sourceRoot, file);
  const destination = join(runRoot, file);
  if (!existsSync(source)) continue;
  mkdirSync(dirname(destination), { recursive: true });
  if (lstatSync(source).isSymbolicLink()) {
    const target = resolve(dirname(source), readlinkSync(source));
    if (relative(sourceRoot, target).startsWith("..")) continue;
    symlinkSync(target.replace(sourceRoot, runRoot), destination);
  } else {
    copyFileSync(source, destination);
    sourceHash.update(file).update(readFileSync(source));
  }
}
for (const extra of ["features/notes/usePreparedNoteContentSource.ts", "features/notes/usePreparedNoteContentSource.test.tsx"]) {
  const source = join(sourceRoot, extra); const destination = join(runRoot, extra);
  mkdirSync(dirname(destination), { recursive: true }); copyFileSync(source, destination);
}
symlinkSync(join(sourceRoot, "node_modules"), join(runRoot, "node_modules"));
const sharedRequire = createRequire(join(sourceRoot, "package.json"));
const jestBin = sharedRequire.resolve("jest/bin/jest");
const manifest = { sourceRoot, runRoot, trackedHash: sourceHash.digest("hex"), tests, jestBin, baseline: null, mutations: [] };
const run = (label, testNamePattern) => {
  const outputFile = join(runRoot, `${label}.jest.json`);
  const result = spawnSync(process.execPath, [
    jestBin, "--config", join(runRoot, "jest.config.ts"), "--rootDir", runRoot,
    "--runInBand", "--runTestsByPath", ...tests.map((file) => join(runRoot, file)),
    ...(testNamePattern ? ["--testNamePattern", testNamePattern] : []),
    "--json", "--outputFile", outputFile,
  ], { cwd: runRoot, encoding: "utf8", env: process.env });
  let jest = null;
  let jsonError = null;
  try { jest = JSON.parse(readFileSync(outputFile, "utf8")); } catch (error) { jsonError = error instanceof Error ? error.message : String(error); }
  const record = {
    label, testNamePattern: testNamePattern ?? null, status: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr,
    outputFile, jest, jsonError,
  };
  writeFileSync(join(runRoot, `${label}.run.json`), JSON.stringify(record, null, 2));
  return record;
};
const failedAssertions = (record) => (record.jest?.testResults ?? []).flatMap((suite) =>
  (suite.assertionResults ?? []).filter((result) => result.status === "failed").map((result) => ({
    fullName: result.fullName, title: result.title, failureMessages: result.failureMessages ?? [],
  })),
);
const isCleanGreen = (record) => record.status === 0 && record.signal === null && record.jsonError === null && record.jest?.numFailedTests === 0 && record.jest?.numRuntimeErrorTestSuites === 0;
const isIntendedRed = (record, mutation) => {
  if (record.status === null || record.signal !== null || record.jsonError !== null || !record.jest) return false;
  if (record.jest.numFailedTests < 1 || record.jest.numRuntimeErrorTestSuites !== 0) return false;
  const requirements = mutation.requiredFailures ?? [{ testName: mutation.testName, assertion: mutation.assertion }];
  return requirements.every((requirement) => failedAssertions(record).some((failure) => failure.fullName.includes(requirement.testName) && failure.failureMessages.join("\n").includes(requirement.assertion)));
};
manifest.baseline = run("baseline");
writeManifest(manifest);
const mutations = [
  { name: "prepared-full-body", file: "features/rich-document/actions/handlers/edit.ts", from: "content: prepared.content", to: "content: ctx.content", testName: "prepares identity source before edit overlay", assertion: "authoritative full body" },
  { name: "missing-org", file: "features/rich-document/actions/sources/note.ts", from: "expectedOrganizationId: source.editBase.organizationId", to: "expectedOrganizationId: undefined", testName: "refuses a moved note", assertion: "Expected pattern: /different organization/i" },
  { name: "missing-base", file: "features/rich-document/actions/sources/note.ts", from: "expectedVersion: source.editBase.version", to: "expectedVersion: undefined", testName: "uses a dirty captured base", assertion: "version" },
  { name: "void-receipt", file: "features/rich-document/actions/sources/note.ts", from: "return persistNoteUpdate(source.noteId, { content: newContent }, {", to: "await persistNoteUpdate(source.noteId, { content: newContent }, {", testName: "prepares identity source before edit overlay", assertion: "acknowledgement receipt" },
  { name: "typed-receipt-loss", file: "features/rich-document/actions/handlers/preparedEdit.ts", from: "return advanceAcknowledgedErrorSource(source, error, submittedContent);", to: "return source;", testName: "keeps a returned saved physical partial receipt", testPattern: "keeps a returned saved physical partial receipt|retains an acknowledged base after an actor changes", assertion: "version", requiredFailures: [{ testName: "keeps a returned saved physical partial receipt", assertion: "version" }, { testName: "retains an acknowledged base after an actor changes", assertion: "version" }] },
  { name: "save-time-refetch", file: "features/rich-document/actions/sources/note.ts", from: "const { persistNoteUpdate } = await import(\"@/features/notes/service/notesService\");\n    return persistNoteUpdate(source.noteId, { content: newContent }, {\n      expectedVersion: source.editBase.version,\n      expectedOrganizationId: source.editBase.organizationId,", to: "const { fetchNoteById, persistNoteUpdate } = await import(\"@/features/notes/service/notesService\");\n    const fetched = await fetchNoteById(source.noteId);\n    return persistNoteUpdate(source.noteId, { content: newContent }, {\n      expectedVersion: fetched?.version ?? source.editBase.version,\n      expectedOrganizationId: fetched?.organization_id ?? source.editBase.organizationId,", testName: "keeps a stale dirty base", assertion: "Received promise resolved instead of rejected" },
  { name: "zero-revision", file: "features/notes/service/notesService.ts", from: "options.expectedVersion < 0", to: "options.expectedVersion < 1", testName: "accepts an authoritative stored revision zero", assertion: "note revision must be a nonnegative safe integer" },
  { name: "returned-partial", file: "features/rich-document/actions/handlers/preparedEdit.ts", from: "if (receipt.failedFields.length > 0)", to: "if (false && receipt.failedFields.length > 0)", testName: "keeps a returned saved physical partial receipt", assertion: "rejects" },
  { name: "snapshot-sequence", file: "features/notes/usePreparedNoteContentSource.ts", from: "sequence += 1", to: "sequence += 0", testName: "keeps an identical render stable", assertion: "not.toBe" },
];
if (isCleanGreen(manifest.baseline)) {
  for (const mutation of mutations) {
    const file = join(runRoot, mutation.file);
    const original = readFileSync(file, "utf8");
    if (!original.includes(mutation.from)) throw new Error(`${mutation.name}: anchor missing`);
    const originalHash = sha256(original);
    let red;
    try {
      writeFileSync(file, original.replace(mutation.from, mutation.to));
      red = run(`${mutation.name}-red`, mutation.testPattern ?? mutation.testName);
    } finally {
      writeFileSync(file, original);
    }
    const green = run(`${mutation.name}-green`, mutation.testPattern ?? mutation.testName);
    const restoredHash = sha256(readFileSync(file));
    const result = {
      name: mutation.name, testName: mutation.testName, testPattern: mutation.testPattern ?? mutation.testName, expectedAssertion: mutation.assertion, requiredFailures: mutation.requiredFailures ?? null,
      redStatus: red?.status ?? null, redSignal: red?.signal ?? null,
      redFailedAssertions: red ? failedAssertions(red) : [], redRuntimeErrorTestSuites: red?.jest?.numRuntimeErrorTestSuites ?? null,
      intendedRed: red ? isIntendedRed(red, mutation) : false,
      greenStatus: green.status, greenSignal: green.signal, cleanGreen: isCleanGreen(green),
      originalHash, restoredHash, restored: originalHash === restoredHash,
    };
    manifest.mutations.push(result);
    writeManifest(manifest);
  }
}
writeManifest(manifest);
const success = isCleanGreen(manifest.baseline) && manifest.mutations.length === mutations.length && manifest.mutations.every((mutation) => mutation.intendedRed && mutation.cleanGreen && mutation.restored);
console.log(JSON.stringify({ runRoot, baseline: isCleanGreen(manifest.baseline), success, mutations: manifest.mutations.map(({ name, intendedRed, cleanGreen, restored }) => ({ name, intendedRed, cleanGreen, restored })) }));
process.exitCode = success ? 0 : 1;
