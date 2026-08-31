/**
 * FIX-4 guards — one case per adversarial finding this wave closes, each
 * written so it FAILS against the shape that was shipped before it.
 *
 * V2 G3   — the JOB cell had no content of its own (`coverageLine`).
 * V2 G5   — the run's own reason was discarded for a placeholder.
 * V1 R2-1 — a dead page after a confirm opened from a Radix Select.
 * V1 R2-2 — the server's `applies_in` cleared in the commit that set it.
 */

import {
  __resetBodyPointerEventsRepairs,
  bodyPointerEventsRepairCount,
  restoreBodyPointerEventsIfOrphaned,
} from "@/components/dialogs/confirm/body-pointer-events-guard";
import { afterCurrentLayerCloses } from "@/components/dialogs/confirm/after-current-layer-closes";
import { extractErrorMessage } from "@/utils/errors";
import { coverageLine } from "../words";
import { writeReportStillDescribesDraft } from "../write-report-life";

describe("V2 G3 — the JOB cell says whether the offer covers the holder", () => {
  test("no holder: it names what the offer would become, never a coverage claim", () => {
    expect(
      coverageLine({
        hasHolder: false,
        inputsReady: false,
        totalInputs: 0,
        fedInputs: 0,
        askingInputs: 0,
        unfedRequired: 0,
        offeredCount: 27,
      }),
    ).toBe(
      "Pick a holder and these 27 offered values become the inputs it can be fed from.",
    );
  });

  test("inputs still loading: it says so rather than claiming full coverage", () => {
    expect(
      coverageLine({
        hasHolder: true,
        inputsReady: false,
        totalInputs: 0,
        fedInputs: 0,
        askingInputs: 0,
        unfedRequired: 0,
        offeredCount: 5,
      }),
    ).toBe("Reading what this holder needs…");
  });

  test("full coverage with a question names the question", () => {
    expect(
      coverageLine({
        hasHolder: true,
        inputsReady: true,
        totalInputs: 5,
        fedInputs: 5,
        askingInputs: 1,
        unfedRequired: 0,
        offeredCount: 5,
      }),
    ).toBe(
      "Every input this holder needs is fed — all 5. One of them asks the person at run time.",
    );
  });

  test("an unmapped required input says the run would refuse", () => {
    expect(
      coverageLine({
        hasHolder: true,
        inputsReady: true,
        totalInputs: 5,
        fedInputs: 3,
        askingInputs: 0,
        unfedRequired: 1,
        offeredCount: 5,
      }),
    ).toBe(
      "3 of the 5 inputs this holder needs are fed. 1 required input is still unmapped, and a run would refuse.",
    );
  });

  test("unfed but optional inputs are named as falling back, not as a problem", () => {
    expect(
      coverageLine({
        hasHolder: true,
        inputsReady: true,
        totalInputs: 5,
        fedInputs: 3,
        askingInputs: 0,
        unfedRequired: 0,
        offeredCount: 5,
      }),
    ).toBe(
      "3 of the 5 inputs this holder needs are fed. The other 2 fall back to the holder's own defaults.",
    );
  });
});

describe("V2 G5 — the run's own reason survives to the screen", () => {
  test("a redux SerializedError is a plain OBJECT, and its message is the reason", () => {
    // This is what `createAsyncThunk(...).unwrap()` rethrows when the thunk
    // threw. `err instanceof Error` is FALSE here — the old code's whole bug.
    const serialized = {
      name: "Error",
      message: "The agent service is unavailable (503).",
      stack: "…",
    };
    expect(serialized instanceof Error).toBe(false);
    expect(extractErrorMessage(serialized)).toBe(
      "The agent service is unavailable (503).",
    );
  });

  test("a rejectWithValue payload is a plain STRING and is the reason verbatim", () => {
    expect(extractErrorMessage("mandate_unfulfilled: no rung answers this job")).toBe(
      "mandate_unfulfilled: no rung answers this job",
    );
  });

  test("a FastAPI body's `detail` is read, string or object", () => {
    expect(extractErrorMessage({ detail: "Holder is not executable." })).toBe(
      "Holder is not executable.",
    );
    expect(
      extractErrorMessage({ detail: { code: "x", message: "Model refused." } }),
    ).toBe("Model refused.");
  });

  test("only a genuinely shapeless throw reaches the catch-all", () => {
    expect(extractErrorMessage({})).toBe("An unexpected error occurred");
  });
});

