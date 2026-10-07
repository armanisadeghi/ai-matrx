"""AP-0 lane B converter: old applet prop contract -> Applet hooks (@ai-matrx/applets/react).

Legacy code apps: the default-exported component's props (onExecute, response, isStreaming, ...) are
removed and the same names are derived from useJob("main") inside the body; every markdown render of
`response` becomes <JobOutput job={job} />. Stock apps (chat/form shells, empty or stub code) get one
generated form file from their variable definitions.
"""
import json, re, sys

APPLETS = 'import { useJob, JobOutput } from "@ai-matrx/applets/react";\n'
MD_MODULES = ("@/components/MarkdownStream", "@/components/Markdown", "@/components/markdown", "@/components/mardown")
LEGACY = ["onExecute", "response", "isStreaming", "isExecuting", "error", "rateLimitInfo", "appName", "appTagline",
          "appCategory", "conversationId", "onResetConversation", "initialVariables", "isReopenedRun", "streamEvents"]

def js(v):
    return json.dumps(v, ensure_ascii=False)

def match_paren(s, i):
    depth = 0
    for j in range(i, len(s)):
        c = s[j]
        if c in "({[": depth += 1
        elif c in ")}]":
            depth -= 1
            if depth == 0: return j
    raise ValueError("unbalanced")

def convert_legacy(src, row):
    notes = []
    m = re.search(r"export\s+default\s+function\s+(\w+)\s*\(", src)
    if not m: raise ValueError("no `export default function`")
    p0 = m.end() - 1
    p1 = match_paren(src, p0)
    params = src[p0 + 1:p1]
    names = set(re.findall(r"\b(" + "|".join(LEGACY) + r")\b", params))
    # find the body's opening brace (skip an optional return type)
    b = src.index("{", p1)
    body_start = b + 1
    # markdown default-import names
    md_names = []
    for mm in re.finditer(r"import\s+(\w+)\s*(?:,\s*\{[^}]*\})?\s*from\s*['\"]([^'\"]+)['\"];?\n?", src):
        if mm.group(2) in MD_MODULES: md_names.append(mm.group(1))
    for mm in re.finditer(r"import\s*\{([^}]*)\}\s*from\s*['\"]([^'\"]+)['\"]", src):
        if mm.group(2) in MD_MODULES:
            md_names += [x.strip().split(" as ")[-1].strip() for x in mm.group(1).split(",") if x.strip()]
    head, body = src[:body_start], src[body_start:]
    replaced = 0
    out_parts = []; i = 0
    for mm in re.finditer(r"<([A-Z]\w*)\b", body):
        if mm.start() < i: continue
        # scan to the end of this opening tag, brace-aware
        j = mm.end(); depth = 0
        while j < len(body):
            c = body[j]
            if c == "{": depth += 1
            elif c == "}": depth -= 1
            elif depth == 0 and c == ">": break
            j += 1
        tag = body[mm.start():j + 1]
        if re.search(r"\bcontent=\{\s*response\s*\}", tag) and tag.endswith("/>"):
            out_parts.append(body[i:mm.start()]); out_parts.append('<JobOutput job={job} label={appName} />')
            i = j + 1; replaced += 1
    out_parts.append(body[i:]); body = "".join(out_parts)
    if replaced == 0:
        k = body.rfind("</div>")
        if k < 0: raise ValueError("no markdown render of `response` and no root </div> to place <JobOutput>")
        body = body[:k] + '  <JobOutput job={job} label={appName} />\n    ' + body[k:]
        notes.append("no markdown render of `response`: <JobOutput> placed at the end of the root")
    still_md = any(re.search(r"<" + n + r"\b", body) for n in md_names)
    # what else reads `response`
    code_only = re.sub(r"//[^\n]*|/\*.*?\*/|\"(?:[^\"\\\n]|\\.)*\"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`", "", body, flags=re.S)
    code_only = re.sub(r">[^<>{}]*<", "><", code_only)  # JSX text
    text_reads = bool(re.search(r"\bresponse\s*(\.|\[(?!\]))", code_only)) or bool(re.search(r"\(\s*response\s*\)", code_only))
    pre = ['  const job = useJob("main");',
           '  const appName = ' + js(row["name"]) + ';']
    if "appTagline" in names: pre.append('  const appTagline = ' + js(row.get("tagline")) + ';')
    if "appCategory" in names: pre.append('  const appCategory = ' + js(row.get("category")) + ';')
    if "onExecute" in names:
        pre.append('  const onExecute = async (variables, userInput) => {\n'
                   '    await job.run(variables, userInput ? { userInput } : undefined);\n  };')
    if "isExecuting" in names: pre.append('  const isExecuting = job.status === "resolving";')
    if "isStreaming" in names: pre.append('  const isStreaming = job.status === "running" || job.status === "needs_input";')
    if "error" in names: pre.append('  const error = job.error ? { type: "The run failed", message: job.error.message } : null;')
    if "rateLimitInfo" in names: pre.append('  const rateLimitInfo = null;')
    if "conversationId" in names: pre.append('  const conversationId = job.ref ? job.ref.conversationId : null;')
    if "initialVariables" in names: pre.append('  const initialVariables = undefined;')
    if "isReopenedRun" in names: pre.append('  const isReopenedRun = false;')
    if "streamEvents" in names: pre.append('  const streamEvents = [];')
    if "onResetConversation" in names:
        pre.append('  const onResetConversation = undefined;')
        notes.append("onResetConversation has no hook twin; set undefined")
    if "response" in names:
        if text_reads:
            pre.append('  const response = job.text;')
            notes.append("PARSES response text (job.text) — custom display beside <JobOutput>")
        else:
            pre.append('  const response = job.status !== "idle";')
    head = head[:p0 + 1] + head[p1:]  # drop props
    out = head + "\n" + "\n".join(pre) + "\n" + body
    if not still_md:
        out = re.sub(r"import\s+\w+\s*from\s*['\"](?:" + "|".join(re.escape(x) for x in MD_MODULES) + r")['\"];?\n", "", out)
    else:
        notes.append("markdown component still used for non-run content")
    out = APPLETS + out
    leftovers = [n for n in LEGACY if n in names and n not in ("onExecute",)]
    return out, notes

