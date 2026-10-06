// UI drift census — AST walk over every tracked .tsx (tests excluded).
// Classifies each shared-primitive call site as compliant / placement-only /
// overridden / passthrough, plus icon sizing, raw elements, arbitrary values and
// scale sprawl. Evidence base for docs/ui-drift-audit.md and the ratchet in
// docs/ui-unification-plan.md.  Usage: node scripts/ui-drift/census.cjs . out.json
const ts = require(require.resolve("typescript", { paths: [process.argv[2]] }));
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = process.argv[2];
const OUT = process.argv[3];

const files = execSync("git ls-files '*.tsx'", { cwd: ROOT, encoding: "utf8", maxBuffer: 512 << 20 })
  .split("\n")
  .filter(Boolean)
  .filter((f) => !/\.(test|spec|stories)\.tsx$/.test(f) && !f.includes("__tests__") && !f.startsWith("node_modules"));

// ---- primitive map: imported name -> category ----
const PRIM = {
  Button: "Button",
  IconButton: "IconButton",
  Input: "Input",
  Textarea: "Textarea",
  SelectTrigger: "Select", SelectContent: "Select", SelectItem: "Select",
  CommandInput: "Combobox", CommandItem: "Combobox", CommandList: "Combobox",
  DropdownMenuContent: "DropdownMenu", DropdownMenuItem: "DropdownMenu", DropdownMenuTrigger: "DropdownMenu",
  DialogContent: "Dialog", DialogHeader: "Dialog", DialogFooter: "Dialog", DialogTitle: "Dialog", DialogDescription: "Dialog",
  AlertDialogContent: "Dialog", AlertDialogFooter: "Dialog", AlertDialogTitle: "Dialog",
  SheetContent: "Sheet", SheetHeader: "Sheet", SheetTitle: "Sheet",
  DrawerContent: "Sheet", DrawerHeader: "Sheet", DrawerTitle: "Sheet",
  Card: "Card", CardContent: "Card", CardHeader: "Card", CardTitle: "Card", CardDescription: "Card", CardFooter: "Card",
  Table: "Table", TableRow: "Table", TableCell: "Table", TableHead: "Table", TableHeader: "Table", TableBody: "Table",
  Tabs: "Tabs", TabsList: "Tabs", TabsTrigger: "Tabs", TabsContent: "Tabs",
  TooltipContent: "Tooltip", PopoverContent: "Popover", HoverCardContent: "Popover",
  Badge: "Badge",
  Label: "Label",
  Switch: "Switch", Checkbox: "Checkbox",
  Skeleton: "Loading",
};
function isPrimitiveModule(src) {
  return (
    src === "@ai-matrx/design-system" ||
    src.startsWith("@ai-matrx/design-system/") ||
    /(^|\/)components\/ui\//.test(src) ||
    /^@\/components\/official\/IconButton$/.test(src) ||
    /^\.\.?\/.*(ui|official)\/[a-z-]+$/i.test(src)
  );
}