describe("V1 R2-1 — an orphaned body lock is repaired, an open one is not", () => {
  beforeEach(() => {
    __resetBodyPointerEventsRepairs();
    document.body.style.removeProperty("pointer-events");
    document.body.innerHTML = "";
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    document.body.style.removeProperty("pointer-events");
    document.body.innerHTML = "";
  });

  test("locked with no layer in the document: repaired, and every repair speaks", () => {
    document.body.style.pointerEvents = "none";
    expect(restoreBodyPointerEventsIfOrphaned(document)).toBe(true);
    expect(document.body.style.pointerEvents).toBe("");
    expect(bodyPointerEventsRepairCount()).toBe(1);
    expect(console.error).toHaveBeenCalledTimes(1);

    // 🚨 This used to assert the OPPOSITE — that a second repair counts but
    // does not print — on the reasoning that a repeated paragraph is noise. A
    // walk then measured the diagnostic logging ZERO times across a session in
    // which repairs demonstrably happened, and nobody could tell whether this
    // guard had done the work or something else had. Silence per repair
    // reintroduced the exact ambiguity the guard exists to remove, so the rule
    // flipped: dedupe the ESSAY, never the EVENT.
    document.body.style.pointerEvents = "none";
    expect(restoreBodyPointerEventsIfOrphaned(document)).toBe(true);
    expect(bodyPointerEventsRepairCount()).toBe(2);
    expect(console.error).toHaveBeenCalledTimes(2);
    expect((console.error as jest.Mock).mock.calls[1][0]).toBe(
      "[modal-layers] repaired an orphaned body lock (#2).",
    );
  });

  test("locked WITH a dialog open: left completely alone", () => {
    document.body.style.pointerEvents = "none";
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "alertdialog");
    // `data-state="open"` is what Radix actually stamps on a live layer, and
    // it is the signal the guard trusts. A bare role with no state and no box
    // is a MOUNTED-BUT-CLOSED layer, which must NOT block the repair — see the
    // "PRESENT is not OPEN" cases below.
    dialog.setAttribute("data-state", "open");
    document.body.appendChild(dialog);
    expect(restoreBodyPointerEventsIfOrphaned(document)).toBe(false);
    expect(document.body.style.pointerEvents).toBe("none");
    expect(bodyPointerEventsRepairCount()).toBe(0);
  });

  test("locked with an open Select's listbox: left alone", () => {
    document.body.style.pointerEvents = "none";
    const listbox = document.createElement("div");
    listbox.setAttribute("role", "listbox");
    listbox.setAttribute("data-state", "open");
    document.body.appendChild(listbox);
    expect(restoreBodyPointerEventsIfOrphaned(document)).toBe(false);
  });

  test("not locked: nothing to do", () => {
    expect(restoreBodyPointerEventsIfOrphaned(document)).toBe(false);
  });
});

describe("V1 R2-1 producer — a selection closes before its confirm opens", () => {
  test("the handoff waits for Radix to release its body lock, not merely one frame", async () => {
    const scheduled: FrameRequestCallback[] = [];
    let continued = false;
    let layerClosed = false;

    const handoff = afterCurrentLayerCloses(
      (callback) => {
        scheduled.push(callback);
        return scheduled.length;
      },
      () => layerClosed,
    ).then(() => {
      continued = true;
    });

    expect(continued).toBe(false);
    expect(scheduled).toHaveLength(1);

    scheduled.shift()?.(0);
    await Promise.resolve();
    expect(continued).toBe(false);
    expect(scheduled).toHaveLength(1);

    // Radix may commit the Select close several paints after onValueChange.
    scheduled.shift()?.(16);
    await Promise.resolve();
    expect(continued).toBe(false);
    expect(scheduled).toHaveLength(1);

    // The first unlocked paint is not yet a safe ownership boundary: the
    // closing layer can still commit one final body-style write afterward.
    layerClosed = true;
    scheduled.shift()?.(32);
    await Promise.resolve();
    expect(continued).toBe(false);
    expect(scheduled).toHaveLength(1);

    scheduled.shift()?.(48);
    await handoff;
    expect(continued).toBe(true);
  });
});

describe("V1 R2-2 — the write report outlives the save that produced it", () => {
  const written = JSON.stringify([{ agentId: "a" }, { x: [] }, true]);

  test("THE REGRESSION: dirty against a stale stored row does NOT clear it", () => {
    // Immediately after a save the draft differs from the STORED row (the
    // refetch has not landed), so `dirty` is true — the old rule cleared the
    // report right here, and `applies_in` never rendered a frame.
    const stored = JSON.stringify([null, {}, null]);
    const draft = written;
    expect(draft !== stored).toBe(true); // i.e. `dirty`
    expect(
      writeReportStillDescribesDraft({
        writtenSignature: written,
        draftSignature: draft,
      }),
    ).toBe(true);
  });

  test("editing away from what was written DOES clear it", () => {
    expect(
      writeReportStillDescribesDraft({
        writtenSignature: written,
        draftSignature: JSON.stringify([{ agentId: "b" }, { x: [] }, true]),
      }),
    ).toBe(false);
  });

  test("no write has spoken: there is nothing to keep", () => {
    expect(
      writeReportStillDescribesDraft({
        writtenSignature: null,
        draftSignature: written,
      }),
    ).toBe(false);
  });
});

describe("V1 R2-3 — who can decide for an organization, said before the click", () => {
  /**
   * The server's rule, copied from its own SQL (`public.is_org_admin_for`:
   * `role in ('owner','admin')`), which the router calls before any write
   * (`mandate_bindings.py:_principal_org` → 403). The client states the same
   * rule so the refusal arrives BEFORE a holder is chosen and Save is pressed —
   * proven live on 2026-08-31: nine organizations offered, and the one where
   * this account is a plain `member` refused after the click.
   */
  const canBind = (role: string | undefined) =>
    role === "owner" || role === "admin";

  test("owner and admin can; a plain member cannot; a non-member cannot", () => {
    expect(canBind("owner")).toBe(true);
    expect(canBind("admin")).toBe(true);
    // THE REGRESSION: this is the case the picker offered and the server 403'd.
    expect(canBind("member")).toBe(false);
    expect(canBind(undefined)).toBe(false);
  });
});