def field_ui(defs):
    """defs: [{name,label,help,default,options,required,multiline}]"""
    return defs

STOCK = r'''import React, { useState } from "react";
import { Button, Field, Select, Textarea } from "@ai-matrx/design-system/controls";
import { useJob, JobOutput } from "@ai-matrx/applets/react";

const APP_NAME = __NAME__;
const FIELDS = __FIELDS__;
const TAKES_MESSAGE = __MESSAGE__;

function initialValues() {
  const values = {};
  for (const f of FIELDS) values[f.name] = f.default ?? "";
  return values;
}

export default function App() {
  const job = useJob("main");
  const [values, setValues] = useState(initialValues);
  const [message, setMessage] = useState("");
  const busy = job.status === "resolving" || job.status === "running";
  const missing = FIELDS.some((f) => f.required && !String(values[f.name] ?? "").trim()) || (TAKES_MESSAGE && FIELDS.length === 0 && !message.trim());
  const set = (name, value) => setValues((prev) => ({ ...prev, [name]: value }));
  const submit = async () => {
    if (missing || busy) return;
    await job.run(values, TAKES_MESSAGE && message.trim() ? { userInput: message.trim() } : undefined);
  };
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-lg font-semibold">{APP_NAME}</h1>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {FIELDS.map((f) => (
          <label key={f.name} className="block space-y-1">
            <span className="text-sm font-medium">{f.label}</span>
            {f.options ? (
              <Select aria-label={f.label} value={String(values[f.name] ?? "")} options={f.options.map((o) => ({ value: o, label: o }))} onValueChange={(v) => set(f.name, v)} disabled={busy} />
            ) : f.multiline ? (
              <Textarea value={String(values[f.name] ?? "")} placeholder={f.help ?? ""} rows={4} onChange={(e) => set(f.name, e.target.value)} disabled={busy} />
            ) : (
              <Field value={String(values[f.name] ?? "")} placeholder={f.help ?? ""} onChange={(e) => set(f.name, e.target.value)} disabled={busy} />
            )}
          </label>
        ))}
        {TAKES_MESSAGE ? (
          <label className="block space-y-1">
            <span className="text-sm font-medium">Message</span>
            <Textarea value={message} rows={3} onChange={(e) => setMessage(e.target.value)} disabled={busy} />
          </label>
        ) : null}
        <Button type="submit" variant="primary" disabled={missing || busy}>
          Run
        </Button>
      </form>
      <JobOutput job={job} label={APP_NAME} />
    </div>
  );
}
'''

def humanize(n):
    return n.replace("_", " ").strip().capitalize()

def stock(row, var_defs, takes_message):
    fields = []
    for d in var_defs or []:
        name = d.get("name")
        if not name: continue
        cc = d.get("customComponent") or {}
        opts = cc.get("options") if cc.get("type") in ("select", "radio", "toggle") else None
        default = d.get("defaultValue", d.get("default", ""))
        if opts and default and default not in opts: opts = [default] + list(opts)
        fields.append({"name": name, "label": d.get("label") or humanize(name), "help": d.get("helpText") or None,
                       "default": default if default is not None else "", "required": bool(d.get("required")),
                       "options": opts, "multiline": cc.get("type") == "textarea" or len(str(default or "")) > 60 or name in ("transcript", "claim", "page_content")})
    return (STOCK.replace("__NAME__", js(row["name"])).replace("__FIELDS__", json.dumps(fields, ensure_ascii=False, indent=2))
            .replace("__MESSAGE__", "true" if takes_message else "false"))
