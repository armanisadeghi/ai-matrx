/**
 * byte-size-shape.mjs — THE SHAPE RULE for byte-size formatting.
 *
 * WHY A SHAPE RULE EXISTS AT ALL. `check:package-twins` is NAME-based: it fails
 * a local `function formatFileSize`. But the byte-size twins in this repo were
 * never called that. They were `formatBytes`, `fmtBytes`, `humanSize`,
 * `bytesToSize`, `formatSize`, `bytesHuman` — and two dozen more were not
 * functions at all, just `{(file.size / (1024 * 1024)).toFixed(2)} MB` inlined
 * into JSX. A name register cannot see any of that. The 2026-09-07 duplication
 * census named this gap in as many words ("the census method needs a shape
 * pass"); the 2026-09-11 re-verification proved it, finding 14+ live twins
 * under names nobody had registered.
 *
 * THE PATTERN THIS DETECTS. A byte count becoming a unit string, which in
 * JavaScript is always the same two things in one expression:
 *   (a) a DIVISION or COMPARISON against 1024 / 1048576 / 1073741824, and
 *   (b) a unit label literal — "B", "KB", "MB", "GB", "TB" (or the KiB/MiB
 *       binary spellings) — within the same short window.
 *
 * A capacity CONSTANT never matches: `80 * 1024 * 1024` multiplies, and the
 * detector requires `/ 1024`, `< 1024`, `>= 1024` etc. That asymmetry is the
 * whole reason the rule is usable — the repo has ~60 legitimate byte ceilings.
 *
 * THE DECIMAL (SI) FAMILY (added 2026-09-11 after a second independent review).
 * Every arm below used to start from a BINARY base — 1024 / 1048576 /
 * 1073741824 — so a body that divides by the SI base was invisible to the whole
 * detector, and five live twins sat in the fleet returning zero findings:
 * `m.value / 1_000_000` + " MB" (cloud-browser telemetry, which has no B or KB
 * tier at all and renders a 4 KB payload as a confident "0.0 MB"),
 * `content_length / 1000` + "KB", `effectiveContent.length / 1000` + " KB", and
 * `bytes_downloaded / 1e6` + " MB". Decimal is not a different capability — it
 * is the SAME capability with a wrong divisor, which is precisely why it must
 * be collapsed rather than tolerated. So the base literal now covers 1000,
 * 1_000, 1e3, 1e6, 1e9, 1e12 and their long spellings alongside the binary
 * three, and EVERY arm inherits the widening because they all read one shared
 * literal pattern.
 *
 * THE MULTIPLY-FROM-GB ARM (added 2026-09-11, same review). One live twin runs
 * the conversion the other way: `matrx-local`'s `fmtSize(gb: number)` receives
 * GIGABYTES and MULTIPLIES — ``return `${Math.round(gb * 1024)} MB`;`` — so no
 * division exists anywhere in the body. Its two collapsed siblings
 * (`Devices.tsx`, `Voice.tsx`) were found by hand, not by this guard.
 *
 * WHY THIS DOES NOT BREAK THE CAPACITY-CONSTANT ASYMMETRY, which is still the
 * whole reason the rule is usable. The multiply arm is narrower than the
 * division arms in TWO independent ways, and a byte ceiling fails BOTH:
 *   1. OPERAND SHAPE. It requires a NON-LITERAL (an identifier or property)
 *      multiplied by the base: `gb * 1024`, `mb * 1024 * 1024`. Every capacity
 *      ceiling in the fleet is literal × literal — `80 * 1024 * 1024`,
 *      `16 * 1024 * 1024`, `64 * 1024 * 1024` — and literal × literal can never
 *      match this pattern.
 *   2. LABEL POSITION. It requires the unit label on the SAME LINE and OUTSIDE
 *      any comment, because that is what "this number is being displayed" looks
 *      like: ``${Math.round(gb * 1024)} MB``. The ±6-line window is deliberately
 *      NOT extended to this arm: `const maxBytes = limitMb * 1024 * 1024; //
 *      25 MB` is a ceiling computed from a variable, and under a window (or a
 *      rule that read comments) it would be indistinguishable from a formatter.
 *      Comments are stripped before the label test for exactly that reason.
 *
 * THE SINGLE-UNIT FORM (added 2026-09-11 after an independent review). The
 * window above assumes the unit label sits near the arithmetic. One whole
 * idiom does not: the conversion is hoisted into a NAMED value at the top of a
 * component and the label is typed into JSX far below it. In
 * `features/flashcards/fast-fire/capture-test/WavePlayer.tsx` the division is
 * on line 58 and the ` KB` is on line 102 — forty-four lines away, invisible to
 * any window a byte-size rule could afford. What IS on line 58 is the unit: the
 * name. `const sizeKb = (blob.size / 1024).toFixed(0)` declares its unit in the
 * identifier, so an identifier ending in a byte unit (`…Kb`, `…KB`, `…MB`,
 * `…GiB`) taking a byte division is a formatter on its own evidence, with no
 * window at all.
 *
 * THE NAMED-BINDING ARM (added 2026-09-11, same review). The unit is not always
 * in the name either. `components/debug/debug-stats.tsx` wrote
 * `setMemoryInfo({ used: Math.round(heap.usedJSHeapSize / 1024 / 1024), … })`
 * on line 41 and rendered `{memoryInfo.used}MB` on line 86 — the key is `used`,
 * which says nothing, and the label is forty-five lines away. So the lane also
 * follows the BINDING: any name a byte division is bound to on that line — a
 * declaration, an assignment, or an object PROPERTY KEY — and then asks whether
 * that name is interpolated anywhere in the same file immediately before a unit
 * label. That is a whole-file question, not a windowed one, which is exactly
 * why the two hoisted idioms were invisible.
 *
 * THE CALL-ARGUMENT ARM (added 2026-09-11, third form of the same review). The
 * label can also be hidden behind a HELPER, in another module entirely:
 * `matrx-local`'s LoraManager wrote `${formatGb(lora.size_bytes / 1024 ** 3)}`
 * — no adjacent unit literal, no unit-named binding, and the " GB" lives
 * inside `formatGb` two files away. But the CALLEE's name carries the unit, on
 * the same line as the division, which is all the evidence needed: a byte
 * division handed to `formatGb` / `toMb` / `asKB` / `humanGb` is a byte-size
 * formatter with an extra hop. Collapsing it means deleting both halves — the
 * conversion AND the helper — because `formatFileSize` takes bytes and returns
 * the unit.
 *
 * THE IDENTIFIER-DIVISOR ARM (added 2026-09-11, fourth form). Every arm above
 * still starts from `BYTE_DIVISOR_RE`, which matches LITERALS. A body that
 * binds the base first — `const k = 1024; … return `${(bytes / k).toFixed(1)}
 * KB`` — divides by a name, so the lane skipped it entirely; matrx-frontend's
 * `InlineUploadArea` carried exactly that, printing "NaN undefined" for a NaN
 * size, and it escaped the NAME register too because it was spelled
 * `formatBytes`. So the detector first reads the file for identifiers bound to
 * a byte base (1024, 1048576, 1073741824, or `1024 ** n`) and then treats a
 * division by one of those names as a byte division. The EVIDENCE requirement
 * is unchanged — a unit label nearby, a unit-carrying name, or a unit-named
 * callee — so `const k = 1024; const chunks = size / k` with no unit anywhere
 * stays silent.
 *
 * THE ONE HOME is `formatFileSize` from `@ai-matrx/kit/format`, which owns the
 * display decisions (binary units, one decimal below ten in a unit, whole bytes
 * below 1 KB, em-dash for unknown — never a confident "0 B").
 *
 * Exported as a module so `check-package-twins.mjs` can run it as its shape
 * lane and so the self-test can plant a body and prove it fails.
 */

