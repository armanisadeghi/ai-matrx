/**
 * Print layouts for the structured artifact types — one per type, registered
 * under the artifact type AND its `__kind` slugs (registerStructuredPrinters).
 *
 * Every layout reads EVERY stored shape of its type (canvas_items rows on
 * 2026-10-08): the kind value object (`{__kind:"timeline",…}`), its JSON text,
 * the legacy wrapped JSON (`{"comparison":{…}}`, `{"decision_tree":{…}}`) and
 * the legacy markdown body (through the SAME parser the block renders with).
 * Data it cannot read returns null, so the default path prints instead —
 * never a "no data" page.
 */

import type { PrintBlockContext } from "@ai-matrx/print/core";
import { parseComparisonJSON } from "@/components/mardown-display/blocks/comparison/parseComparisonJSON";
import { parseDecisionTreeJSON } from "@/components/mardown-display/blocks/decision-tree/parseDecisionTreeJSON";
import { parseTimelineMarkdown } from "@/components/mardown-display/blocks/timeline/parseTimelineMarkdown";
import { parseResearchMarkdown } from "@/components/mardown-display/blocks/research/parseResearchMarkdown";
import { parseResourcesMarkdown } from "@/components/mardown-display/blocks/resources/parseResourcesMarkdown";
import { parseProgressMarkdown } from "@/components/mardown-display/blocks/progress/parseProgressMarkdown";
import { parseTroubleshootingMarkdown } from "@/components/mardown-display/blocks/troubleshooting/parseTroubleshootingMarkdown";
import { parseRecipeMarkdown } from "@/components/mardown-display/blocks/cooking-recipes/parseRecipeMarkdown";
import { parseMarkdownChecklist } from "@/components/mardown-display/blocks/tasks/tasklist-parser";
import { parseTranscript } from "@/components/mardown-display/blocks/transcripts/transcript-parser";
import { parseMarkdownTable } from "@ai-matrx/rich-content/display/blocks/table/parseMarkdownTable";
import {
  arr,
  checkHtml,
  esc,
  inlineHtml,
  isUrl,
  kvHtml,
  linkHtml,
  listHtml,
  makeLayoutPrinter,
  obj,
  paperHtml,
  parseJsonText,
  str,
  tableHtml,
  tagsHtml,
  textHtml,
  type Layout,
} from "./printKit";

type Rec = Record<string, unknown>;

function attempt<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

/**
 * The object a layout reads: the value itself, the value inside a legacy
 * wrapper key, or the same from JSON text. Markdown text is left to `markdown`.
 */
function readShape(
  data: unknown,
  accept: (value: Rec) => boolean,
  wrappers: readonly string[] = [],
  markdown?: (text: string) => unknown,
): Rec | null {
  const pick = (value: unknown): Rec | null => {
    const record = obj(value);
    if (!record) return null;
    if (accept(record)) return record;
    for (const key of wrappers) {
      const inner = obj(record[key]);
      if (inner && accept(inner)) return inner;
    }
    return null;
  };
  const direct = pick(data);
  if (direct) return direct;
  if (typeof data !== "string") return null;
  const json = parseJsonText(data);
  if (json != null) return pick(json);
  if (!markdown) return null;
  return pick(attempt(() => markdown(data)));
}

const titleOf = (model: Rec, context: PrintBlockContext, fallback: string): string =>
  str(model.title) ?? str(context.title) ?? fallback;

// ─── comparison ───────────────────────────────────────────────────────────────

function cellHtml(value: unknown, type: unknown): string {
  if (typeof value === "boolean") return value ? "&#10003; Yes" : "&#10007; No";
  if (type === "rating" && typeof value === "number") {
    const n = Math.max(0, Math.min(5, Math.round(value)));
    return `${"&#9733;".repeat(n)}${"&#9734;".repeat(5 - n)} <span class="mxp-muted">${esc(value)}</span>`;
  }
  return inlineHtml(value);
}

const comparisonLayout: Layout<Rec> = {
  label: "Print comparison",
  read: (data) =>
    readShape(
      data,
      (v) => arr(v.items).length > 0 && arr(v.criteria).length > 0,
      ["comparison", "comparison_set"],
      (text) => parseComparisonJSON(text),
    ),
  title: (m, c) => titleOf(m, c, "Comparison"),
  render: (m, c) => {
    const items = arr(m.items).map((item) => str(item) ?? str(obj(item)?.name) ?? str(obj(item)?.title) ?? "");
    const rows = arr(m.criteria).map((raw) => {
      const criterion = obj(raw) ?? {};
      const values = arr(criterion.values);
      const head = `<strong>${inlineHtml(criterion.name)}</strong>${
        typeof criterion.weight === "number" ? ` <span class="mxp-muted mxp-small">weight ${esc(criterion.weight)}</span>` : ""
      }`;
      return [head, ...items.map((_, i) => cellHtml(values[i], criterion.type))];
    });
    return paperHtml(
      comparisonLayout.title(m, c),
      str(m.description),
      tableHtml(["Criterion", ...items.map((item) => esc(item))], rows),
    );
  },
};