// ---- class token classification ----
function stripVariants(tok) {
  // remove variant prefixes (sm:, hover:, dark:, data-[x]:, [&_svg]:, group-hover:)
  let t = tok;
  const parts = [];
  let depth = 0, cur = "";
  for (const ch of t) {
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (ch === ":" && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  const base = cur;
  return { base: base.replace(/^!/, "").replace(/!$/, ""), variants: parts };
}
const PLACEMENT = /^(-?m[trblxyse]?-|w-full$|w-auto$|w-fit$|min-w-0$|flex-1$|flex-auto$|flex-none$|shrink|grow|self-|justify-self-|place-self-|order-|col-|row-|ml-auto$|mr-auto$|mx-auto$|absolute$|relative$|fixed$|sticky$|static$|inset-|top-|bottom-|left-|right-|z-|hidden$|block$|inline-block$|inline-flex$|flex$|grid$|contents$|basis-|cursor-|pointer-events-|select-|sr-only$|not-sr-only$|overflow-|truncate$|transition|duration-|ease-|animate-|group$|peer$|isolate$|aspect-|origin-|translate-|rotate-|scale-|touch-|will-change|line-clamp|break-|whitespace-|text-left$|text-center$|text-right$|text-start$|text-end$|items-|justify-|content-|flex-col|flex-row|flex-wrap|flex-nowrap|outline-none$|focus-visible|visible$|invisible$|opacity-0$|opacity-100$)/;
function category(base) {
  if (base.includes("[") && /-\[|^\[/.test(base)) {
    // arbitrary value — still categorise by prefix but flag
  }
  if (PLACEMENT.test(base)) return "placement";
  if (/^(p[trblxyse]?-|gap-|gap-x-|gap-y-|space-[xy]-)/.test(base)) return "spacing";
  if (/^(h-|min-h-|max-h-|size-|w-|min-w-|max-w-)/.test(base)) return "size";
  if (/^rounded/.test(base)) return "radius";
  if (/^(shadow|drop-shadow)/.test(base)) return "shadow";
  if (/^(text-(xs|sm|base|lg|xl|[2-9]xl|\[\d)|font-|leading-|tracking-|uppercase$|lowercase$|capitalize$|italic$|underline|no-underline|normal-case$|tabular-nums$|font$)/.test(base)) return "typography";
  if (/^(border(-[trblxyse])?(-\d+)?$|border-(dashed|dotted|solid|none|double)$|ring-\d|ring$|ring-inset|ring-offset-\d|outline(-\d)?$|divide-[xy])/.test(base)) return "border";
  if (/^(bg-|text-|border-|ring-|fill-|stroke-|from-|to-|via-|placeholder-|decoration-|caret-|accent-|divide-|outline-|shadow-|opacity-|backdrop-|mix-blend|bg$)/.test(base)) return "color";
  return "other";
}
const VISUAL = new Set(["spacing", "size", "radius", "shadow", "typography", "border", "color"]);

// ---- static class extraction from an expression ----
function collectStrings(node, out) {
  if (!node) return;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) { out.push(node.text); return; }
  if (ts.isTemplateExpression(node)) {
    out.push(node.head.text);
    node.templateSpans.forEach((s) => { collectStrings(s.expression, out); out.push(s.literal.text); });
    return;
  }
  if (ts.isJsxExpression(node)) return collectStrings(node.expression, out);
  ts.forEachChild(node, (c) => collectStrings(c, out));
}
function isDynamicOnly(expr) {
  const s = [];
  collectStrings(expr, s);
  return s.join("").trim() === "";
}
function tokens(strs) {
  return strs.join(" ").split(/\s+/).filter((t) => t && /^[!a-z0-9\[\-@&_:.\/\]%#()'",>=*+~]+$/i.test(t) && /[a-z]/i.test(t));
}

// ---- accumulators ----
const prim = {}; // category -> stats
function pstat(cat) {
  return (prim[cat] ||= { total: 0, compliant: 0, placementOnly: 0, overridden: 0, passthrough: 0, byCat: {}, classes: {}, dirs: {}, examples: [] });
}
const scale = { padding: {}, gap: {}, space: {}, textSize: {}, fontWeight: {}, radius: {}, shadow: {}, height: {}, leading: {}, tracking: {} };
const arbitrary = {}; let arbitraryTotal = 0;
const hexInClass = []; let hexInStyleCount = 0; let inlineStyleCount = 0;
const hexAny = { count: 0, files: new Set() };
const raw = { button: 0, input: 0, select: 0, textarea: 0, table: 0, dialog: 0, a: 0 };
const rawStyled = { button: 0, input: 0, select: 0, textarea: 0, table: 0 };
const rawDirs = {};
const icons = { total: 0, sizeByClass: 0, sizeByProp: 0, sizeNone: 0, sizes: {}, strokeWidth: {}, colorByClass: 0, insideButton: 0, insideButtonSized: 0 };
const btnWrappers = { count: 0, examples: [] };
const dirStats = {};
function dirKey(f) {
  const p = f.split("/");
  if (p[0] === "features") return `features/${p[1]}`;
  if (p[0] === "app") return `app/${p[1]}${p[2] && !p[2].includes(".") ? "/" + p[2] : ""}`;
  if (p[0] === "components") return `components/${p[1]}`;
  return p[0];
}
function ds(f) { return (dirStats[dirKey(f)] ||= { files: 0, primSites: 0, overridden: 0, rawButton: 0, rawInput: 0, arbitrary: 0, hex: 0, style: 0 }); }

const SCALE_RE = {
  padding: /^p[trblxyse]?-(.+)$/, gap: /^gap(-[xy])?-(.+)$/, space: /^space-[xy]-(.+)$/,
  textSize: /^text-(xs|sm|base|lg|xl|[2-9]xl|\[.+\])$/, fontWeight: /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/,
  radius: /^rounded(-[trblse]{1,2})?(-.+)?$/, shadow: /^shadow(-.+)?$/, height: /^h-(.+)$/, leading: /^leading-(.+)$/, tracking: /^tracking-(.+)$/,
};
function recordScale(tok) {
  const { base } = stripVariants(tok);
  for (const [k, re] of Object.entries(SCALE_RE)) {
    if (re.test(base)) { scale[k][base] = (scale[k][base] || 0) + 1; }
  }
}

let lucideNames;
for (const f of files) {
  const abs = path.join(ROOT, f);
  let text;
  try { text = fs.readFileSync(abs, "utf8"); } catch { continue; }
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const d = ds(f); d.files++;
  const local = {}; // localName -> {cat, src}
  const lucide = new Set();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause) continue;
    const src = st.moduleSpecifier.text;
    const nb = st.importClause.namedBindings;
    if (src === "lucide-react" || src.startsWith("lucide-react/")) {
      if (nb && ts.isNamedImports(nb)) nb.elements.forEach((e) => lucide.add(e.name.text));
      if (st.importClause.name) lucide.add(st.importClause.name.text);
      continue;
    }
    if (!isPrimitiveModule(src)) continue;
    if (nb && ts.isNamedImports(nb)) {
      nb.elements.forEach((e) => {
        const imported = (e.propertyName || e.name).text;
        if (PRIM[imported]) local[e.name.text] = { cat: PRIM[imported], name: imported, src };
      });
    }
    if (st.importClause.name) {
      const n = st.importClause.name.text;
      if (PRIM[n]) local[n] = { cat: PRIM[n], name: n, src };
    }
  }
  const isDefLayer = /^components\/(ui|official)\//.test(f);
  // hex anywhere in file (strings) — rough
  const hexMatches = text.match(/["'`\s(\[]#[0-9a-fA-F]{3,8}\b/g);
  if (hexMatches) { hexAny.count += hexMatches.length; hexAny.files.add(f); d.hex += hexMatches.length; }

  function lineOf(n) { return sf.getLineAndCharacterOfPosition(n.getStart()).line + 1; }

  function handleClassExpr(strs, f, n) {
    const toks = tokens(strs);
    for (const t of toks) {
      recordScale(t);
      const { base } = stripVariants(t);
      if (/-\[[^\]]+\]|^\[[^\]]+\]/.test(base)) {
        arbitraryTotal++; d.arbitrary++;
        arbitrary[base] = (arbitrary[base] || 0) + 1;
      }
      if (/#[0-9a-fA-F]{3,8}/.test(t)) hexInClass.push(`${f}:${lineOf(n)} ${t}`);
    }
    return toks;
  }

  function visit(node, ancestors) {
    // class strings in cn()/clsx()/cva()/twMerge() calls anywhere
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^(cn|clsx|cva|twMerge|classNames|cx)$/.test(node.expression.text)) {
      // handled via className attrs where possible; still record scale for cva/standalone
      if (node.expression.text === "cva") { const s = []; collectStrings(node, s); handleClassExpr(s, f, node); }
    }
    if (ts.isJsxAttribute(node) && node.name && node.name.getText() === "style") inlineStyleCount++, d.style++;
    if (ts.isJsxAttribute(node) && node.name && node.name.getText() === "style") {
      const s = node.initializer ? node.initializer.getText() : "";
      if (/#[0-9a-fA-F]{3,8}/.test(s)) hexInStyleCount++;
    }
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const open = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = open.tagName.getText();
      const attrs = open.attributes.properties;
      const classAttr = attrs.find((a) => ts.isJsxAttribute(a) && a.name.getText() === "className");
      let toks = [];
      let dynamic = false;
      if (classAttr && classAttr.initializer) {
        const s = [];
        collectStrings(classAttr.initializer, s);
        toks = handleClassExpr(s, f, open);
        dynamic = toks.length === 0;
      }
      // raw intrinsics
      if (/^(button|input|select|textarea|table|dialog|a)$/.test(tag)) {
        raw[tag]++;
        if (tag !== "a" && tag !== "dialog" && toks.some((t) => VISUAL.has(category(stripVariants(t).base)))) rawStyled[tag]++;
        if (tag === "button") d.rawButton++;
        if (tag === "input") {
          const typeAttr = attrs.find((a) => ts.isJsxAttribute(a) && a.name.getText() === "type");
          const ty = typeAttr && typeAttr.initializer && ts.isStringLiteral(typeAttr.initializer) ? typeAttr.initializer.text : "text";
          if (!["hidden", "file", "checkbox", "radio", "range", "color"].includes(ty)) d.rawInput++;
        }
        (rawDirs[dirKey(f)] ||= { button: 0, input: 0, select: 0, textarea: 0, table: 0 });
        if (rawDirs[dirKey(f)][tag] !== undefined) rawDirs[dirKey(f)][tag]++;
      }
      // primitive call sites
      const p = local[tag];
      if (p && !isDefLayer) {
        const s = pstat(p.cat);
        s.total++; d.primSites++;
        const sub = (s.sub ||= {}); sub[p.name] = (sub[p.name] || 0) + 1;
        const sizeA = attrs.find((a) => ts.isJsxAttribute(a) && a.name.getText() === "size");
        const varA = attrs.find((a) => ts.isJsxAttribute(a) && a.name.getText() === "variant");
        const sv = sizeA ? (sizeA.initializer ? sizeA.initializer.getText().replace(/["{}]/g, "") : "true") : "(none)";
        const vv = varA ? (varA.initializer ? varA.initializer.getText().replace(/["{}]/g, "") : "true") : "(none)";
        const hTok = toks.map((t) => stripVariants(t)).filter((x) => x.variants.length === 0 && /^(h-|size-)/.test(x.base)).map((x) => x.base)[0] || "-";
        const sx = (s.sizeXheight ||= {}); const kk = `${p.name} size=${sv} h=${hTok}`; sx[kk] = (sx[kk] || 0) + 1;
        const vx = (s.variantUse ||= {}); const vk = `${p.name} variant=${vv}`; vx[vk] = (vx[vk] || 0) + 1;
        if (!classAttr) s.compliant++;
        else if (dynamic) s.passthrough++;
        else {
          const cats = new Set();
          const visualToks = [];
          for (const t of toks) {
            const c = category(stripVariants(t).base);
            if (VISUAL.has(c)) { cats.add(c); visualToks.push(t); }
          }
          if (cats.size === 0) s.placementOnly++;
          else {
            s.overridden++; d.overridden++;
            for (const c of cats) s.byCat[c] = (s.byCat[c] || 0) + 1;
            for (const t of visualToks) { const k = `${p.name} ${t}`; s.classes[k] = (s.classes[k] || 0) + 1; }
            s.dirs[dirKey(f)] = (s.dirs[dirKey(f)] || 0) + 1;
            if (s.examples.length < 400) s.examples.push(`${f}:${lineOf(open)} <${p.name} className="${visualToks.join(" ")}">`);
          }
        }
        // Button children analysis
        if ((p.cat === "Button" || p.cat === "IconButton") && ts.isJsxElement(node)) {
          for (const ch of node.children) {
            if (ts.isJsxElement(ch) || ts.isJsxSelfClosingElement(ch)) {
              const o = ts.isJsxElement(ch) ? ch.openingElement : ch;
              const ctag = o.tagName.getText();
              const cc = o.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText() === "className");
              const cs = []; if (cc && cc.initializer) collectStrings(cc.initializer, cs);
              const ctoks = tokens(cs);
              if ((ctag === "span" || ctag === "div") && ctoks.some((t) => /^(p[trblxy]?-|h-|w-|size-|rounded|bg-|border)/.test(stripVariants(t).base))) {
                btnWrappers.count++;
                if (btnWrappers.examples.length < 60) btnWrappers.examples.push(`${f}:${lineOf(o)} <${p.name}><${ctag} className="${ctoks.join(" ")}">`);
              }
            }
          }
        }
      }
      // lucide icons
      if (lucide.has(tag)) {
        icons.total++;
        const sizeAttr = attrs.find((a) => ts.isJsxAttribute(a) && a.name.getText() === "size");
        const swAttr = attrs.find((a) => ts.isJsxAttribute(a) && a.name.getText() === "strokeWidth");
        if (swAttr) { const v = swAttr.initializer ? swAttr.initializer.getText().replace(/[{}"]/g, "") : "?"; icons.strokeWidth[v] = (icons.strokeWidth[v] || 0) + 1; }
        const sizeToks = toks.filter((t) => /^(h-|w-|size-)/.test(stripVariants(t).base));
        if (sizeToks.length) {
          icons.sizeByClass++;
          const key = sizeToks.map((t) => stripVariants(t).base).filter((b) => !/^w-/.test(b) || !sizeToks.some((x) => /^h-/.test(stripVariants(x).base))).sort().join(" ");
          icons.sizes[key] = (icons.sizes[key] || 0) + 1;
        } else if (sizeAttr) { icons.sizeByProp++; const v = sizeAttr.initializer ? "size=" + sizeAttr.initializer.getText().replace(/[{}"]/g, "") : "size"; icons.sizes[v] = (icons.sizes[v] || 0) + 1; }
        else icons.sizeNone++;
        if (toks.some((t) => /^text-(?!xs|sm|base|lg|xl|\d)/.test(stripVariants(t).base))) icons.colorByClass++;
        const parent = ancestors[ancestors.length - 1];
        if (parent && (ts.isJsxElement(parent))) {
          const ptag = parent.openingElement.tagName.getText();
          if ((local[ptag] && (local[ptag].cat === "Button" || local[ptag].cat === "IconButton")) || ptag === "button") {
            icons.insideButton++;
            if (sizeToks.length || sizeAttr) icons.insideButtonSized++;
            if (ptag !== "button") { icons.insidePrimButton = (icons.insidePrimButton||0)+1; if (sizeToks.length || sizeAttr) { icons.insidePrimButtonSized=(icons.insidePrimButtonSized||0)+1; const k2 = sizeToks.map((t)=>stripVariants(t).base).join(" ") || "prop"; (icons.primBtnSizes ||= {})[k2]=((icons.primBtnSizes||{})[k2]||0)+1; } }
          }
        }
      }
    }
    ancestors.push(node);
    ts.forEachChild(node, (c) => visit(c, ancestors));
    ancestors.pop();
  }
  visit(sf, []);
}

function top(o, n) { return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n); }
const out = {
  fileCount: files.length,
  primitives: Object.fromEntries(Object.entries(prim).map(([k, v]) => [k, { ...v, classes: top(v.classes, 40), sizeXheight: top(v.sizeXheight||{}, 40), variantUse: top(v.variantUse||{}, 20), dirs: top(v.dirs, 15), examples: v.examples }])),
  scale: Object.fromEntries(Object.entries(scale).map(([k, v]) => [k, { distinct: Object.keys(v).length, top: top(v, 60) }])),
  arbitrary: { total: arbitraryTotal, distinct: Object.keys(arbitrary).length, top: top(arbitrary, 80) },
  hexInClass: { count: hexInClass.length, examples: hexInClass.slice(0, 40) },
  hexInStyleCount, inlineStyleCount, hexAnyStringCount: hexAny.count, hexAnyFiles: hexAny.files.size,
  raw, rawStyled, rawDirsTop: top(Object.fromEntries(Object.entries(rawDirs).map(([k, v]) => [k, v.button + v.input + v.select + v.textarea + v.table])), 30).map(([k]) => [k, rawDirs[k]]),
  icons: { ...icons, primBtnSizes: top(icons.primBtnSizes||{}, 15), sizes: top(icons.sizes, 40), strokeWidth: top(icons.strokeWidth, 20) },
  btnWrappers,
  dirStats: Object.entries(dirStats).filter(([, v]) => v.files >= 8).map(([k, v]) => ({ dir: k, ...v, overrideRate: v.primSites ? +(v.overridden / v.primSites).toFixed(2) : 0, perFile: +((v.rawButton + v.rawInput + v.arbitrary + v.hex) / v.files).toFixed(2) })).sort((a, b) => b.perFile - a.perFile),
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log("done", files.length);
