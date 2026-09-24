/**
 * A minimal PL/pgSQL lexer that finds RAISE statements outside strings, identifiers and comments,
 * and says whether one raises SQLSTATE P0002 (no_data_found) itself or PostgREST's own shape
 * (SQLSTATE 'PGRST'). Used by `pnpm check:not-found-is-honest` (lane ERRORS-HONEST, 2026-09-24).
 *
 * A regex over `prosrc` is not enough: "P0002" appears in comments that explain the convention,
 * in hint strings, and in `when no_data_found then` handlers, none of which raise.
 */
export type Tok = { kind: "word" | "str" | "dq" | "punct" | "ws" | "comment"; text: string; start: number; end: number };

export function lex(s: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const st = i;
    const ch = s[i]!;
    if (/\s/.test(ch)) {
      while (i < s.length && /\s/.test(s[i]!)) i++;
      out.push({ kind: "ws", text: s.slice(st, i), start: st, end: i });
      continue;
    }
    if (s.startsWith("--", i)) {
      while (i < s.length && s[i] !== "\n") i++;
      out.push({ kind: "comment", text: s.slice(st, i), start: st, end: i });
      continue;
    }
    if (s.startsWith("/*", i)) {
      let d = 0;
      do {
        if (s.startsWith("/*", i)) { d++; i += 2; }
        else if (s.startsWith("*/", i)) { d--; i += 2; }
        else i++;
      } while (d > 0 && i < s.length);
      out.push({ kind: "comment", text: s.slice(st, i), start: st, end: i });
      continue;
    }
    if ((ch === "E" || ch === "e") && s[i + 1] === "'") {
      i += 2;
      while (i < s.length) {
        if (s[i] === "\\") { i += 2; continue; }
        if (s[i] === "'") { if (s[i + 1] === "'") { i += 2; continue; } i++; break; }
        i++;
      }
      out.push({ kind: "str", text: s.slice(st, i), start: st, end: i });
      continue;
    }
    if (ch === "'" || ch === '"') {
      i++;
      while (i < s.length) {
        if (s[i] === ch) { if (s[i + 1] === ch) { i += 2; continue; } i++; break; }
        i++;
      }
      out.push({ kind: ch === "'" ? "str" : "dq", text: s.slice(st, i), start: st, end: i });
      continue;
    }
    if (ch === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(s.slice(i));
      if (m) {
        const e = s.indexOf(m[0], i + m[0].length);
        i = e < 0 ? s.length : e + m[0].length;
        out.push({ kind: "str", text: s.slice(st, i), start: st, end: i });
        continue;
      }
    }
    if (/[A-Za-z_]/.test(ch)) {
      while (i < s.length && /[A-Za-z0-9_$]/.test(s[i]!)) i++;
      out.push({ kind: "word", text: s.slice(st, i), start: st, end: i });
      continue;
    }
    i++;
    out.push({ kind: "punct", text: ch, start: st, end: i });
  }
  return out;
}

export type RaiseStmt = { start: number; end: number; text: string; toks: Tok[] };

/** Every RAISE statement in a PL/pgSQL body, from the keyword through its `;`. */
export function raiseStatements(src: string): RaiseStmt[] {
  const t = lex(src);
  const res: RaiseStmt[] = [];
  for (let k = 0; k < t.length; k++) {
    if (t[k]!.kind !== "word" || t[k]!.text.toLowerCase() !== "raise") continue;
    let depth = 0;
    let j = k;
    for (; j < t.length; j++) {
      const x = t[j]!;
      if (x.kind !== "punct") continue;
      if (x.text === "(") depth++;
      else if (x.text === ")") depth--;
      else if (x.text === ";" && depth === 0) break;
    }
    res.push({ start: t[k]!.start, end: t[Math.min(j, t.length - 1)]!.end, text: src.slice(t[k]!.start, t[Math.min(j, t.length - 1)]!.end), toks: t.slice(k, j + 1) });
    k = j;
  }
  return res;
}

const meaningful = (t: Tok) => t.kind !== "ws" && t.kind !== "comment";

/** `raise … using errcode = 'P0002'|'no_data_found'`, `raise sqlstate 'P0002'`, `raise [exception] no_data_found`. */
export function raisesP0002(toks: Tok[]): boolean {
  const s = toks.filter(meaningful);
  for (let i = 0; i < s.length; i++) {
    const w = s[i]!.text.toLowerCase();
    if (w === "errcode" && s[i + 1]?.text === "=" && /^'(P0002|no_data_found)'$/i.test(s[i + 2]?.text ?? "")) return true;
    if (w === "sqlstate" && i <= 2 && /^'P0002'$/i.test(s[i + 1]?.text ?? "")) return true;
    if (w === "no_data_found" && i <= 2) return true;
  }
  return false;
}

/** `raise sqlstate 'PGRST' …` or `using errcode = 'PGRST'`. */
export function raisesPgrst(toks: Tok[]): boolean {
  const s = toks.filter(meaningful);
  for (let i = 0; i < s.length; i++) {
    const w = s[i]!.text.toLowerCase();
    if ((w === "sqlstate" && i <= 2) || (w === "errcode" && s[i + 1]?.text === "=")) {
      const v = w === "sqlstate" ? s[i + 1] : s[i + 2];
      if (v && /^'PGRST'$/i.test(v.text)) return true;
    }
  }
  return false;
}