// ─── timeline ─────────────────────────────────────────────────────────────────

const timelineLayout: Layout<Rec> = {
  label: "Print timeline",
  read: (data) =>
    readShape(
      data,
      (v) => arr(v.periods).some((p) => arr(obj(p)?.events).length > 0),
      ["timeline"],
      (text) => parseTimelineMarkdown(text),
    ),
  title: (m, c) => titleOf(m, c, "Timeline"),
  render: (m, c) => {
    const periods = arr(m.periods)
      .map((raw) => {
        const period = obj(raw) ?? {};
        const rows = arr(period.events).map((rawEvent) => {
          const event = obj(rawEvent) ?? {};
          const status = str(event.status);
          return [
            esc(str(event.date) ?? ""),
            `<strong>${inlineHtml(event.title)}</strong>${str(event.description) ? `<div>${inlineHtml(event.description)}</div>` : ""}`,
            [str(event.category) ? `<span class="mxp-tag">${esc(event.category)}</span>` : "", status ? `<span class="mxp-tag">${esc(status)}</span>` : ""].join(""),
          ];
        });
        const hasDates = rows.some((row) => row[0]);
        const table = hasDates
          ? tableHtml(["When", "Event", ""], rows)
          : tableHtml(["Event", ""], rows.map((row) => [row[1] ?? "", row[2] ?? ""]));
        return `${str(period.period) ? `<h3>${inlineHtml(period.period)}</h3>` : ""}${table}`;
      })
      .join("");
    return paperHtml(timelineLayout.title(m, c), str(m.description), periods);
  },
};

// ─── research ─────────────────────────────────────────────────────────────────

function section(title: string, body: string): string {
  return body ? `<h3>${esc(title)}</h3>${body}` : "";
}

function stringList(value: unknown): string {
  return listHtml(arr(value).map((item) => (typeof item === "string" ? item : str(obj(item)?.text) ?? str(obj(item)?.title) ?? "")));
}

function plainObjectKv(value: unknown): string {
  const record = obj(value);
  if (!record) return "";
  return kvHtml(
    Object.entries(record)
      .filter(([key]) => key !== "__kind")
      .map(([key, v]) => [
        key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (ch) => ch.toUpperCase()),
        Array.isArray(v) ? arr(v).map((x) => inlineHtml(x)).join(", ") : str(v) ? inlineHtml(v) : typeof v === "boolean" ? (v ? "Yes" : "No") : null,
      ] as const),
  );
}

const researchLayout: Layout<Rec> = {
  label: "Print research report",
  read: (data) =>
    readShape(
      data,
      (v) =>
        arr(v.sections).length > 0 &&
        !!(str(v.overview) || str(v.executiveSummary) || str(v.introduction) || str(v.conclusion)),
      ["research_report", "research"],
      (text) => parseResearchMarkdown(text),
    ),
  title: (m, c) => titleOf(m, c, "Research report"),
  render: (m, c) => {
    const findings = (raw: unknown) => {
      const finding = obj(raw) ?? {};
      const urls = arr(finding.urls).filter(isUrl);
      return `<div class="mxp-card"><h4>${inlineHtml(finding.title)}</h4>${textHtml(finding.keyDetails)}${kvHtml([
        ["Significance", str(finding.significance) ? inlineHtml(finding.significance) : null],
        ["Confidence", str(finding.confidenceLevel) ? esc(finding.confidenceLevel) : null],
        ["Primary source", str(finding.primarySource) ? inlineHtml(finding.primarySource) : null],
        ["Implications", str(finding.futureImplications) ? inlineHtml(finding.futureImplications) : null],
        ["Sources", urls.length ? urls.map((url) => linkHtml(url)).join("<br>") : null],
      ])}</div>`;
    };
    const sections = arr(m.sections)
      .map((raw) => {
        const sec = obj(raw) ?? {};
        return `<h3>${inlineHtml(sec.title)}</h3>${str(sec.subtitle) ? `<p class="mxp-muted">${inlineHtml(sec.subtitle)}</p>` : ""}${arr(sec.findings)
          .map(findings)
          .join("")}${str(sec.content) && !arr(sec.findings).length ? textHtml(sec.content) : ""}`;
      })
      .join("");
    const themes = arr(m.convergentThemes)
      .map((raw) => {
        const theme = obj(raw) ?? {};
        return [`<strong>${inlineHtml(theme.theme)}</strong>`, inlineHtml(theme.description)];
      });
    const challenges = arr(m.challenges).map((raw) => {
      const ch = obj(raw) ?? {};
      return `<div class="mxp-card"><h4>${inlineHtml(ch.title)}</h4>${textHtml(ch.description)}${kvHtml([
        ["Category", str(ch.category) ? esc(ch.category) : null],
        ["Research gaps", str(ch.researchGaps) ? inlineHtml(ch.researchGaps) : null],
        ["Current solutions", str(ch.currentSolutions) ? inlineHtml(ch.currentSolutions) : null],
      ])}</div>`;
    });
    const recommendations = arr(m.recommendations).map((raw) => {
      const rec = obj(raw) ?? {};
      return [inlineHtml(rec.target), inlineHtml(rec.recommendation)];
    });
    const outlook = [
      ["Short term", m.shortTermOutlook],
      ["Medium term", m.mediumTermOutlook],
      ["Long term", m.longTermVision],
    ]
      .map(([label, list]) => (arr(list).length ? `<h4>${esc(label)}</h4>${stringList(list)}` : ""))
      .join("");
    const conflicting = obj(m.conflictingEvidence);
    return paperHtml(
      researchLayout.title(m, c),
      null,
      [
        kvHtml([
          ["Scope", str(m.researchScope) ? inlineHtml(m.researchScope) : null],
          ["Focus", str(m.keyFocusAreas) ? inlineHtml(m.keyFocusAreas) : null],
          ["Period", str(m.analysisPeriod) ? inlineHtml(m.analysisPeriod) : null],
        ]),
        section("Executive summary", textHtml(m.executiveSummary)),
        section("Overview", textHtml(m.overview)),
        section("Introduction", textHtml(m.introduction)),
        section("Research questions", listHtml(arr(m.researchQuestions), true)),
        sections,
        section("Convergent themes", tableHtml(["Theme", "Description"], themes)),
        section("Conflicting evidence", conflicting ? plainObjectKv(conflicting) : ""),
        section("Outlook", outlook),
        section("Challenges", challenges.join("")),
        section("Recommendations", tableHtml(["For", "Recommendation"], recommendations)),
        section("Conclusion", textHtml(m.conclusion)),
        section("Key takeaways", stringList(m.keyTakeaways)),
        section("Methodology", plainObjectKv(m.methodology)),
        section("Source quality", plainObjectKv(m.sourceQuality)),
        section("Limitations", stringList(m.limitations)),
      ].join(""),
    );
  },
};

