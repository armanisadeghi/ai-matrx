// scripts/safety-net/walks/public-form.mjs — LANE MAKE-HOME wave 5, guard G4, items F01–F02.
//
// A stranger opens a clinic's public form on her phone (390 px) and on a laptop (1280 px), signed
// out. Each answer box must fill the form's column (≥ 80% of it), sit on the same left edge as the
// form's title, and at 390 px the page must not scroll sideways. The live walk of 2026-10-02 found a
// 166 px box in a column starting at x=112 under a title at x=20.
//
// CHOICE OPTIONS ARE ANSWER BOXES TOO (MAKE-HOME W5b, 2026-10-02): a choice question's options
// (`[data-records-choice-answer]`) must each fill the column like a text box — the verifier found
// them drawn as pills sized to their words. Each is measured with the same 80% rule and left edge.
//
// READ-ONLY: it never types an answer (typing saves a draft) and never sends. It moves through the
// questions with the form's own Next button and measures each one's answer box.
//
// The form: Cedar Ridge Physical Therapy's published intake, overridable by SN_PUBLIC_FORM.
import { openWalk, sleep, until } from "../lib/harness.mjs";

const FORM = process.env.SN_PUBLIC_FORM ?? "c605f46f-b996-43e5-8767-503a0283932d";
const MIN_SHARE = 0.8;

const ctx = await openWalk("public-form");

/** Every visible answer box on screen, with the form's column and title edges. */
function measure() {
  const main = document.querySelector("main");
  if (!main) return { error: "no <main> on the page" };
  const cs = getComputedStyle(main);
  const mr = main.getBoundingClientRect();
  const colLeft = mr.left + parseFloat(cs.paddingLeft);
  const colWidth = mr.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const h1 = main.querySelector("h1")?.getBoundingClientRect() ?? null;
  const boxes = [...main.querySelectorAll("input, textarea, select, [role='combobox'], [data-records-choice-answer]")]
    .filter((el) => {
      if (el.closest("[aria-hidden='true']") || el.getAttribute("tabindex") === "-1") return false;
      if (el instanceof HTMLInputElement && ["hidden", "checkbox", "radio", "file"].includes(el.type)) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    })
    .map((el) => {
      const r = el.getBoundingClientRect();
      const tag = el.hasAttribute("data-records-choice-answer") ? `choice "${el.getAttribute("aria-label") ?? el.textContent?.trim()}"` : el.tagName.toLowerCase();
      return { tag, id: el.id || null, left: Math.round(r.left), width: Math.round(r.width) };
    });
  return {
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
    colLeft: Math.round(colLeft),
    colWidth: Math.round(colWidth),
    titleLeft: h1 ? Math.round(h1.left) : null,
    boxes,
    position: (document.body.innerText.match(/\b(\d+) of (\d+)\b/) ?? []).slice(1).map(Number),
  };
}

async function walkAt(item, width, height) {
  const page = await ctx.anonPage({ width, height });
  await ctx.goto(page, `${ctx.origin}/f/${FORM}`);
  const ready = await until(
    "the form's first answer box",
    () => page.evaluate(() => Boolean(document.querySelector("main h1") && document.querySelector("main input, main textarea, main [role='combobox'], main [data-records-choice-answer]"))),
    120000,
  ).catch(() => ({ v: false }));
  if (!ready?.v) {
    await ctx.step([item], `${width} px: the public form opens signed out`, page, async () => ({
      ok: false,
      detail: `no form at /f/${FORM} (closed, archived or never published?) — set SN_PUBLIC_FORM to a published form in the fixture organization`,
    }));
    return;
  }
  await sleep(1500);
  const seen = [];
  for (let guard = 0; guard < 25; guard += 1) {
    const m = await page.evaluate(measure);
    if (m.error) {
      seen.push({ error: m.error });
      break;
    }
    seen.push(m);
    const next = page.getByRole("button", { name: /^Next$/ });
    if (!(await next.count())) break;
    await next.first().click();
    await sleep(500);
  }
  await ctx.shot(page, `${width}-last-question`);

  const bad = [];
  let measured = 0;
  for (const m of seen) {
    if (m.error) {
      bad.push(m.error);
      continue;
    }
    if (width <= 390 && m.sw > m.iw + 1) bad.push(`page ${m.sw} px wide on a ${m.iw} px screen`);
    for (const b of m.boxes) {
      measured += 1;
      if (b.width < MIN_SHARE * m.colWidth) bad.push(`question ${m.position.join(" of ") || "?"}: ${b.tag} ${b.width} px in a ${m.colWidth} px column (${Math.round((100 * b.width) / m.colWidth)}%)`);
      if (m.titleLeft != null && Math.abs(b.left - m.titleLeft) > 2) bad.push(`question ${m.position.join(" of ") || "?"}: ${b.tag} starts at x=${b.left}, the title at x=${m.titleLeft}`);
    }
  }
  if (measured === 0) bad.push("no answer box was measured");
  const choices = seen.reduce((n, m) => n + (m.boxes ?? []).filter((b) => b.tag.startsWith("choice")).length, 0);
  if (choices === 0) bad.push("no choice option was measured (the fixture form asks a choice question)");
  const first = seen.find((m) => !m.error);
  await ctx.step([item], `${width} px: answer boxes fill the column on the title's edge${width <= 390 ? ", no sideways scroll" : ""}`, page, async () => ({
    ok: bad.length === 0,
    detail: bad.length
      ? bad.slice(0, 6).join(" · ")
      : `${measured} answer boxes (${choices} choice options) over ${new Set(seen.map((m) => (m.position ?? []).join("/"))).size} questions, each ≥ ${MIN_SHARE * 100}% of a ${first?.colWidth} px column at x=${first?.colLeft}; title at x=${first?.titleLeft}; page ${first?.sw} px on ${first?.iw}`,
  }));
}

try {
  await walkAt("F01", 390, 844);
  await walkAt("F02", 1280, 900);
} finally {
  await ctx.finish();
}
