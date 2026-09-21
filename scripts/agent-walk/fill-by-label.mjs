// scripts/agent-walk/fill-by-label.mjs — THE ONE BY-LABEL FILLER EVERY WALK USES.
//
// 🚨 WHY IT EXISTS. On 2026-09-21 the booking walk booked a real appointment on
// Ironclad Mobile Mechanic's public page and the row it wrote held the LICENCE
// PLATE in `customer_name`, with phone, email and vehicle absent. The screen was
// fine; the WALK was broken. `stranger-books.mjs` fell back to
//
//     const scope = node.closest("div") ?? document.body;
//     const input = scope.querySelector("input, textarea, select");
//
// and on that page the label's text sits in a `<span>` INSIDE a `<label>`, so
// `closest("div")` climbed past the label to the container holding every
// question — and `querySelector` then answered the FIRST INPUT ON THE PAGE,
// every time. Seven answers went into one box; the last one written won.
//
// AN UNPROVEN WALK IS WORSE THAN NO WALK. That run was reported as a pass with
// a note, and the note is the only reason anybody knew. So this module does two
// things the old fallback did not:
//
//   1. IT MATCHES A LABEL TO THE CONTROL IT ACTUALLY LABELS, in the order the
//      HTML spec says: `for=`/`id`, then a control nested inside the label,
//      then the control immediately after the label in document order. It never
//      climbs to an ancestor and guesses.
//   2. IT REFUSES TO PASS QUIETLY. Two labels resolving to the same control, a
//      label that resolves to none, or a value that did not read back is
//      THROWN, naming the label. A walk that cannot fill a form has not proven
//      anything about the form.
//
// It writes with the native value setter and dispatches `input` + `change`, so
// React's onChange runs exactly as it does for a person typing.

/**
 * Fill a form by the words printed above each box.
 *
 * @param {import('playwright').Page} page
 * @param {Record<string, string>} values  label → what a real customer types
 * @param {{ allowMissing?: string[] }} [opts]
 * @returns {Promise<{ filled: string[]; readBack: Record<string, string> }>}
 */
export async function fillByLabel(page, values, opts = {}) {
  const allowMissing = new Set(opts.allowMissing ?? []);

  const outcome = await page.evaluate((wanted) => {
    const visible = (el) => el && el.getClientRects().length > 0;
    const isControl = (el) =>
      el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) && visible(el);

    /** The control a <label> labels, by the three rules the HTML spec gives. */
    const controlFor = (label) => {
      // 1. for= / id
      const id = label.getAttribute("for");
      if (id) {
        const byId = document.getElementById(id);
        if (isControl(byId)) return byId;
      }
      // 2. nested inside the label — which is what the booking page does.
      const nested = label.querySelector("input, textarea, select");
      if (isControl(nested)) return nested;
      // 3. the very next control in document order, and ONLY if no other label
      //    sits between them.
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      walker.currentNode = label;
      let node = walker.nextNode();
      while (node) {
        if (node.tagName === "LABEL" && node !== label) return null;
        if (isControl(node)) return node;
        node = walker.nextNode();
      }
      return null;
    };

    const setValue = (el, v) => {
      const proto =
        el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement : window.HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set;
      setter?.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };

    const labels = Array.from(document.querySelectorAll("label")).filter(visible);
    const filled = [];
    const notFound = [];
    const collisions = [];
    const readBack = {};
    const used = new Map(); // control → the label that claimed it

    for (const [want, value] of Object.entries(wanted)) {
      // The label whose OWN text is this question. Exact first, then a prefix
      // match, because a required question renders "Phone *".
      const hit =
        labels.find((l) => (l.textContent || "").trim() === want) ??
        labels.find((l) => (l.textContent || "").trim().replace(/\s*\*$/, "") === want) ??
        labels.find((l) => (l.textContent || "").trim().startsWith(want));
      if (!hit) {
        notFound.push(want);
        continue;
      }
      const control = controlFor(hit);
      if (!control) {
        notFound.push(want);
        continue;
      }
      // 🚨 THE DEFECT, CAUGHT RATHER THAN REPEATED.
      if (used.has(control)) {
        collisions.push(`${want} resolved to the same box as ${used.get(control)}`);
        continue;
      }
      used.set(control, want);
      setValue(control, value);
      filled.push(want);
      readBack[want] = control.value;
    }
    return { filled, notFound, collisions, readBack };
  }, values);

  const missing = outcome.notFound.filter((k) => !allowMissing.has(k));
  if (outcome.collisions.length) {
    throw new Error(
      `fillByLabel: two questions landed in ONE box — ${outcome.collisions.join("; ")}. ` +
        "This is the 2026-09-21 defect; the walk is wrong, not the page.",
    );
  }
  if (missing.length) {
    throw new Error(
      `fillByLabel: no box found for ${missing.map((m) => `"${m}"`).join(", ")}. ` +
        "The walk cannot prove anything about a form it could not fill.",
    );
  }
  // READ BACK, because a controlled React input that rejected the write reads
  // its old value and a walk that trusted the write would report a false pass.
  const wrong = Object.entries(outcome.readBack).filter(([k, v]) => v !== values[k]);
  if (wrong.length) {
    throw new Error(
      `fillByLabel: the page did not keep ${wrong
        .map(([k, v]) => `"${k}" (it holds “${v}”, not “${values[k]}”)`)
        .join(", ")}.`,
    );
  }
  return { filled: outcome.filled, readBack: outcome.readBack };
}