describe("R2-1 follow-up — PRESENT is not OPEN (walk: repaired only 2 of 6 probes)", () => {
  beforeEach(() => {
    __resetBodyPointerEventsRepairs();
    document.body.style.removeProperty("pointer-events");
    document.body.innerHTML = "";
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    document.body.style.removeProperty("pointer-events");
    document.body.innerHTML = "";
  });

  function lockWith(html: string) {
    document.body.innerHTML = html;
    document.body.style.pointerEvents = "none";
  }

  test("THE REGRESSION: a leftover Radix focus guard no longer disqualifies it", () => {
    // Radix leaves these behind; the first cut treated one as an open layer, so
    // any page that had EVER opened an overlay silently stopped being guarded.
    lockWith('<span data-radix-focus-guard tabindex="0"></span>');
    expect(restoreBodyPointerEventsIfOrphaned(document)).toBe(true);
  });

  test("a mounted-but-CLOSED dialog does not count as open", () => {
    lockWith('<div role="dialog" data-state="closed"></div>');
    expect(restoreBodyPointerEventsIfOrphaned(document)).toBe(true);
  });

  test("an aria-hidden listbox does not count as open", () => {
    lockWith('<div role="listbox" aria-hidden="true"></div>');
    expect(restoreBodyPointerEventsIfOrphaned(document)).toBe(true);
  });

  test("a genuinely OPEN dialog is still left completely alone", () => {
    lockWith('<div role="alertdialog" data-state="open"></div>');
    expect(restoreBodyPointerEventsIfOrphaned(document)).toBe(false);
    expect(document.body.style.pointerEvents).toBe("none");
  });
});

describe("R2-1 — THE WALKER'S 8-PROBE PROTOCOL (guard repaired exactly once per mount)", () => {
  beforeEach(() => {
    __resetBodyPointerEventsRepairs();
    document.body.style.removeProperty("pointer-events");
    document.body.innerHTML = "";
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    document.body.style.removeProperty("pointer-events");
    document.body.innerHTML = "";
  });

  /**
   * 🚨 THE EXACT FINGERPRINT the second walk measured: probe 1 repaired and
   * logged; probes 2-8 on the same page mount left `pointer-events: none`
   * forever. That is worse than having no guard at all, because the first
   * repair makes a dead guard look alive.
   *
   * Cause: leftover Radix nodes from any dropdown the person had opened and
   * closed satisfied the old "occupies space → treat as open" fallback, so
   * `hasOpenLayer` answered true for the rest of the page's life. This test
   * interleaves exactly those leftovers, as the walker was asked to.
   */
  test("repairs on ALL 8 probes with Radix leftovers present, and logs once", () => {
    const leftovers = [
      '<span data-radix-focus-guard tabindex="0"></span>',
      '<div role="dialog" data-state="closed"></div>',
      '<div role="listbox" aria-hidden="true"></div>',
      '<div data-radix-popper-content-wrapper></div>',
    ];
    let repaired = 0;
    for (let probe = 0; probe < 8; probe += 1) {
      // A dropdown was opened and closed since the last probe.
      document.body.innerHTML = leftovers.slice(0, (probe % 4) + 1).join("");
      document.body.style.pointerEvents = "none";
      if (restoreBodyPointerEventsIfOrphaned(document)) repaired += 1;
      expect(document.body.style.pointerEvents).toBe("");
    }
    expect(repaired).toBe(8);
    expect(bodyPointerEventsRepairCount()).toBe(8);
    // 🚨 EVERY repair speaks; only the ESSAY is deduplicated. A later walk
    // found the diagnostic logging ZERO times across a session in which
    // repairs demonstrably happened, so nobody could tell whether this guard
    // had done the work or something else had — which is the same "absent or
    // working, indistinguishable" defect the guard exists to end.
    expect(console.error).toHaveBeenCalledTimes(8);
    const messages = (console.error as jest.Mock).mock.calls.map((c) => c[0]);
    // The first carries the full cause and remedy…
    expect(messages[0]).toContain("every control on the page was dead");
    expect(messages[0]).toContain("let the first layer finish closing");
    // …and the rest are countable one-liners, not the essay again.
    expect(messages[1]).toBe(
      "[modal-layers] repaired an orphaned body lock (#2).",
    );
    expect(messages[7]).toBe(
      "[modal-layers] repaired an orphaned body lock (#8).",
    );
  });

  test("and it still refuses while a real layer is genuinely open", () => {
    document.body.innerHTML =
      '<span data-radix-focus-guard></span><div role="alertdialog" data-state="open"></div>';
    document.body.style.pointerEvents = "none";
    expect(restoreBodyPointerEventsIfOrphaned(document)).toBe(false);
    expect(document.body.style.pointerEvents).toBe("none");
  });
});