// ─── troubleshooting ──────────────────────────────────────────────────────────

const troubleshootingLayout: Layout<Rec> = {
  label: "Print troubleshooting guide",
  read: (data) =>
    readShape(
      data,
      (v) => arr(v.issues).length > 0,
      ["troubleshooting_guide", "troubleshooting"],
      (text) => parseTroubleshootingMarkdown(text),
    ),
  title: (m, c) => titleOf(m, c, "Troubleshooting guide"),
  render: (m, c) => {
    const issues = arr(m.issues)
      .map((raw, index) => {
        const issue = obj(raw) ?? {};
        const solutions = arr(issue.solutions)
          .map((rawSolution, sIndex) => {
            const solution = obj(rawSolution) ?? {};
            const steps = arr(solution.steps)
              .map((rawStep) => {
                const step = obj(rawStep) ?? {};
                const commands = arr(step.commands).filter((cmd) => str(cmd));
                const links = arr(step.links)
                  .map((l) => obj(l))
                  .filter((l): l is Rec => !!l && isUrl(l.url));
                return `<li><strong>${inlineHtml(step.title)}</strong>${str(step.estimatedTime) ? ` <span class="mxp-muted mxp-small">(${esc(step.estimatedTime)})</span>` : ""}${
                  str(step.description) ? `<div>${inlineHtml(step.description)}</div>` : ""
                }${commands.length ? `<pre>${commands.map((cmd) => esc(cmd)).join("\n")}</pre>` : ""}${
                  links.length ? `<div class="mxp-small">${links.map((l) => linkHtml(String(l.url), str(l.title))).join(" · ")}</div>` : ""
                }</li>`;
              })
              .join("");
            return `<div class="mxp-card mxp-long"><h5>Solution ${sIndex + 1}: ${inlineHtml(solution.title)}${
              typeof solution.successRate === "number" ? ` <span class="mxp-muted mxp-small">${esc(solution.successRate)}% success</span>` : ""
            }</h5>${str(solution.description) ? `<p>${inlineHtml(solution.description)}</p>` : ""}${steps ? `<ol>${steps}</ol>` : ""}</div>`;
          })
          .join("");
        return `<h3>${index + 1}. ${inlineHtml(issue.symptom ?? issue.title)}${str(issue.severity) ? ` <span class="mxp-tag">${esc(issue.severity)}</span>` : ""}</h3>${
          str(issue.description) ? textHtml(issue.description) : ""
        }${arr(issue.causes).length ? `<h5>Likely causes</h5>${stringList(issue.causes)}` : ""}${solutions}${
          arr(issue.relatedIssues).length ? `<p class="mxp-small mxp-muted">Related: ${arr(issue.relatedIssues).map((r) => inlineHtml(r)).join(", ")}</p>` : ""
        }`;
      })
      .join("");
    return paperHtml(troubleshootingLayout.title(m, c), str(m.description), issues);
  },
};

// ─── decision tree ────────────────────────────────────────────────────────────

