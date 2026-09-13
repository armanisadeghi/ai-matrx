import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";

const sourceRoot = process.cwd();
const artifactRoot = "/Users/armanisadeghi/.codex/artifacts/org-integrity/notes-2b-behavioral-mutations";
const runRoot = join(artifactRoot, `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${process.pid}`);
const tests = [
  "features/notes/redux/reviewedSaveAdmission.test.ts",
  "features/notes/redux/reviewedSaveQueue.test.ts",
  "features/notes/noteSnapshotEquality.test.ts",
  "features/notes/service/validateNoteSaveReceipt.test.ts"
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
for (const extra of [...tests, "scripts/run-notes-2b-isolated-mutations.mjs", "features/notes/redux/reviewedSaveResult.type-test.ts"]) {
  const source = join(sourceRoot, extra); const destination = join(runRoot, extra);
  mkdirSync(dirname(destination), { recursive: true }); copyFileSync(source, destination);
}
symlinkSync(join(sourceRoot, "node_modules"), join(runRoot, "node_modules"));
const sharedRequire = createRequire(join(sourceRoot, "package.json"));
const jestBin = sharedRequire.resolve("jest/bin/jest");
const evidenceFiles = [...new Set([...tests,
  "features/notes/redux/thunks.ts", "features/notes/redux/slice.ts",
  "features/notes/noteSnapshotEquality.ts", "features/notes/service/validateNoteSaveReceipt.ts",
  "features/notes/redux/reviewedSaveResult.type-test.ts", "scripts/run-notes-2b-isolated-mutations.mjs",
  "jest.config.ts", "jest.setup.ts", "package.json", "pnpm-lock.yaml", "tsconfig.json", "tsconfig.typecheck.json",
])];
const inputHashes = Object.fromEntries(evidenceFiles.filter((file) => existsSync(join(runRoot, file))).map((file) => [file, sha256(readFileSync(join(runRoot, file)))]));
const manifest = { sourceRoot, runRoot, trackedHash: sourceHash.digest("hex"), inputHashes, runnerHash: sha256(readFileSync(process.argv[1])), tests, jestBin, baseline: null, mutations: [] };
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
  {
    "name": "receipt-from-current-buffer",
    "file": "features/notes/redux/thunks.ts",
    "from": "attempt.receipt = immutableCopy(validated);",
    "to": "attempt.receipt = immutableCopy({ ...validated, note: { ...validated.note, content: (attempt.permit.getState()).notes.notes[attempt.permit.noteId].content } });",
    "testName": "retains the reviewed first receipt",
    "assertion": "first"
  },
  {
    "name": "unrelated-operation-join",
    "file": "features/notes/redux/thunks.ts",
    "from": "if (saveQueues.get(getState)?.has(permit.noteId)) return reviewedRefusal(\"queue-busy\", permit);",
    "to": "if (saveQueues.get(getState)?.get(permit.noteId)?.attempt?.permit) return observeAttempt(saveQueues.get(getState).get(permit.noteId).attempt.permit);\n  if (saveQueues.get(getState)?.has(permit.noteId)) return reviewedRefusal(\"queue-busy\", permit);",
    "testName": "captures before pending re-entry",
    "assertion": "queue-busy"
  },
  {
    "name": "drop-partial-receipt",
    "file": "features/notes/redux/thunks.ts",
    "from": "if (!attempt.permit) return;",
    "to": "if (!attempt.permit || receipt.failedFields.length) return;",
    "testName": "partial",
    "assertion": "partial"
  },
  {
    "name": "drop-post-ack-receipt",
    "file": "features/notes/redux/thunks.ts",
    "from": "if (receipt && actorChanged) result = { ...identity, status: \"recovery-required\", receipt, reason: \"session-changed\" };",
    "to": "if (receipt && actorChanged) result = { ...identity, status: \"refused\", reason: \"session-changed\" };",
    "testName": "post-ack",
    "assertion": "recovery-required"
  },
  {
    "name": "advance-context-only-base",
    "file": "features/notes/redux/thunks.ts",
    "from": "version: settledBase.version,",
    "to": "version: settledBase.version + 1,",
    "testName": "keeps the base revision",
    "assertion": "7"
  },
  {
    "name": "capture-after-pending",
    "file": "features/notes/redux/thunks.ts",
    "from": "entry.attempt = captureSaveAttempt(getState, noteId, entry.expectedUserId, permit);",
    "to": "dispatch({ type: \"notes/saveNote/pending\" });\n        entry.attempt = captureSaveAttempt(getState, noteId, entry.expectedUserId, permit);",
    "testName": "captures before pending re-entry",
    "assertion": "first"
  },
  {
    "name": "old-conflict-acknowledged-base",
    "file": "features/notes/redux/slice.ts",
    "from": "record._acknowledgedPhysicalSnapshot = cloneAcknowledgedNote(current(remote));",
    "to": "/* mutant: retain the prior acknowledged row */",
    "testName": "rebases a reviewed mine choice",
    "assertion": "8"
  },
  {
    "name": "extra-unreviewed-fields",
    "file": "features/notes/redux/thunks.ts",
    "from": "  if (!equalNoteSnapshotValue(current, source)) return { status: \"refused\", reason: \"source-changed\" };\n  const fields = reviewedFields(source);\n  if (fields === null) return { status: \"refused\", reason: \"unsupported-fields\" };\n  if (!equalNoteSnapshotValue([...record._dirtyFields].sort(), [...fields].sort()) || record._dirty !== (fields.length > 0)) return { status: \"refused\", reason: \"source-changed\" };\n",
    "to": "  const fields = reviewedFields(source);\n  if (fields === null) return { status: \"refused\", reason: \"unsupported-fields\" };\n",
    "testName": "refuses extra dirt added after capture",
    "assertion": "source-changed"
  }
];
const selectedMutations = process.env.NOTES_MUTATION_ONLY ? mutations.filter((mutation) => process.env.NOTES_MUTATION_ONLY.split(",").includes(mutation.name)) : mutations;
if (isCleanGreen(manifest.baseline)) {
  for (const mutation of selectedMutations) {
    const file = join(runRoot, mutation.file);
    const original = readFileSync(file, "utf8");
    if (original.split(mutation.from).length !== 2 && !(mutation.name === "advance-context-only-base" && original.split(mutation.from).length === 3)) throw new Error(`${mutation.name}: anchor missing or ambiguous`);
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
const success = isCleanGreen(manifest.baseline) && manifest.mutations.length === selectedMutations.length && manifest.mutations.every((mutation) => mutation.intendedRed && mutation.cleanGreen && mutation.restored);
console.log(JSON.stringify({ runRoot, baseline: isCleanGreen(manifest.baseline), success, mutations: manifest.mutations.map(({ name, intendedRed, cleanGreen, restored }) => ({ name, intendedRed, cleanGreen, restored })) }));
process.exitCode = success ? 0 : 1;