/**
 * A DISPLAYED unit label: " B", "KB", "MiB"… as a reader would see it — after
 * whitespace, a closing `}`, a quote, or an opening delimiter.
 *
 * WHY THE LEADING SET IS NARROW (tightened 2026-09-11, with the decimal
 * widening). It used to accept any non-letter, which meant an identifier or an
 * arithmetic operand could impersonate a label: `MAX_SIZE_MB * 1024 * 1024`
 * (`_MB`) read as a capacity ceiling wearing a unit, and the comment
 * `(0.299*R + 0.587*G + 0.114*B)` beside a `/ 1000` brightness formula read as
 * a byte label (`*B`). Neither is a label anyone sees. `_`, `*`, `.` and
 * alphanumerics are therefore NOT label boundaries; whitespace and the
 * delimiters a rendered string actually starts after are.
 */
const UNIT_LABEL_RE = /(?:^|[\s>}'"`([,+:=])(?:[KMGT]i?B|B)(?:[^A-Za-z0-9_]|$)/;

/**
 * A byte BASE as it is actually written in source: the binary three (and the
 * `1024 ** n` exponent spelling), plus the decimal/SI family in every spelling
 * the fleet used — `1000`, `1_000`, `1e3`, `1_000_000`, `1e6`, `1e9`, `1e12`.
 * Longest alternative first, and a trailing lookahead so `/ 10240` and
 * `/ 10000` are not read as `/ 1024` and `/ 1000`.
 *
 * ONE shared literal, read by every arm: the decimal blindness existed because
 * four arms each started from a divisor pattern that only knew about 1024.
 */
const BYTE_BASE_LITERAL =
  "(?:1024(?:\\s*\\*\\*\\s*[234])?|1048576|1073741824|" +
  "1_?000_?000_?000_?000|1_?000_?000_?000|1_?000_?000|1_?000|" +
  "1e(?:12|9|6|3))(?![\\d_.])";

/**
 * A byte DIVISION or THRESHOLD COMPARISON. Multiplication never matches.
 *
 * The `(?<![/*])` guard keeps a COMMENT from reading as a division. A line
 * comment opener puts a slash immediately before its text, so `// 1000px …`
 * parsed as a division by 1000; a resizable-panel test comment was reported as
 * a byte formatter for exactly that reason. A block-comment closer does the
 * same with a star before the slash, so both openers are excluded.
 */
const BYTE_DIVISOR_RE = new RegExp(
  `(?:(?<![/*])\\/\\s*\\(?\\s*${BYTE_BASE_LITERAL}` +
    `|[<>]=?\\s*\\(?\\s*${BYTE_BASE_LITERAL})`,
);

/**
 * A NON-LITERAL scaled UP by a byte base — the GB-input idiom, `gb * 1024`.
 * Literal × literal (`80 * 1024 * 1024`) can never match: the left branch needs
 * an identifier or property before the `*`, and the right branch needs one
 * after it. That is the first of the two guards keeping capacity ceilings out.
 */
const BYTE_SCALE_MULTIPLY_RE = new RegExp(
  `(?:[A-Za-z_$][\\w$.\\]]*\\s*\\*\\s*${BYTE_BASE_LITERAL}` +
    `|${BYTE_BASE_LITERAL}\\s*\\*\\s*[A-Za-z_$])`,
);

/**
 * The line with its line comments and block comments removed. The multiply arm
 * asks for a unit label on the same line, and a byte CEILING very often
 * carries one in a trailing comment (`16 * 1024 * 1024; // 16 MB chunks`). A comment is
 * documentation, not a rendered label.
 */
function withoutComments(line) {
  return line.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/, " ");
}