function decisionNodeHtml(raw: unknown, depth: number): string {
  const node = obj(raw);
  if (!node || depth > 24) return "";
  const yes = obj(node.yes);
  const no = obj(node.no);
  const meta = [str(node.estimatedTime) ? esc(node.estimatedTime) : "", str(node.priority) ? `priority ${esc(node.priority)}` : ""]
    .filter(Boolean)
    .join(" · ");
  if (!yes && !no) {
    const action = str(node.action) ?? str(node.question) ?? str(node.description);
    return `<div class="mxp-card"><strong>&#8594; ${inlineHtml(action ?? "")}</strong>${
      str(node.description) && node.description !== action ? `<div>${inlineHtml(node.description)}</div>` : ""
    }${meta ? `<div class="mxp-muted mxp-small">${meta}</div>` : ""}</div>`;
  }
  return `<div class="mxp-card mxp-long"><strong>${inlineHtml(node.question ?? node.action ?? "")}</strong>${
    str(node.description) ? `<div class="mxp-muted">${inlineHtml(node.description)}</div>` : ""
  }<ul>${yes ? `<li><em>Yes</em>${decisionNodeHtml(yes, depth + 1)}</li>` : ""}${no ? `<li><em>No</em>${decisionNodeHtml(no, depth + 1)}</li>` : ""}</ul></div>`;
}

const decisionTreeLayout: Layout<Rec> = {
  label: "Print decision tree",
  read: (data) =>
    readShape(data, (v) => !!obj(v.root), ["decision_tree", "decisionTree"], (text) => parseDecisionTreeJSON(text)),
  title: (m, c) => titleOf(m, c, str(m.decision_tree_title) ?? "Decision tree"),
  render: (m, c) => paperHtml(decisionTreeLayout.title(m, c), str(m.description), decisionNodeHtml(m.root, 0)),
};

// ─── recipe ───────────────────────────────────────────────────────────────────

const recipeLayout: Layout<Rec> = {
  label: "Print recipe",
  read: (data) =>
    readShape(
      data,
      (v) => arr(v.ingredients).length > 0 || arr(v.instructions).length > 0,
      ["cooking_recipe", "recipe"],
      (text) => parseRecipeMarkdown(text),
    ),
  title: (m, c) => titleOf(m, c, "Recipe"),
  render: (m, c) => {
    const ingredients = arr(m.ingredients).map((raw) => {
      if (typeof raw === "string") return [inlineHtml(raw)];
      const ing = obj(raw) ?? {};
      return [`${str(ing.amount) ? `<strong>${inlineHtml(ing.amount)}</strong> ` : ""}${inlineHtml(ing.item ?? ing.name ?? "")}`];
    });
    const steps = arr(m.instructions)
      .map((raw) => {
        if (typeof raw === "string") return `<li>${inlineHtml(raw)}</li>`;
        const step = obj(raw) ?? {};
        return `<li>${str(step.action) ? `<strong>${inlineHtml(step.action)}</strong> ` : ""}${inlineHtml(step.description ?? "")}${
          str(step.time) ? ` <span class="mxp-muted mxp-small">(${esc(step.time)})</span>` : ""
        }</li>`;
      })
      .join("");
    return paperHtml(
      recipeLayout.title(m, c),
      null,
      [
        kvHtml([
          ["Yields", str(m.yields) ? inlineHtml(m.yields) : null],
          ["Prep time", str(m.prepTime) ? inlineHtml(m.prepTime) : null],
          ["Cook time", str(m.cookTime) ? inlineHtml(m.cookTime) : null],
          ["Total time", str(m.totalTime) ? inlineHtml(m.totalTime) : null],
        ]),
        section("Ingredients", ingredients.length ? `<ul>${ingredients.map((i) => `<li>${checkHtml(false)} ${i[0]}</li>`).join("")}</ul>` : ""),
        section("Instructions", steps ? `<ol>${steps}</ol>` : ""),
        section("Notes", textHtml(m.notes)),
      ].join(""),
    );
  },
};

// ─── resources ────────────────────────────────────────────────────────────────

const resourcesLayout: Layout<Rec> = {
  label: "Print resources",
  read: (data) =>
    readShape(
      data,
      (v) => arr(v.categories).some((cat) => arr(obj(cat)?.resources).length > 0),
      ["resource_collection", "resources"],
      (text) => parseResourcesMarkdown(text),
    ),
  title: (m, c) => titleOf(m, c, "Resources"),
  render: (m, c) => {
    const categories = arr(m.categories)
      .map((raw) => {
        const cat = obj(raw) ?? {};
        const rows = arr(cat.resources).map((rawItem) => {
          const item = obj(rawItem) ?? {};
          const url = str(item.url);
          return [
            `<strong>${url && isUrl(url) ? linkHtml(url, str(item.title)) : inlineHtml(item.title)}</strong>${
              str(item.description) ? `<div>${inlineHtml(item.description)}</div>` : ""
            }${url && isUrl(url) && str(item.title) ? `<div class="mxp-muted mxp-small">${esc(url)}</div>` : ""}`,
            [str(item.type), str(item.difficulty), str(item.duration)].filter(Boolean).map((t) => `<span class="mxp-tag">${esc(t)}</span>`).join("") +
              tagsHtml(arr(item.tags)) +
              (typeof item.rating === "number" ? `<div class="mxp-small">${"&#9733;".repeat(Math.max(0, Math.min(5, Math.round(item.rating))))}</div>` : ""),
          ];
        });
        return `<h3>${inlineHtml(cat.name)}</h3>${str(cat.description) ? `<p class="mxp-muted">${inlineHtml(cat.description)}</p>` : ""}${tableHtml(["Resource", ""], rows)}`;
      })
      .join("");
    return paperHtml(resourcesLayout.title(m, c), str(m.description), categories);
  },
};