export type Finding = { kind: "RAISES-P0002" | "SECOND-SHAPE"; count: number; first: string };

/** What a body does wrong under the convention, or [] when it is honest. */
export function judgeBody(src: string): Finding[] {
  const rs = raiseStatements(src);
  const p = rs.filter((r) => raisesP0002(r.toks));
  const g = rs.filter((r) => raisesPgrst(r.toks));
  const out: Finding[] = [];
  if (p.length) out.push({ kind: "RAISES-P0002", count: p.length, first: p[0]!.text.replace(/\s+/g, " ").slice(0, 160) });
  if (g.length) out.push({ kind: "SECOND-SHAPE", count: g.length, first: g[0]!.text.replace(/\s+/g, " ").slice(0, 160) });
  return out;
}

// ── the rewrite the ERRORS-HONEST campaign files were generated with ──────────────────────────────

function splitTop(toks: Tok[]): Tok[][] {
  const out: Tok[][] = [[]];
  let d = 0;
  for (const t of toks) {
    if (t.kind === "punct" && t.text === "(") d++;
    if (t.kind === "punct" && t.text === ")") d--;
    if (t.kind === "punct" && t.text === "," && d === 0) { out.push([]); continue; }
    out[out.length - 1]!.push(t);
  }
  return out;
}
const joined = (ts: Tok[]) => ts.map((t) => t.text).join("").trim();

/**
 * `raise exception '<fmt>', a, b using errcode = 'P0002'[, hint = h][, detail = d][, message = m];`
 *   → `perform platform.refuse_not_found(format('<fmt with % as %s>', a, b)[, h][, d]);`
 * Throws, by name, on any shape it does not understand — never guesses.
 */
export function rewriteNotFoundRaise(stmt: RaiseStmt): string {
  const body = stmt.toks.slice(0, -1);
  const sig = body.map((t, i) => [t, i] as const).filter(([t]) => meaningful(t));
  if (sig[0]?.[0].text.toLowerCase() !== "raise" || sig[1]?.[0].text.toLowerCase() !== "exception") {
    throw new Error(`unsupported RAISE (not "raise exception …"): ${joined(body)}`);
  }
  const from = sig[2]?.[1] ?? body.length;
  let d = 0;
  let usingAt = -1;
  for (let i = from; i < body.length; i++) {
    const t = body[i]!;
    if (t.kind === "punct" && t.text === "(") d++;
    if (t.kind === "punct" && t.text === ")") d--;
    if (d === 0 && t.kind === "word" && t.text.toLowerCase() === "using") { usingAt = i; break; }
  }
  if (usingAt < 0) throw new Error(`RAISE without USING: ${joined(body)}`);
  let msg: string | null = null;
  let hint: string | null = null;
  let detail: string | null = null;
  for (const o of splitTop(body.slice(usingAt + 1))) {
    const os = o.filter(meaningful);
    const name = os[0]?.text.toLowerCase();
    if (os[1]?.text !== "=") throw new Error(`unsupported RAISE option: ${joined(o)}`);
    const val = joined(o.slice(o.indexOf(os[1]!) + 1));
    if (name === "errcode") { if (!/^'(P0002|no_data_found)'$/i.test(val)) throw new Error(`errcode ${val}`); }
    else if (name === "message") msg = val;
    else if (name === "hint") hint = val;
    else if (name === "detail") detail = val;
    else throw new Error(`unsupported RAISE option ${name}: ${joined(body)}`);
  }
  const pre = body.slice(from, usingAt);
  if (pre.some(meaningful)) {
    if (msg !== null) throw new Error(`RAISE with both a format and MESSAGE: ${joined(body)}`);
    const parts = splitTop(pre);
    const lit = parts[0]!.filter(meaningful);
    if (lit.length !== 1 || lit[0]!.kind !== "str") throw new Error(`RAISE format is not one literal: ${joined(body)}`);
    const args = parts.slice(1).map(joined);
    const holes = (lit[0]!.text.match(/%%|%/g) ?? []).filter((m) => m === "%").length;
    if (holes !== args.length) throw new Error(`RAISE has ${holes} placeholders and ${args.length} arguments: ${joined(body)}`);
    msg = /%/.test(lit[0]!.text)
      ? `format(${[lit[0]!.text.replace(/%%|%/g, (m) => (m === "%%" ? "%%" : "%s")), ...args].join(", ")})`
      : lit[0]!.text;
  }
  if (msg === null) throw new Error(`RAISE without a message: ${joined(body)}`);
  const a = [msg];
  if (hint !== null || detail !== null) a.push(hint ?? "null");
  if (detail !== null) a.push(detail);
  return `perform platform.refuse_not_found(${a.join(", ")});`;
}

/** Every P0002 raise in a body rewritten through the convention. */
export function rewriteNotFoundRaises(src: string): { out: string; count: number } {
  const rs = raiseStatements(src).filter((r) => raisesP0002(r.toks));
  let out = src;
  for (const r of [...rs].sort((x, y) => y.start - x.start)) out = out.slice(0, r.start) + rewriteNotFoundRaise(r) + out.slice(r.end);
  return { out, count: rs.length };
}