/**
 * A callee whose NAME carries the unit — `formatGb(bytes / 1024 ** 3)`. The
 * exponent spellings (`1024 ** 2/3/4`) need no separate divisor pattern: they
 * are written with the literal 1024 and a division in front of it, so
 * BYTE_DIVISOR_RE already matches them. A self-test pins that.
 */
const UNIT_NAMED_CALLEE_RE =
  /\b[A-Za-z_$][\w$]*(?:[KkMmGgTt]i?[Bb])\s*\(/;

/**
 * A value whose NAME carries the unit — `sizeKb`, `totalMB`, `ramGiB`. Paired
 * with a byte division on the same line this needs no window: the identifier
 * IS the unit label, which is exactly why the hoisted single-unit idiom slipped
 * past the windowed rule. Requires an assignment or property position so a
 * mere mention (`props.sizeKb`) is not a definition.
 */
const UNIT_NAMED_VALUE_RE =
  /\b[\w$]*(?:[KkMmGgTt]i?[Bb])\s*(?::[^=]*)?=(?!=)/;

/**
 * The name a byte division is bound to on its own line: `const x =`, `x =`, or
 * the object property `x:`. Captures the name so the file can be asked whether
 * that name is later rendered beside a unit label.
 */
const BINDING_NAME_RES = [
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/,
  /^\s*([A-Za-z_$][\w$]*)\s*:/,
  /([A-Za-z_$][\w$]*)\s*=(?!=)/,
];

/** Names that are far too common to follow across a whole file. */
const UNFOLLOWABLE_NAMES = new Set(["i", "n", "x", "y", "v", "value", "result"]);

/**
 * Is `name` interpolated somewhere in this file immediately before a unit
 * label — `{memoryInfo.used}MB`, `{sizeKb} KB`? The interpolation may be a
 * bare name or a property access ending in it.
 */
function renderedBesideUnit(source, name) {
  if (UNFOLLOWABLE_NAMES.has(name)) return false;
  const re = new RegExp(
    String.raw`\{[^{}]*\b${name}\b[^{}]*\}\s*(?:[KMGT]i?B|B)\b`,
  );
  return re.test(source);
}

/**
 * Identifiers bound to a byte base in this file: `const k = 1024`,
 * `const MB = 1024 ** 2`, `let base = 1048576`. Returns the names, so a
 * division by one of them counts as a byte division.
 */
function byteBaseNames(source) {
  const re =
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*number\s*)?=\s*(?:1024\s*\*\*\s*[234]|1024|1048576|1073741824)\s*(?:;|$)/gm;
  const names = new Set();
  let m;
  while ((m = re.exec(source)) !== null) names.add(m[1]);
  return names;
}

