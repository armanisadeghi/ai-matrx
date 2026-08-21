#!/usr/bin/env tsx
/**
 * Generated-contract shadow guard.
 *
 * Generated OpenAPI and Supabase types are boundary authority. A local alias
 * may point at that authority, but a handwritten object with the same name or
 * substantially the same fields is a shadow contract that can drift silently.
 *
 * Existing verified debt is frozen by declaration identity. The baseline can
 * only shrink with --accept; the command refuses to bless new findings.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const GENERATED_API_PATH = resolve(ROOT, "types/python-generated/api-types.ts");
const BASELINE_PATH = resolve(ROOT, "scripts/generated-type-contracts-baseline.json");
const MIN_SHARED_FIELDS = 8;
const MIN_LOCAL_COVERAGE = 0.65;

export interface GeneratedContract {
  name: string;
  fields: ReadonlySet<string>;
}

export interface SourceFileInput {
  path: string;
  text: string;
}

export type FindingReason =
  | "exact-name-mirror"
  | "renamed-shadow"
  | "generated-extension-shadow";

export interface GeneratedContractFinding {
  id: string;
  path: string;
  line: number;
  declaration: string;
  generatedContract: string;
  reason: FindingReason;
  sharedFieldCount: number;
  localFieldCount: number;
  generatedFieldCount: number;
}

interface BaselineFile {
  _comment: string;
  verifiedAt: string;
  findings: string[];
}

function propertyNameText(name: ts.PropertyName | ts.BindingName | undefined): string | null {
  if (!name || ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function memberFields(members: ts.NodeArray<ts.TypeElement>): Set<string> {
  const fields = new Set<string>();
  for (const member of members) {
    if (!ts.isPropertySignature(member) && !ts.isMethodSignature(member)) continue;
    const name = propertyNameText(member.name);
    if (name) fields.add(name);
  }
  return fields;
}

export function extractApiContracts(sourceText: string): Map<string, GeneratedContract> {
  const source = ts.createSourceFile(
    "api-types.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const contracts = new Map<string, GeneratedContract>();

  for (const statement of source.statements) {
    if (!ts.isInterfaceDeclaration(statement) || statement.name.text !== "components") continue;
    const schemas = statement.members.find(
      (member): member is ts.PropertySignature =>
        ts.isPropertySignature(member) && propertyNameText(member.name) === "schemas",
    );
    if (!schemas?.type || !ts.isTypeLiteralNode(schemas.type)) continue;

    for (const schema of schemas.type.members) {
      if (!ts.isPropertySignature(schema) || !schema.type || !ts.isTypeLiteralNode(schema.type)) {
        continue;
      }
      const name = propertyNameText(schema.name);
      if (!name) continue;
      contracts.set(name, { name, fields: memberFields(schema.type.members) });
    }
  }
  return contracts;
}

function generatedSchemaReference(node: ts.Node): string | null {
  const matches = new Set<string>();
  const visit = (candidate: ts.Node): void => {
    if (ts.isIndexedAccessTypeNode(candidate)) {
      const outer = candidate.objectType;
      const contractArg = candidate.indexType;
      if (
        ts.isIndexedAccessTypeNode(outer) &&
        ts.isTypeReferenceNode(outer.objectType) &&
        ts.isIdentifier(outer.objectType.typeName) &&
        outer.objectType.typeName.text === "components" &&
        ts.isLiteralTypeNode(outer.indexType) &&
        ts.isStringLiteral(outer.indexType.literal) &&
        outer.indexType.literal.text === "schemas" &&
        ts.isLiteralTypeNode(contractArg) &&
        ts.isStringLiteral(contractArg.literal)
      ) {
        matches.add(contractArg.literal.text);
      }
    }
    ts.forEachChild(candidate, visit);
  };
  visit(node);
  return matches.size === 1 ? [...matches][0] : null;
}

function typeReferenceName(node: ts.ExpressionWithTypeArguments | ts.TypeNode): string | null {
  if (ts.isExpressionWithTypeArguments(node)) {
    return ts.isIdentifier(node.expression) ? node.expression.text : null;
  }
  return ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) ? node.typeName.text : null;
}

function objectTypeMembers(type: ts.TypeNode): ts.NodeArray<ts.TypeElement> | null {
  if (ts.isTypeLiteralNode(type)) return type.members;
  if (ts.isIntersectionTypeNode(type)) {
    const literal = type.types.find(ts.isTypeLiteralNode);
    return literal?.members ?? null;
  }
  return null;
}

function boundaryLikeName(name: string): boolean {
  return /(Params|Settings|Config|Request|Response|Payload|Input|Options|Body|Definition|Contract|Data)$/i.test(
    name,
  );
}

function isExactMirror(localFields: ReadonlySet<string>, generated: GeneratedContract): boolean {
  const shared = [...localFields].filter((field) => generated.fields.has(field)).length;
  if (generated.fields.size <= 3) {
    return shared === localFields.size && shared === generated.fields.size;
  }
  return (
    shared >= 4 &&
    shared / localFields.size >= 0.7 &&
    shared / generated.fields.size >= 0.5
  );
}

export function analyzeSources(
  sources: readonly SourceFileInput[],
  contracts: ReadonlyMap<string, GeneratedContract>,
): GeneratedContractFinding[] {
  const parsed = sources.map((source) => ({
    ...source,
    ast: ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true),
  }));
  const generatedAliases = new Map<string, string>();

  // Resolve direct aliases first so an interface in another file can extend a
  // generated alias without copying its import graph into this guard.
  for (const source of parsed) {
    for (const statement of source.ast.statements) {
      if (!ts.isTypeAliasDeclaration(statement)) continue;
      const contract = generatedSchemaReference(statement.type);
      if (contract && contracts.has(contract) && !objectTypeMembers(statement.type)) {
        generatedAliases.set(statement.name.text, contract);
      }
    }
  }

  const findings: GeneratedContractFinding[] = [];
  for (const source of parsed) {
    for (const statement of source.ast.statements) {
      let declaration: string | null = null;
      let fields = new Set<string>();
      let inheritedAlias: string | null = null;

      if (ts.isInterfaceDeclaration(statement)) {
        declaration = statement.name.text;
        fields = memberFields(statement.members);
        for (const clause of statement.heritageClauses ?? []) {
          for (const type of clause.types) {
            const referenced = typeReferenceName(type);
            if (referenced && generatedAliases.has(referenced)) {
              inheritedAlias = generatedAliases.get(referenced)!;
            }
          }
        }
      } else if (ts.isTypeAliasDeclaration(statement)) {
        declaration = statement.name.text;
        const members = objectTypeMembers(statement.type);
        if (!members) continue; // Direct generated, z.infer, and Database aliases are allowed.
        fields = memberFields(members);
        if (ts.isIntersectionTypeNode(statement.type)) {
          for (const part of statement.type.types) {
            const direct = generatedSchemaReference(part);
            const referenced = typeReferenceName(part);
            if (direct && contracts.has(direct)) inheritedAlias = direct;
            else if (referenced && generatedAliases.has(referenced)) {
              inheritedAlias = generatedAliases.get(referenced)!;
            }
          }
        }
      } else {
        continue;
      }

      if (!declaration || fields.size === 0) continue;
      let generatedContract: GeneratedContract | undefined;
      let reason: FindingReason | null = null;
      let sharedFieldCount = 0;

      if (inheritedAlias) {
        generatedContract = contracts.get(inheritedAlias);
        reason = "generated-extension-shadow";
        sharedFieldCount = [...fields].filter((field) => generatedContract!.fields.has(field)).length;
      } else if (contracts.has(declaration)) {
        const exactCandidate = contracts.get(declaration)!;
        if (isExactMirror(fields, exactCandidate)) {
          generatedContract = exactCandidate;
          reason = "exact-name-mirror";
          sharedFieldCount = [...fields].filter((field) => generatedContract!.fields.has(field)).length;
        }
      } else if (boundaryLikeName(declaration)) {
        let bestShared = 0;
        for (const candidate of contracts.values()) {
          const shared = [...fields].filter((field) => candidate.fields.has(field)).length;
          if (shared > bestShared) {
            bestShared = shared;
            generatedContract = candidate;
          }
        }
        if (generatedContract && bestShared >= MIN_SHARED_FIELDS && bestShared / fields.size >= MIN_LOCAL_COVERAGE) {
          reason = "renamed-shadow";
          sharedFieldCount = bestShared;
        }
      }

      if (!reason || !generatedContract) continue;
      const line = source.ast.getLineAndCharacterOfPosition(statement.getStart(source.ast)).line + 1;
      findings.push({
        id: `${source.path}::${declaration}::${generatedContract.name}`,
        path: source.path,
        line,
        declaration,
        generatedContract: generatedContract.name,
        reason,
        sharedFieldCount,
        localFieldCount: fields.size,
        generatedFieldCount: generatedContract.fields.size,
      });
    }
  }

  return findings.sort((a, b) => a.id.localeCompare(b.id));
}

export function shouldScanPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  if (!/\.tsx?$/.test(normalized) || /\.d\.ts$/.test(normalized)) return false;
  return !(
    normalized.startsWith("docs/") ||
    normalized.includes("/archive/") ||
    normalized.includes("/archives/") ||
    normalized.includes("/fixtures/") ||
    normalized.includes("/__tests__/") ||
    /\.(test|spec)\.tsx?$/.test(normalized) ||
    normalized.includes("/generated/") ||
    normalized.includes("/python-generated/") ||
    /(?:^|\/)[^/]*\.generated\.tsx?$/.test(normalized) ||
    normalized === "types/database.types.ts"
  );
}

export function diffBaseline(
  current: readonly GeneratedContractFinding[],
  baseline: readonly string[],
): { added: GeneratedContractFinding[]; resolved: string[] } {
  const baselineSet = new Set(baseline);
  const currentIds = new Set(current.map((finding) => finding.id));
  return {
    added: current.filter((finding) => !baselineSet.has(finding.id)),
    resolved: baseline.filter((id) => !currentIds.has(id)).sort(),
  };
}

export function ratchetBaseline(previous: readonly string[], current: readonly string[]): string[] {
  const previousSet = new Set(previous);
  const added = current.filter((id) => !previousSet.has(id));
  if (added.length > 0) {
    throw new Error(
      `Refusing to add ${added.length} new generated-contract shadow${added.length === 1 ? "" : "s"} to the baseline.`,
    );
  }
  return [...current].sort();
}

function repoSources(): SourceFileInput[] {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "*.ts", "*.tsx"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  return output
    .split("\0")
    .filter(Boolean)
    .filter(shouldScanPath)
    .map((path) => ({ path, text: readFileSync(resolve(ROOT, path), "utf8") }));
}

function readBaseline(): BaselineFile | null {
  if (!existsSync(BASELINE_PATH)) return null;
  const parsed: unknown = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("findings" in parsed) ||
    !Array.isArray(parsed.findings) ||
    !parsed.findings.every((item) => typeof item === "string")
  ) {
    throw new Error(`Malformed baseline: ${BASELINE_PATH}`);
  }
  return parsed as BaselineFile;
}

function writeBaseline(findings: readonly string[]): void {
  const baseline: BaselineFile = {
    _comment:
      "Verified generated-contract shadow debt. Declaration ids may only be removed. `pnpm check:generated-contracts:accept` refuses to add new ids.",
    verifiedAt: new Date().toISOString(),
    findings: [...findings].sort(),
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
}

function printFinding(finding: GeneratedContractFinding): void {
  console.error(
    `  ${finding.path}:${finding.line} ${finding.declaration} -> ${finding.generatedContract} ` +
      `[${finding.reason}; shared ${finding.sharedFieldCount}/${finding.localFieldCount} local fields]`,
  );
}

export function main(argv = process.argv.slice(2)): number {
  const contracts = extractApiContracts(readFileSync(GENERATED_API_PATH, "utf8"));
  const findings = analyzeSources(repoSources(), contracts);
  const ids = findings.map((finding) => finding.id);
  const baseline = readBaseline();

  if (argv.includes("--bootstrap")) {
    if (baseline) throw new Error("Refusing --bootstrap because a baseline already exists.");
    writeBaseline(ids);
    console.log(`check:generated-contracts — bootstrapped ${ids.length} verified finding(s).`);
    return 0;
  }
  if (!baseline) {
    console.error("check:generated-contracts — no baseline. Audit findings, then run once with --bootstrap.");
    findings.forEach(printFinding);
    return 1;
  }

  const { added, resolved } = diffBaseline(findings, baseline.findings);
  if (argv.includes("--accept")) {
    try {
      writeBaseline(ratchetBaseline(baseline.findings, ids));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      added.forEach(printFinding);
      return 1;
    }
    console.log(`check:generated-contracts — baseline ratcheted to ${ids.length} finding(s).`);
    return 0;
  }

  if (added.length > 0) {
    console.error(`check:generated-contracts — FAIL: ${added.length} new shadow contract(s).`);
    added.forEach(printFinding);
    console.error("Alias the generated contract directly; do not update the baseline for new debt.");
    return 1;
  }

  console.log(
    `check:generated-contracts — OK. ${findings.length} verified shadow(s), none added.` +
      (resolved.length > 0
        ? ` ${resolved.length} resolved; run pnpm check:generated-contracts:accept to ratchet down.`
        : ""),
  );
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}
