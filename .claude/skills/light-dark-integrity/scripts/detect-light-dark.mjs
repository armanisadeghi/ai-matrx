#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([".git", ".next", "node_modules", "coverage", "dist"]);
const EXCEPTION_ID_RE = /patrol-exception:(P4-EX-\d{3,})/g;
const EXCEPTIONS_FILE = resolve(
  ROOT,
  ".claude/skills/light-dark-integrity/exceptions.json",
);

function loadApprovedExceptions() {
  if (!existsSync(EXCEPTIONS_FILE)) {
    return {
      approved: [],
      eligible: [],
      errors: [`Missing exception ledger: ${EXCEPTIONS_FILE}`],
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(EXCEPTIONS_FILE, "utf8"));
    const approved = Array.isArray(parsed.approved) ? parsed.approved : [];
    const errors = [];
    const invalidEntries = new Set();
    const entriesById = new Map();
    const entriesByLocation = new Map();

    const invalidate = (entry, message) => {
      invalidEntries.add(entry);
      errors.push(message);
    };

    for (const entry of approved) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        invalidate(entry, "Approved exception entry must be an object");
        continue;
      }
      const stringFields = [
        "id",
        "file",
        "reason",
        "reviewUrl",
        "approvedBy",
        "approvedOn",
        "approvalReference",
      ];
      for (const field of stringFields) {
        if (typeof entry[field] !== "string" || entry[field].trim() === "") {
          invalidate(
            entry,
            `Approved exception ${entry.id ?? "<missing id>"} lacks ${field}`,
          );
        }
      }
      if (!Number.isInteger(entry.line) || entry.line < 1) {
        invalidate(entry, `Approved exception ${entry.id ?? "<missing id>"} lacks line`);
      }
      if (
        !Array.isArray(entry.tokens) ||
        entry.tokens.length === 0 ||
        entry.tokens.some((token) => typeof token !== "string" || token.trim() === "")
      ) {
        invalidate(entry, `Approved exception ${entry.id ?? "<missing id>"} lacks tokens`);
      } else if (new Set(entry.tokens).size !== entry.tokens.length) {
        invalidate(entry, `Approved exception ${entry.id ?? "<missing id>"} repeats a token`);
      }
      if (entry.approvedBy !== "Arman") {
        invalidate(
          entry,
          `${entry.id ?? "<missing id>"} is not explicitly approvedBy Arman`,
        );
      }
      if (!/^P4-EX-\d{3,}$/.test(entry.id ?? "")) {
        invalidate(entry, `Invalid P4 exception id: ${entry.id ?? "<missing id>"}`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.approvedOn ?? "")) {
        invalidate(entry, `${entry.id ?? "<missing id>"} has an invalid approvedOn date`);
      }
      if (!/^https:\/\//.test(entry.reviewUrl ?? "")) {
        invalidate(
          entry,
          `${entry.id ?? "<missing id>"} lacks a production https reviewUrl`,
        );
      }

      const location = `${entry.file}:${entry.line}`;
      entriesById.set(entry.id, [...(entriesById.get(entry.id) ?? []), entry]);
      entriesByLocation.set(location, [
        ...(entriesByLocation.get(location) ?? []),
        entry,
      ]);
    }

    for (const [id, entries] of entriesById) {
      if (entries.length <= 1) continue;
      errors.push(`Duplicate P4 exception id: ${id}`);
      entries.forEach((entry) => invalidEntries.add(entry));
    }
    for (const [location, entries] of entriesByLocation) {
      if (entries.length <= 1) continue;
      errors.push(`Multiple approved P4 exceptions target ${location}`);
      entries.forEach((entry) => invalidEntries.add(entry));
    }

    return {
      approved,
      eligible: approved.filter((entry) => !invalidEntries.has(entry)),
      errors,
    };
  } catch (error) {
    return {
      approved: [],
      eligible: [],
      errors: [`Cannot parse exception ledger: ${error.message}`],
    };
  }
}

function collectFiles(target) {
  const absolute = resolve(ROOT, target);
  const stat = statSync(absolute);
  if (stat.isFile()) return extname(absolute) === ".tsx" ? [absolute] : [];

  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) return [];
    const child = join(absolute, entry.name);
    if (entry.isDirectory()) return collectFiles(child);
    return entry.isFile() && extname(entry.name) === ".tsx" ? [child] : [];
  });
}