// ─── progress ─────────────────────────────────────────────────────────────────

function progressBar(percent: number): string {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return `<div class="mxp-bar"><span style="width:${p}%"></span></div>`;
}

const progressLayout: Layout<Rec> = {
  label: "Print progress",
  read: (data) => {
    const shape = readShape(
      data,
      (v) => arr(v.phases).some((p) => arr(obj(p)?.steps).length > 0) || arr(v.categories).some((p) => arr(obj(p)?.items).length > 0),
      ["progress_tracker", "progress"],
      (text) => parseProgressMarkdown(text),
    );
    if (!shape) return null;
    // Older rows carry categories/items; the kind carries phases/steps.
    if (!arr(shape.phases).length && arr(shape.categories).length) {
      return {
        ...shape,
        phases: arr(shape.categories).map((cat) => ({ ...(obj(cat) ?? {}), steps: arr(obj(cat)?.items) })),
      };
    }
    return shape;
  },
  title: (m, c) => titleOf(m, c, "Progress"),
  render: (m, c) => {
    let total = 0;
    let done = 0;
    const phases = arr(m.phases)
      .map((raw) => {
        const phase = obj(raw) ?? {};
        const steps = arr(phase.steps).map((s) => obj(s) ?? {});
        const complete = steps.filter((s) => s.completed === true).length;
        total += steps.length;
        done += complete;
        const percent = typeof phase.completion_percentage === "number" ? phase.completion_percentage : steps.length ? (complete / steps.length) * 100 : 0;
        return `<h3>${inlineHtml(phase.name)} <span class="mxp-muted mxp-small">${complete}/${steps.length} · ${Math.round(percent)}%</span></h3>${progressBar(percent)}${
          str(phase.description) ? `<p class="mxp-muted">${inlineHtml(phase.description)}</p>` : ""
        }<ul style="list-style:none;padding-left:2pt">${steps
          .map(
            (step) =>
              `<li>${checkHtml(step.completed === true)} ${inlineHtml(step.text ?? step.title ?? "")}${step.optional === true ? ` <span class="mxp-muted mxp-small">(optional)</span>` : ""}${
                str(step.priority) ? ` <span class="mxp-tag">${esc(step.priority)}</span>` : ""
              }${typeof step.estimated_hours === "number" ? ` <span class="mxp-muted mxp-small">${esc(step.estimated_hours)} h</span>` : ""}</li>`,
          )
          .join("")}</ul>`;
      })
      .join("");
    const overall = typeof m.overall_progress === "number" ? m.overall_progress : total ? (done / total) * 100 : 0;
    return paperHtml(
      progressLayout.title(m, c),
      str(m.description),
      `${kvHtml([
        ["Overall", `${done} of ${total} done · ${Math.round(overall)}%`],
        ["Start", str(m.start_date) ? esc(m.start_date) : null],
        ["Target", str(m.target_date) ? esc(m.target_date) : null],
      ])}${progressBar(overall)}${phases}`,
    );
  },
};

// ─── stats ────────────────────────────────────────────────────────────────────

const statsLayout: Layout<Rec> = {
  label: "Print stats",
  read: (data) => {
    const json = typeof data === "string" ? parseJsonText(data) : data;
    if (Array.isArray(json)) return json.some((s) => obj(s)?.label != null) ? { stats: json } : null;
    return readShape(json, (v) => arr(v.stats).some((s) => obj(s)?.label != null), ["stats"]);
  },
  title: (m, c) => titleOf(m, c, "Key figures"),
  render: (m, c) => {
    const rows = arr(m.stats).map((raw) => {
      const stat = obj(raw) ?? {};
      const trend = stat.trend === "up" ? "&#9650; " : stat.trend === "down" ? "&#9660; " : "";
      return [
        `<strong>${inlineHtml(stat.label)}</strong>${str(stat.hint) ? `<div class="mxp-muted mxp-small">${inlineHtml(stat.hint)}</div>` : ""}`,
        `<span style="font-size:13pt;font-weight:700">${inlineHtml(stat.value)}</span>`,
        str(stat.change) ? `${trend}${inlineHtml(stat.change)}` : "",
      ];
    });
    const hasChange = rows.some((row) => row[2]);
    return paperHtml(
      statsLayout.title(m, c),
      null,
      hasChange ? tableHtml(["Metric", "Value", "Change"], rows) : tableHtml(["Metric", "Value"], rows.map((r) => [r[0] ?? "", r[1] ?? ""])),
    );
  },
};

// ─── questionnaire ────────────────────────────────────────────────────────────