/**
 * A division BY one of this file's byte-base identifiers — directly (`/ k`),
 * parenthesised (`/ (k * k)`), or through the call the real twin used:
 * `bytes / Math.pow(k, i)`. Matching only `/ k` would have missed the live
 * instance this arm exists for.
 */
function identifierDivisorRe(names) {
  if (names.size === 0) return null;
  const alternation = [...names]
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return new RegExp(
    String.raw`\/\s*(?:[A-Za-z_$][\w$.]*\s*\(\s*)?\(?\s*(?:${alternation})\b`,
  );
}

/**
 * How many lines on EITHER side of a hit may supply the unit label. The window
 * is bidirectional because the two idioms put the label on opposite sides: the
 * cascade style writes it after (`return `${n/1024} KB``), while the loop style
 * declares `const units = ["B","KB",…]` ABOVE the `while (n >= 1024)`. A
 * forward-only window missed every loop-style twin — six of them, including
 * `bytesHuman`, `humanSize` and the field-formats registry.
 */
const WINDOW = 6;

/**
 * Byte-size formatting findings in one file's source.
 * Returns [{ line, text }] — every place a byte count becomes a unit string.
 */
export function byteShapeIn(source) {
  const lines = source.split("\n");
  const identifierDivisor = identifierDivisorRe(byteBaseNames(source));
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const divides =
      BYTE_DIVISOR_RE.test(line) ||
      (identifierDivisor !== null && identifierDivisor.test(line));
    if (!divides) {
      // THE MULTIPLY-FROM-GB ARM: no division anywhere, because the body takes
      // GB/MB and scales UP. Needs BOTH a non-literal operand and a unit label
      // on this line outside any comment — see the header for why a capacity
      // ceiling fails both.
      if (
        BYTE_SCALE_MULTIPLY_RE.test(line) &&
        UNIT_LABEL_RE.test(withoutComments(line))
      ) {
        out.push({ line: i + 1, text: line.trim() });
      }
      continue;
    }
    // The single-unit form: the identifier carries the unit, so the label may
    // be anywhere — or nowhere at all, until it is typed into JSX far below.
    if (UNIT_NAMED_VALUE_RE.test(line) || UNIT_NAMED_CALLEE_RE.test(line)) {
      out.push({ line: i + 1, text: line.trim() });
      continue;
    }
    // The named-binding arm: follow what this division is bound to, and ask
    // the WHOLE FILE whether that name is rendered beside a unit label.
    let bound = false;
    for (const re of BINDING_NAME_RES) {
      const m = re.exec(line);
      if (m && renderedBesideUnit(source, m[1])) {
        bound = true;
        break;
      }
    }
    if (bound) {
      out.push({ line: i + 1, text: line.trim() });
      continue;
    }
    const window = lines
      .slice(Math.max(0, i - WINDOW), i + WINDOW + 1)
      .join("\n");
    if (!UNIT_LABEL_RE.test(window)) continue;
    out.push({ line: i + 1, text: line.trim() });
  }
  return out;
}

