/**
 * THE ONE CLASSIFIER behind `pnpm check:knob-resolve-callers` (DD-198).
 *
 * `platform.knob_resolve(feature, key, org, user, p_scopes)` reads `p_scopes` only through
 * `jsonb_array_elements`, and only once an override row exists at a rung that is neither
 * `organization` nor `user`. So a caller that passes an OBJECT runs green until the first
 * person creates a row-keyed override — and then raises `22023 cannot extract elements from
 * an object` on every call. This module reads a call site's p_scopes argument and says which
 * of the three it is; the CLI applies it to the live catalog AND to repo source, so there is
 * one rule and not two copies that drift.
 *
 * Pure: no I/O, no database, no `import.meta` — so the tests can exercise it directly.
 */
export type Verdict = "ok" | "offender" | "opaque";

/**
 * Every `knob_resolve(` call in `body`, with its arguments split at top level.
 * Paren-, quote- and dollar-quote-aware, so a nested call or a string containing a
 * comma never splits an argument. Named arguments (`p_scopes: …`, `p_scopes =>` …)
 * are recognised wherever they appear.
 */
export function knobResolveCalls(body: string): { args: string[]; at: number }[] {
  const out: { args: string[]; at: number }[] = [];
  const re = /knob_resolve\s*[("]?\s*[,(]?/gi;
  let m: RegExpExecArray | null;
  const opener = /knob_resolve["']?\s*[,(]/gi;
  while ((m = opener.exec(body)) !== null) {
    // Find the '(' that opens the argument list (supabase-js writes `.rpc("knob_resolve", {…})`).
    let i = m.index + m[0].length - 1;
    const isRpc = body[i] === ",";
    if (isRpc) {
      while (i < body.length && body[i] !== "{" && body[i] !== "\n") i++;
      if (body[i] !== "{") continue;
    }
    const open = body[i];
    const close = open === "{" ? "}" : ")";
    i++;
    const args: string[] = [];
    let depth = 1, cur = "", q: string | null = null;
    for (; i < body.length; i++) {
      const ch = body[i];
      if (q) {
        cur += ch;
        if (ch === q && body[i - 1] !== "\\") q = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === "`") { q = ch; cur += ch; continue; }
      if (ch === "(" || ch === "[" || ch === "{") depth++;
      else if (ch === ")" || ch === "]" || ch === "}") {
        depth--;
        if (depth === 0) { args.push(cur); break; }
      }
      if (ch === "," && depth === 1) { args.push(cur); cur = ""; continue; }
      cur += ch;
    }
    if (depth !== 0) continue;      // unbalanced — not a call we can read
    if (close === "}") {
      // A supabase-js RPC object: find the p_scopes property.
      const scopes = args.find((a) => /^\s*p_scopes\s*:/.test(a));
      out.push({ args: ["", "", "", "", scopes === undefined ? "" : scopes.replace(/^\s*p_scopes\s*:/, "")], at: m.index });
    } else {
      out.push({ args, at: m.index });
    }
  }
  return out;
}

/** The p_scopes argument of one call: the 5th positional, or a named `p_scopes =>`/`p_scopes=`. */
export function scopesArgumentOf(args: string[]): string {
  const named = args.find((a) => /^\s*p_scopes\s*(=>|:=)/.test(a));
  if (named) return named.replace(/^\s*p_scopes\s*(=>|:=)/, "").trim();
  return (args[4] ?? "").trim();
}

export function classify(arg: string): Verdict {
  const a = arg.replace(/^\(+/, "").trim();
  // A ternary is safe exactly when BOTH of its branches are: `deviceId ? [{…}] : undefined`.
  const tern = a.match(/^[^?:]+\?([\s\S]+):([\s\S]+)$/);
  if (tern) {
    const [t, f] = [classify(tern[1]), classify(tern[2])];
    if (t === "offender" || f === "offender") return "offender";
    return t === "ok" && f === "ok" ? "ok" : "opaque";
  }
  if (a === "" || /^(null|none|undefined)\b/i.test(a)) return "ok";
  if (/^jsonb_build_array\s*\(/i.test(a)) return "ok";
  if (/^(to_)?jsonb\s*\(\s*array\s*\[/i.test(a)) return "ok";
  if (/^array\s*\[/i.test(a)) return "ok";
  if (/^\[/.test(a)) return "ok";                              // TS / Python array literal
  if (/^'\s*\[/.test(a) || /^"\s*\[/.test(a)) return "ok";      // '[{"kind":…}]'::jsonb
  if (/^json\.dumps\s*\(\s*\[/i.test(a)) return "ok";           // python
  if (/^jsonb?_build_object\s*\(/i.test(a)) return "offender";
  if (/^'\s*\{/.test(a) || /^"\s*\{/.test(a)) return "offender"; // '{}'::jsonb, '{"table":…}'
  if (/^\{/.test(a)) return "offender";                          // TS / Python object literal
  // A SQL CASE is safe exactly when every THEN/ELSE operand is — the shape
  // platform._knob_override_write and content_ir.edit_kind_instance_value both use.
  if (/^case\b/i.test(a)) {
    const operands = [...a.matchAll(/\b(?:then|else)\s+([\s\S]*?)(?=\s+\b(?:when|then|else|end)\b|$)/gi)].map((m) => m[1]);
    if (operands.length) {
      const verdicts = operands.map(classify);
      if (verdicts.includes("offender")) return "offender";
      return verdicts.every((v) => v === "ok") ? "ok" : "opaque";
    }
    return "opaque";
  }
  if (/^to_jsonb\s*\(/i.test(a)) return "opaque";
  return "opaque";
}