function parseColorClass(token) {
  const parts = token.split(":");
  const utility = parts.pop().replace(/^!/, "");
  return {
    token,
    property: utility.startsWith("bg-") ? "bg" : "text",
    variants: parts,
  };
}

function extractColorClasses(line) {
  return line
    .split(/[\s"'`]+/)
    .map((token) => token.replace(/^[({,]+|[)},;]+$/g, ""))
    .filter((token) => {
      const utility = token.split(":").at(-1)?.replace(/^!/, "") ?? "";
      return utility.startsWith("bg-") || utility.startsWith("text-");
    });
}

function isPatrolledRawClass(token) {
  const utility = token.split(":").at(-1)?.replace(/^!/, "") ?? "";
  return /^(?:bg-white|text-black)(?:\/[\w.[\]-]+)?$/.test(utility);
}

function variantSignature(variants) {
  return variants.filter((variant) => variant !== "dark").sort().join(":");
}

function hasPropertySpecificDarkPair(rawClass, colorClasses) {
  const rawIsDark = rawClass.variants.includes("dark");
  const rawSignature = variantSignature(rawClass.variants);
  return colorClasses.some(
    (candidate) =>
      candidate.token !== rawClass.token &&
      candidate.property === rawClass.property &&
      candidate.variants.includes("dark") !== rawIsDark &&
      variantSignature(candidate.variants) === rawSignature,
  );
}

function exceptionHint(file, context) {
  const value = `${file}\n${context}`.toLowerCase();
  if (/print:|@media\s+print|pdf|export/.test(value)) return "print/export";
  if (/iframe|htmlpreview|webpage|page preview|matte/.test(value)) return "html/iframe matte";
  if (/canvas|image|video|media|camera|capture|crop|bbox|gradient|artwork/.test(value)) {
    return "media/canvas overlay";
  }
  if (/theme|darkmode|lightmode|appearance|surface\s*===\s*["']dark/.test(value)) {
    return "explicit theme selection";
  }
  if (/fixture|sample|specimen|demo|game|loader/.test(value)) return "fixture/specimen";
  return null;
}

const args = process.argv.slice(2);
const json = args.includes("--json");
const strict = args.includes("--strict");
const targets = args.filter((arg) => !arg.startsWith("--"));
const roots = targets.length > 0 ? targets : ["."];
const files = [...new Set(roots.flatMap(collectFiles))].sort();
const exceptionLedger = loadApprovedExceptions();
const approvedById = new Map(exceptionLedger.eligible.map((entry) => [entry.id, entry]));
const approvedByLocation = new Map(
  exceptionLedger.eligible.map((entry) => [`${entry.file}:${entry.line}`, entry]),
);
const sourceAnnotations = [];
const fileLines = new Map();

for (const file of files) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const repoFile = relative(ROOT, file);
  fileLines.set(repoFile, lines);
  lines.forEach((line, index) => {
    for (const annotation of line.matchAll(EXCEPTION_ID_RE)) {
      sourceAnnotations.push({ id: annotation[1], file: repoFile, line: index + 1 });
    }
  });
}

const exceptionErrors = [...exceptionLedger.errors];
const annotationCounts = new Map();
for (const annotation of sourceAnnotations) {
  annotationCounts.set(annotation.id, (annotationCounts.get(annotation.id) ?? 0) + 1);
  const entry = approvedById.get(annotation.id);
  if (!entry) {
    exceptionErrors.push(`${annotation.id} has a source annotation but no approved ledger entry`);
  } else if (entry.file !== annotation.file) {
    exceptionErrors.push(`${annotation.id} source annotation is in the wrong file`);
  } else if (Math.abs(entry.line - annotation.line) > 2) {
    exceptionErrors.push(`${annotation.id} source annotation is not within two lines of its target`);
  }
}
for (const entry of exceptionLedger.eligible) {
  const count = annotationCounts.get(entry.id) ?? 0;
  if (count === 0) exceptionErrors.push(`${entry.id} has no source annotation`);
  if (count > 1) exceptionErrors.push(`${entry.id} has ${count} source annotations; expected one`);
}

const matches = [];
const seenApprovedIds = new Set();

for (const file of files) {
  const repoFile = relative(ROOT, file);
  const lines = fileLines.get(repoFile);
  lines.forEach((line, index) => {
    const classTokens = extractColorClasses(line);
    const tokens = [...new Set(classTokens.filter(isPatrolledRawClass))];
    if (tokens.length === 0) return;

    const colorClasses = classTokens.map(parseColorClass);
    const unpairedTokens = tokens.filter((token) => {
      const rawClass = parseColorClass(token);
      return !hasPropertySpecificDarkPair(rawClass, colorClasses);
    });
    const sameLineDarkPair = unpairedTokens.length === 0;
    const lineNumber = index + 1;
    const approvedEntry = approvedByLocation.get(`${repoFile}:${lineNumber}`);
    let status = sameLineDarkPair ? "paired" : "needs_review";
    let exceptionError = null;

    if (approvedEntry) {
      if (sameLineDarkPair) {
        status = "invalid_exception";
        exceptionError = `${approvedEntry.id} is stale because every raw token is paired`;
      } else if ((annotationCounts.get(approvedEntry.id) ?? 0) !== 1) {
        status = "invalid_exception";
        exceptionError = `${approvedEntry.id} does not have exactly one source annotation`;
      } else {
        const annotation = sourceAnnotations.find((item) => item.id === approvedEntry.id);
        const annotationIsValid =
          annotation?.file === repoFile && Math.abs(annotation.line - lineNumber) <= 2;
        const expectedTokens = [...approvedEntry.tokens].sort();
        const actualTokens = [...unpairedTokens].sort();
        if (!annotationIsValid) {
          status = "invalid_exception";
          exceptionError = `${approvedEntry.id} source annotation does not match this line`;
        } else if (JSON.stringify(expectedTokens) !== JSON.stringify(actualTokens)) {
          status = "invalid_exception";
          exceptionError = `${approvedEntry.id} ledger tokens do not match the unpaired source tokens`;
        } else {
          status = "approved_exception";
          seenApprovedIds.add(approvedEntry.id);
        }
      }
    }

    const context = lines.slice(Math.max(0, index - 2), index + 3).join("\n");
    matches.push({
      file: repoFile,
      line: lineNumber,
      tokens,
      unpairedTokens,
      sameLineDarkPair,
      exceptionHint: exceptionHint(file, context),
      status,
      exceptionId: approvedEntry?.id ?? null,
      exceptionError,
      source: line.trim(),
    });
  });
}

for (const entry of exceptionLedger.eligible) {
  if (!seenApprovedIds.has(entry.id)) {
    exceptionErrors.push(`${entry.id} is approved in the ledger but has no valid candidate match`);
  }
}

const summary = {
  scannedFiles: files.length,
  matchingFiles: new Set(matches.map((match) => match.file)).size,
  matchingLines: matches.length,
  sameLinePaired: matches.filter((match) => match.status === "paired").length,
  approvedExceptions: matches.filter((match) => match.status === "approved_exception").length,
  invalidExceptions:
    matches.filter((match) => match.status === "invalid_exception").length +
    exceptionErrors.length,
  reviewCandidates: matches.filter((match) => match.status === "needs_review").length,
};

if (json) {
  process.stdout.write(`${JSON.stringify({ summary, exceptionErrors, matches }, null, 2)}\n`);
} else {
  console.log(
    `P4 light/dark detector: ${summary.scannedFiles} files scanned; ` +
      `${summary.matchingLines} matching lines; ${summary.reviewCandidates} require review.`,
  );
  for (const match of matches.filter((entry) => entry.status === "needs_review")) {
    const hint = match.exceptionHint ? ` [possible ${match.exceptionHint}]` : "";
    console.log(
      `${match.file}:${match.line}${hint} ` +
        `[unpaired: ${match.unpairedTokens.join(", ")}] ${match.source}`,
    );
  }
  for (const match of matches.filter((entry) => entry.status === "invalid_exception")) {
    console.error(`INVALID EXCEPTION ${match.file}:${match.line} ${match.exceptionError}`);
  }
  for (const error of exceptionErrors) console.error(`INVALID EXCEPTION ${error}`);
  console.log(
    `${summary.approvedExceptions} Arman-approved exception(s) remain visible in the report.`,
  );
  console.log("Hints are proposal aids, never automatic exclusions or approvals.");
}

if (strict && (summary.reviewCandidates > 0 || summary.invalidExceptions > 0)) {
  process.exitCode = 1;
}