/** Proves the rule can fail and does not fire on a capacity constant. */
export function selfTestByteShape() {
  const planted = [
    "export function humanSize(bytes: number): string {",
    "  if (bytes < 1024) return `${bytes} B`;",
    "  return `${(bytes / 1024).toFixed(1)} KB`;",
    "}",
  ].join("\n");
  const found = byteShapeIn(planted);
  if (found.length === 0) {
    return { ok: false, why: "a planted byte-size body was NOT reported" };
  }
  const constants = [
    "const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;",
    "export const TUS_CHUNK_SIZE_BYTES = 16 * 1024 * 1024; // 16 MB chunks",
    "maxBuffer: 64 * 1024 * 1024,",
  ].join("\n");
  if (byteShapeIn(constants).length !== 0) {
    return { ok: false, why: "a capacity CONSTANT was reported as a formatter" };
  }
  const adopted = [
    'import { formatFileSize } from "@ai-matrx/kit/format";',
    "const label = formatFileSize(file.size);",
  ].join("\n");
  if (byteShapeIn(adopted).length !== 0) {
    return { ok: false, why: "an adopted call site was reported" };
  }
  // THE SINGLE-UNIT FORM: the unit is in the NAME and the label is forty-four
  // lines away in JSX. Nothing but the identifier can catch this.
  // Deliberately NO unit label anywhere in this fixture: in the real file it
  // was forty-four lines below, so a fixture that puts one nearby would be
  // caught by the windowed arm and would prove nothing about this one.
  const hoisted = ["  const sizeKb = (blob.size / 1024).toFixed(0);"].join("\n");
  if (byteShapeIn(hoisted).length === 0) {
    return {
      ok: false,
      why: "the hoisted single-unit form (`const sizeKb = blob.size / 1024`) was NOT reported",
    };
  }
  // …and a unit-named CONSTANT still escapes, because it multiplies.
  const namedCeiling = ["const maxUploadMb = 80 * 1024 * 1024;"].join("\n");
  if (byteShapeIn(namedCeiling).length !== 0) {
    return { ok: false, why: "a unit-named capacity CONSTANT was reported" };
  }
  // THE NAMED-BINDING ARM: the key says nothing (`used`) and the label is
  // forty-five lines away in JSX. Only following the binding sees this.
  //
  // THE LABEL MUST SIT OUTSIDE THE WINDOW, and this fixture was wrong until an
  // independent review caught it (2026-09-11): it placed `{memoryInfo.used}MB`
  // three lines below the division — inside WINDOW — so the pre-existing
  // windowed arm reported it and the arm under test was never exercised. The
  // reviewer stubbed `renderedBesideUnit` to `return false`, killing this whole
  // arm, and the self-test still printed PASSED. A proof that survives the
  // deletion of the thing it proves is worse than no proof. The filler below is
  // load-bearing: it puts the label WINDOW + 1 lines away so the windowed arm
  // cannot see it and only the whole-file binding follow can.
  const boundProperty = [
    "        setMemoryInfo({",
    "          used: Math.round(extendedPerf.memory.usedJSHeapSize / 1024 / 1024),",
    "        });",
    "      }",
    "    }, 1500);",
    "    return () => clearInterval(id);",
    "  }, []);",
    "",
    "  if (!open) return null;",
    "",
    "  return (",
    "    <span>{memoryInfo.used}MB / {memoryInfo.limit}MB</span>",
  ].join("\n");
  if (byteShapeIn(boundProperty).length === 0) {
    return {
      ok: false,
      why: "a byte division bound to an object property and rendered beside `MB` was NOT reported",
    };
  }
  // …and the fixture above must be reported ONLY by that arm. If the label ever
  // drifts back inside the window this check goes red, because a fixture whose
  // label the windowed arm can see proves nothing about the binding follow.
  {
    const lines = boundProperty.split("\n");
    const divisionLine = lines.findIndex((l) => l.includes("usedJSHeapSize"));
    const labelLine = lines.findIndex((l) => l.includes("memoryInfo.used"));
    if (labelLine - divisionLine <= WINDOW) {
      return {
        ok: false,
        why: "the named-binding fixture puts its unit label inside WINDOW, so the windowed arm catches it and the binding arm is never exercised",
      };
    }
  }
  // THE CALL-ARGUMENT ARM: no adjacent label, no unit-named binding — the
  // unit is in the CALLEE's name and the " GB" is in another module.
  const callArgument = [
    "              ? ` · ${formatGb(lora.size_bytes / 1024 ** 3)}`",
  ].join("\n");
  if (byteShapeIn(callArgument).length === 0) {
    return {
      ok: false,
      why: "a byte division handed to a unit-named callee (`formatGb(bytes / 1024 ** 3)`) was NOT reported",
    };
  }
  // …and the exponent spellings are covered by the divisor pattern itself.
  for (const exponent of ["1024 ** 2", "1024 ** 3", "1024 ** 4"]) {
    const line = `const label = \`\${(bytes / ${exponent}).toFixed(1)} GB\`;`;
    if (byteShapeIn(line).length === 0) {
      return { ok: false, why: `the \`${exponent}\` spelling was NOT reported` };
    }
  }
  // A call whose name has no unit is not a formatter by this arm.
  const plainCallee = ["scheduleUpload(file.size / 1024);"].join("\n");
  if (byteShapeIn(plainCallee).length !== 0) {
    return { ok: false, why: "a call with no unit in its name was reported" };
  }
  // THE IDENTIFIER-DIVISOR ARM: the base is bound to a name first, so the
  // literal-only divisor pattern never sees the division at all.
  // Verbatim shape of the live twin this arm exists for (matrx-frontend's
  // InlineUploadArea, 2026-09-11): the base is bound to `k` AND the division
  // goes through `Math.pow(k, i)`, so a rule matching only `/ k` sees nothing.
  const identifierDivisorBody = [
    "function formatBytes(bytes: number): string {",
    '  if (bytes === 0) return "0 B";',
    "  const k = 1024;",
    '  const sizes = ["B", "KB", "MB", "GB"];',
    "  const i = Math.floor(Math.log(bytes) / Math.log(k));",
    "  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;",
    "}",
  ].join("\n");
  if (byteShapeIn(identifierDivisorBody).length === 0) {
    return {
      ok: false,
      why: "a body dividing by an identifier bound to 1024 was NOT reported",
    };
  }
  // …and the same bound base with no unit anywhere is chunking, not display.
  const identifierDivisorChunking = [
    "const k = 1024;",
    "const chunks = Math.ceil(file.size / k);",
    "for (let i = 0; i < chunks; i += 1) upload(i);",
  ].join("\n");
  if (byteShapeIn(identifierDivisorChunking).length !== 0) {
    return {
      ok: false,
      why: "an identifier divisor with no unit evidence anywhere was reported",
    };
  }
  // …and an identifier bound to something that is NOT a byte base is not a
  // divisor at all.
  const unrelatedDivisor = [
    "const perMinute = 60;",
    "const rate = `${(events / perMinute).toFixed(1)} B`;",
  ].join("\n");
  if (byteShapeIn(unrelatedDivisor).length !== 0) {
    return { ok: false, why: "a non-byte identifier divisor was reported" };
  }
  // THE DECIMAL (SI) FAMILY: the same capability with the wrong divisor. Each
  // of these was a LIVE twin the binary-only rule returned zero findings on.
  const decimalBodies = [
    ["const mb = m.value / 1_000_000;", '  return `${mb.toFixed(1)} MB`;'],
    ["{Math.round(result.meta.content_length / 1000)}KB content"],
    ["{Math.ceil(effectiveContent.length / 1000)} KB"],
    ['const mbTotal = `/ ${(p.total_bytes / 1e6).toFixed(0)} MB`;'],
    ['const gb = `${(n / 1e9).toFixed(1)} GB`;'],
  ];
  for (const body of decimalBodies) {
    if (byteShapeIn(body.join("\n")).length === 0) {
      return {
        ok: false,
        why: `a DECIMAL byte body was NOT reported: ${body[0].trim()}`,
      };
    }
  }
  // …and the decimal widening must not swallow the neighbouring literals. A
  // divisor of 10000 is not 1000, and 10240 is not 1024.
  const neighbouringDivisors = [
    'const pct = `${(n / 10000).toFixed(1)} B`;',
    'const blocks = `${(n / 10240).toFixed(1)} KB`;',
  ].join("\n");
  if (byteShapeIn(neighbouringDivisors).length !== 0) {
    return { ok: false, why: "a divisor of 10000 / 10240 was read as 1000 / 1024" };
  }
  // …and a COMMENT is not a division. `// 1000px` puts a slash immediately
  // before the number; a resizable-panel test comment was reported for it.
  const commentedNumber = [
    '  const half = bounds.width * 0.075;',
    "  // 1000px: minSize 200px is now 20%, so a 7.5% restore is below half of",
    '  // it and must clamp. Sizes are in %, bytes are not involved. B.',
  ].join("\n");
  if (byteShapeIn(commentedNumber).length !== 0) {
    return { ok: false, why: "a `//` comment before a number was read as a division" };
  }

  // THE MULTIPLY-FROM-GB ARM: the body takes GIGABYTES and scales UP, so no
  // division exists anywhere in it. matrx-local's `fmtSize` is verbatim this.
  const multiplyFromGb = [
    "function fmtSize(gb: number): string {",
    "  if (gb < 1) return `${Math.round(gb * 1024)} MB`;",
    "  return `${gb.toFixed(1)} GB`;",
    "}",
  ].join("\n");
  if (byteShapeIn(multiplyFromGb).length === 0) {
    return {
      ok: false,
      why: "a GB-input body that MULTIPLIES (`${Math.round(gb * 1024)} MB`) was NOT reported",
    };
  }
  // …and THE ASYMMETRY THAT MAKES THE RULE USABLE still holds, in both of its
  // halves. A capacity ceiling computed from a VARIABLE fails the operand test
  // only if it also fails the label test, so both are pinned here.
  const variableCeilings = [
    "const MAX_SIZE_MB = 8;",
    "if (file.size > MAX_SIZE_MB * 1024 * 1024) {",
    "  toast.error('Too large');",
    "}",
    "const maxBytes = limitMb * 1024 * 1024; // 25 MB ceiling",
    "const buffer = chunkCount * 1000;",
  ].join("\n");
  if (byteShapeIn(variableCeilings).length !== 0) {
    return {
      ok: false,
      why: "a capacity ceiling scaled from a variable was reported as a formatter",
    };
  }
  // …and the ADOPTED conversion feeding the package formatter is not a twin:
  // `formatFileSize(gb * 1024 ** 3)` is the collapsed form this rule asks for.
  const adoptedConversion = [
    "  // Sizes arrive in GB; THE package formatter takes BYTES and picks the unit.",
    "  const fmtStorage = (gb: number) => formatFileSize(gb * 1024 ** 3);",
    "  const formatRam = (mb: number) => formatFileSize(mb * 1024 * 1024);",
  ].join("\n");
  if (byteShapeIn(adoptedConversion).length !== 0) {
    return {
      ok: false,
      why: "the adopted `formatFileSize(gb * 1024 ** 3)` conversion was reported as a twin",
    };
  }

  // A bound name that is NEVER rendered beside a unit is arithmetic, not a
  // formatter, and must stay silent.
  const boundButUnlabelled = [
    "const chunks = Math.ceil(file.size / 1024);",
    "for (let i = 0; i < chunks; i += 1) upload(i);",
  ].join("\n");
  if (byteShapeIn(boundButUnlabelled).length !== 0) {
    return { ok: false, why: "a bound name never rendered beside a unit was reported" };
  }
  return { ok: true };
}