const questionnaireLayout: Layout<Rec> = {
  label: "Print questionnaire",
  read: (data) => readShape(data, (v) => arr(v.questions).length > 0, ["questionnaire"]),
  title: (m, c) => titleOf(m, c, "Questionnaire"),
  render: (m, c) => {
    const questions = arr(m.questions)
      .map((raw) => {
        const q = obj(raw) ?? {};
        const type = str(q.type) ?? "text";
        const box = type === "checkbox" ? "&#9744;" : "&#9675;";
        const options = arr(q.options).map((o) => str(obj(o)?.name) ?? str(obj(o)?.label) ?? str(o) ?? "");
        let answer = "";
        if (options.length) {
          answer = `<ul style="list-style:none;padding-left:4pt">${options.map((o) => `<li><span class="mxp-check">${box}</span> ${inlineHtml(o)}</li>`).join("")}</ul>`;
        } else if (type === "range" || type === "slider" || typeof q.min === "number") {
          answer = `<p class="mxp-muted">${esc(q.min ?? 0)} &#8212;&#8212;&#8212;&#8212;&#8212;&#8212;&#8212;&#8212;&#8212;&#8212; ${esc(q.max ?? 10)}</p>`;
        } else {
          answer = `<div style="border-bottom:1px solid #94a3b8;height:16pt;margin:6pt 0"></div><div style="border-bottom:1px solid #94a3b8;height:16pt;margin:0 0 8pt"></div>`;
        }
        return `<div class="mxp-card"><strong>${inlineHtml(q.question ?? q.label ?? "")}</strong>${
          str(q.description) ? `<div class="mxp-muted mxp-small">${inlineHtml(q.description)}</div>` : ""
        }${answer}</div>`;
      })
      .join("");
    return paperHtml(questionnaireLayout.title(m, c), str(m.description), questions);
  },
};

// ─── transcript ───────────────────────────────────────────────────────────────

const transcriptLayout: Layout<Rec> = {
  label: "Print transcript",
  read: (data) =>
    readShape(data, (v) => arr(v.segments).some((s) => str(obj(s)?.text)), ["transcript"], (text) => parseTranscript(text)),
  title: (m, c) => titleOf(m, c, "Transcript"),
  render: (m, c) => {
    const rows = arr(m.segments).map((raw) => {
      const seg = obj(raw) ?? {};
      return [
        `<span class="mxp-muted mxp-small">${esc(str(seg.timecode) ?? "")}</span>`,
        str(seg.speaker) ? `<strong>${inlineHtml(seg.speaker)}</strong>` : "",
        seg.isHighlighted === true ? `<mark>${inlineHtml(seg.text)}</mark>` : inlineHtml(seg.text),
      ];
    });
    const hasTime = rows.some((r) => r[0] !== `<span class="mxp-muted mxp-small"></span>`);
    const hasSpeaker = rows.some((r) => r[1]);
    const headers = [hasTime ? "Time" : null, hasSpeaker ? "Speaker" : null, "Text"].filter((h): h is string => !!h);
    const cells = rows.map((r) => [hasTime ? r[0] : null, hasSpeaker ? r[1] : null, r[2]].filter((x): x is string => x !== null));
    return paperHtml(transcriptLayout.title(m, c), str(m.subtitle), tableHtml(headers, cells));
  },
};

// ─── structured info ──────────────────────────────────────────────────────────

/** `**Title**` then `- **Label:** text` lines — the legacy markdown body. */
function parseStructuredInfoMarkdown(text: string): Rec | null {
  const lines = text.split("\n");
  let title: string | null = null;
  const sections: Array<{ heading: string; items: Array<{ label: string; text: string }>; body: string[] }> = [];
  let current = { heading: "", items: [] as Array<{ label: string; text: string }>, body: [] as string[] };
  sections.push(current);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const heading = /^(?:#{1,6}\s+(.+)|\*\*([^*]+)\*\*:?)$/.exec(line);
    if (heading) {
      const name = (heading[1] ?? heading[2] ?? "").trim();
      if (!title && sections.length === 1 && current.items.length === 0) title = name;
      else sections.push((current = { heading: name, items: [], body: [] }));
      continue;
    }
    const item = /^[-*+]\s+\*\*([^*]+?):?\*\*:?\s*(.*)$/.exec(line);
    if (item) current.items.push({ label: (item[1] ?? "").replace(/:$/, ""), text: item[2] ?? "" });
    else current.body.push(line.replace(/^[-*+]\s+/, ""));
  }
  const kept = sections.filter((s) => s.items.length || s.body.length);
  if (!kept.some((s) => s.items.length)) return null;
  return { title, sections: kept.map((s) => ({ heading: s.heading, items: s.items, body: s.body.join("\n") })) };
}

const structuredInfoLayout: Layout<Rec> = {
  label: "Print summary",
  read: (data) =>
    readShape(
      data,
      (v) => arr(v.sections).some((s) => arr(obj(s)?.items).length > 0 || str(obj(s)?.body)),
      ["structured_info"],
      parseStructuredInfoMarkdown,
    ),
  title: (m, c) => titleOf(m, c, "Summary"),
  render: (m, c) => {
    const sections = arr(m.sections)
      .map((raw) => {
        const sec = obj(raw) ?? {};
        const items = arr(sec.items).map((i) => obj(i) ?? {});
        return `${str(sec.heading) ? `<h3>${inlineHtml(sec.heading)}</h3>` : ""}${textHtml(sec.body)}${kvHtml(
          items.map((i) => [str(i.label) ?? "", inlineHtml(i.text ?? "")] as const),
        )}`;
      })
      .join("");
    return paperHtml(structuredInfoLayout.title(m, c), str(m.description), sections);
  },
};

