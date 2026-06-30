/**
 * Glob-style path filtering for the feature-docs table (include / exclude).
 *
 * Patterns:
 *   star           one path segment (no slash)
 *   double-star    any characters including slashes
 *   double-star/foo   suffix match
 *   foo/double-star   prefix match
 *   exact/path.md
 */

export interface PathFilterRules {
  include: string[];
  exclude: string[];
}

function globToRegExp(pattern: string): RegExp {
  let re = "^";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      const after = pattern[i + 2];
      if (after === "/") {
        re += "(?:.*/)?";
        i += 3;
      } else {
        re += ".*";
        i += 2;
      }
      continue;
    }
    if (c === "*") {
      re += "[^/]*";
      i += 1;
      continue;
    }
    if (c === "?") {
      re += "[^/]";
      i += 1;
      continue;
    }
    re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    i += 1;
  }
  return new RegExp(`${re}$`, "i");
}

function patternMatches(path: string, pattern: string): boolean {
  const p = pattern.trim();
  if (!p) return false;
  if (p.startsWith("!")) {
    return globToRegExp(p.slice(1)).test(path);
  }
  return globToRegExp(p).test(path);
}

export function parsePathFilterLines(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Merge include textarea: lines starting with ! move to exclude. */
export function buildPathFilterRules(
  includeText: string,
  excludeText: string,
): PathFilterRules {
  const include: string[] = [];
  const exclude = parsePathFilterLines(excludeText);
  for (const line of parsePathFilterLines(includeText)) {
    if (line.startsWith("!")) exclude.push(line.slice(1).trim());
    else include.push(line);
  }
  return { include, exclude };
}

export function matchesPathFilter(
  path: string,
  rules: PathFilterRules,
): boolean {
  const normalized = path.replace(/^\/+/, "");
  if (rules.exclude.some((p) => patternMatches(normalized, p))) {
    return false;
  }
  if (rules.include.length === 0) return true;
  return rules.include.some((p) => patternMatches(normalized, p));
}
