/**
 * A surface may load only values it declared (Matrx Alchemy ALC-14; the check
 * itself is the package's `validateLoadedValues`). Called where the loaded
 * scope is assembled (`withScopeContributions`), so every reader is covered.
 *
 * Law 6 — validation offers, never blocks:
 *   - production: nothing happens; the person's action proceeds;
 *   - development: each undeclared value is announced once, with its remedy;
 *   - test: it throws, so a test that loads a real surface with an undeclared
 *     key fails.
 */
import {
  validateLoadedValues,
  type DeclarationIssue,
  type ResolvedSurfaceDeclaration,
} from "@ai-matrx/alchemy/declare";
import { getManifest } from "@/features/surfaces/manifests/registry";

/** Undeclared loaded values for a registered surface ([] for an unregistered one). */
export function findUndeclaredLoadedValues(
  surfaceName: string,
  scope: Record<string, unknown>,
): DeclarationIssue[] {
  const manifest = getManifest(surfaceName);
  if (!manifest) return [];
  return validateLoadedValues(
    manifest as unknown as Pick<ResolvedSurfaceDeclaration, "surfaceName" | "values" | "itemTypes">,
    scope,
  );
}

const announced = new Set<string>();

export function announceUndeclaredLoadedValues(
  surfaceName: string,
  scope: Record<string, unknown>,
): void {
  const mode = process.env.NODE_ENV;
  if (mode === "production") return;
  const issues = findUndeclaredLoadedValues(surfaceName, scope);
  if (issues.length === 0) return;
  if (mode === "test") {
    throw new Error(issues.map((issue) => `${issue.sentence} ${issue.remedy}`).join("\n"));
  }
  for (const issue of issues) {
    const key = `${issue.surfaceName}\u0000${issue.path}`;
    if (announced.has(key)) continue;
    announced.add(key);
    console.error(`[surfaces] ${issue.sentence} ${issue.remedy}`);
  }
}