// ─── tree ─────────────────────────────────────────────────────────────────────

function treeNodeHtml(raw: unknown, depth: number): string {
  const node = obj(raw);
  if (!node || depth > 30) return typeof raw === "string" ? `<li>${inlineHtml(raw)}</li>` : "";
  const label = str(node.name) ?? str(node.label) ?? str(node.title) ?? str(node.text) ?? "";
  const kids = arr(node.children);
  return `<li>${inlineHtml(label)}${str(node.description) ? ` <span class="mxp-muted">— ${inlineHtml(node.description)}</span>` : ""}${
    kids.length ? `<ul>${kids.map((k) => treeNodeHtml(k, depth + 1)).join("")}</ul>` : ""
  }</li>`;
}

const treeLayout: Layout<{ html: string; title: string | null }> = {
  label: "Print tree",
  read: (data) => {
    const json = typeof data === "string" ? parseJsonText(data) : data;
    const root = obj(json);
    if (root && (arr(root.children).length || arr(root.nodes).length)) {
      const nodes = arr(root.children).length ? [root] : arr(root.nodes);
      return { html: `<ul>${nodes.map((n) => treeNodeHtml(n, 0)).join("")}</ul>`, title: str(root.title) };
    }
    if (Array.isArray(json) && json.length) return { html: `<ul>${json.map((n) => treeNodeHtml(n, 0)).join("")}</ul>`, title: null };
    if (typeof data === "string" && data.trim()) {
      const fenced = /^\s*```[^\n]*\n([\s\S]*?)\n?```\s*$/.exec(data);
      // An ASCII drawing keeps its columns; a markdown outline prints as its nested list.
      return fenced ? { html: `<pre>${esc(fenced[1])}</pre>`, title: null } : { html: `\u0000md:${data}`, title: null };
    }
    return null;
  },
  title: (m, c) => m.title ?? str(c.title) ?? "Tree",
  render: (m, c) => paperHtml(treeLayout.title(m, c), null, m.html.startsWith("\u0000md:") ? textHtml(m.html.slice(4)) : m.html),
};

// ─── tasks ────────────────────────────────────────────────────────────────────

interface TaskNode {
  title: string;
  checked?: boolean;
  type?: string;
  children?: TaskNode[];
}

function toTaskNodes(value: unknown): TaskNode[] {
  return arr(value)
    .map((raw) => obj(raw))
    .filter((n): n is Rec => !!n)
    .map((n) => ({
      title: str(n.title) ?? str(n.text) ?? "",
      checked: n.checked === true || n.completed === true,
      type: str(n.type) ?? str(n.item_type) ?? undefined,
      children: toTaskNodes(n.children),
    }));
}

function taskNodesHtml(nodes: readonly TaskNode[], depth: number): string {
  if (!nodes.length || depth > 12) return "";
  return `<ul style="list-style:none;padding-left:${depth ? 14 : 2}pt">${nodes
    .map((n) =>
      n.type === "section"
        ? `<li style="margin-top:5pt"><strong>${inlineHtml(n.title)}</strong>${taskNodesHtml(n.children ?? [], depth + 1)}</li>`
        : `<li>${checkHtml(n.checked === true)} ${inlineHtml(n.title)}${taskNodesHtml(n.children ?? [], depth + 1)}</li>`,
    )
    .join("")}</ul>`;
}

const tasksLayout: Layout<{ title: string | null; items: TaskNode[] }> = {
  label: "Print checklist",
  read: (data) => {
    const json = typeof data === "string" ? parseJsonText(data) : data;
    const record = obj(json);
    if (record && arr(record.items).length) return { title: str(record.title), items: toTaskNodes(record.items) };
    if (typeof data !== "string") return null;
    const items = attempt(() => parseMarkdownChecklist(data)) ?? [];
    if (!items.length) return null;
    const heading = /^\s*#{1,6}\s+(.+)$/m.exec(data);
    return { title: heading?.[1]?.trim() ?? null, items: toTaskNodes(items) };
  },
  title: (m, c) => m.title ?? str(c.title) ?? "Checklist",
  render: (m, c) => paperHtml(tasksLayout.title(m, c), null, taskNodesHtml(m.items, 0)),
};

// ─── table ────────────────────────────────────────────────────────────────────

function cellValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return esc(value.toLocaleString());
  if (typeof value === "string") return inlineHtml(value);
  if (Array.isArray(value)) return value.map(cellValue).join(", ");
  const record = obj(value);
  if (record) {
    return Object.entries(record)
      .filter(([k]) => k !== "__kind")
      .map(([k, v]) => `${esc(k)}: ${cellValue(v)}`)
      .join("; ");
  }
  return esc(value);
}

const tableLayout: Layout<{ title: string | null; headers: string[]; rows: string[][]; notes: string[] }> = {
  label: "Print table",
  read: (data) => {
    const json = typeof data === "string" ? parseJsonText(data) : data;
    const record = obj(json);
    if (record && arr(record.columns).length && Array.isArray(record.rows)) {
      const columns = arr(record.columns).map((c) => (typeof c === "string" ? c : str(obj(c)?.name) ?? str(obj(c)?.label) ?? ""));
      const rows = arr(record.rows).map((r) => {
        const row = obj(r);
        if (Array.isArray(r)) return columns.map((_, i) => cellValue(r[i]));
        return columns.map((col) => cellValue(row?.[col]));
      });
      const notes = arr(record.notes).map((n) => str(n) ?? "").filter(Boolean);
      if (record.truncated === true) {
        notes.push(`Showing ${rows.length} of ${typeof record.total_row_count === "number" ? record.total_row_count : "more"} rows.`);
      }
      return { title: str(record.title), headers: columns.map((c) => esc(c)), rows, notes };
    }
    if (Array.isArray(json) && json.length && json.every((r) => obj(r))) {
      const headers = [...new Set(json.flatMap((r) => Object.keys(obj(r) ?? {}).filter((k) => k !== "__kind")))];
      return { title: null, headers: headers.map((h) => esc(h)), rows: json.map((r) => headers.map((h) => cellValue(obj(r)?.[h]))), notes: [] };
    }
    if (typeof data !== "string") return null;
    const parsed = attempt(() => parseMarkdownTable(data));
    if (!parsed || !parsed.headers.length || !parsed.rows.length) return null;
    return { title: null, headers: parsed.headers.map((h) => inlineHtml(h)), rows: parsed.rows.map((r) => r.map((cell) => inlineHtml(cell))), notes: [] };
  },
  title: (m, c) => m.title ?? str(c.title) ?? "Table",
  render: (m, c) =>
    paperHtml(
      tableLayout.title(m, c),
      null,
      `${tableHtml(m.headers, m.rows)}${m.notes.length ? `<p class="mxp-muted mxp-small">${m.notes.map((n) => inlineHtml(n)).join("<br>")}</p>` : ""}`,
    ),
};

// ─── code edit error ──────────────────────────────────────────────────────────

function problemText(value: unknown): string {
  if (typeof value === "string") return value;
  const record = obj(value);
  if (!record) return String(value ?? "");
  const where = [str(record.file), str(record.line) ? `line ${record.line}` : null].filter(Boolean).join(" ");
  const message = str(record.message) ?? str(record.error) ?? str(record.reason) ?? "";
  return where ? `${where}: ${message}` : message;
}

const codeEditErrorLayout: Layout<Rec> = {
  label: "Print edit errors",
  read: (data) => readShape(data, (v) => arr(v.errors).length > 0 || arr(v.warnings).length > 0),
  title: (_m, c) => str(c.title) ?? "Code edit errors",
  render: (m, c) =>
    paperHtml(
      codeEditErrorLayout.title(m, c),
      null,
      [
        section("Errors", listHtml(arr(m.errors).map(problemText))),
        section("Warnings", listHtml(arr(m.warnings).map(problemText))),
        section("Model response", typeof m.rawResponse === "string" && m.rawResponse.trim() ? `<pre>${esc(m.rawResponse)}</pre>` : ""),
      ].join(""),
    ),
};

/** Every structured layout, keyed by artifact type, with the `__kind` slugs it also answers to. */
export const STRUCTURED_LAYOUTS = [
  { type: "comparison", kinds: ["comparison_set"], layout: comparisonLayout },
  { type: "timeline", kinds: ["timeline"], layout: timelineLayout },
  { type: "research", kinds: ["research_report"], layout: researchLayout },
  { type: "troubleshooting", kinds: ["troubleshooting_guide"], layout: troubleshootingLayout },
  { type: "decision-tree", kinds: ["decision_tree"], layout: decisionTreeLayout },
  { type: "recipe", kinds: ["cooking_recipe"], layout: recipeLayout },
  { type: "resources", kinds: ["resource_collection"], layout: resourcesLayout },
  { type: "progress", kinds: ["progress_tracker"], layout: progressLayout },
  { type: "stats", kinds: [], layout: statsLayout },
  { type: "questionnaire", kinds: ["questionnaire"], layout: questionnaireLayout },
  { type: "transcript", kinds: ["transcript"], layout: transcriptLayout },
  { type: "structured_info", kinds: ["structured_info"], layout: structuredInfoLayout },
  { type: "tree", kinds: [], layout: treeLayout },
  { type: "tasks", kinds: ["task_list"], layout: tasksLayout },
  { type: "table", kinds: ["data_table"], layout: tableLayout },
  { type: "code_edit_error", kinds: [], layout: codeEditErrorLayout },
] as const;

export const STRUCTURED_PRINTERS = STRUCTURED_LAYOUTS.map(({ type, kinds, layout }) => ({
  type,
  kinds,
  printer: makeLayoutPrinter(layout as Layout<unknown>, type),
}));
