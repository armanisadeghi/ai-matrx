/**
 * probes — the ONE definition of the escape attempts, run identically in the
 * sandbox frame and in the page.
 *
 * It is one function on purpose. The frame's refusals only mean something if
 * the SAME code, in the SAME browser, in the SAME second, is NOT refused where
 * no boundary exists — otherwise a green run could be a broken network, a
 * blocked host, or a typo. `kind-sandbox.spec.ts` runs it in both places and
 * asserts the difference, which makes the gate-off column a permanent RED
 * control rather than a one-time manual observation.
 *
 * It is written as a string-evaluated function (no imports, ES5-ish) because
 * it is injected into a sandboxed document that can load nothing.
 */
export interface ProbeReport {
    /** What the browser REFUSED, by CSP directive, as the browser names it. */
    violations: Array<{ directive: string; blockedURI: string }>;
    /** Per-probe outcome: "refused" | "allowed" | the error text. */
    results: Record<string, string>;
    /** True when the `javascript:` URL actually ran. */
    javascriptUrlRan: boolean;
}

export const PROBE_NAMES = [
    "fetch",
    "image",
    "beacon",
    "xhr",
    "websocket",
    "javascript-href",
] as const;

/** The isolation probes a CSP cannot answer — only an opaque origin can. */
export const ISOLATION_PROBE_NAMES = [
    "window.top",
    "parent.document",
    "document.cookie",
    "localStorage",
    "sessionStorage",
] as const;

/**
 * Both sources are handed to Playwright as a SELF-INVOKING expression
 * (`probeExpression()` / `isolationExpression()`), not as a function plus an
 * argument. Playwright evaluates a string as an expression and does not pass
 * `arg` to it — measured 2026-09-12: `frame.evaluate(SOURCE, REMOTE)` returned
 * `undefined` because the function object it produced was never called. The
 * expression form is unambiguous in both engines.
 *
 * Returns after a fixed settle so error events and CSP reports have landed.
 */
export const PROBE_SOURCE = String.raw`async (remote) => {
  const violations = [];
  const onViolation = (e) => violations.push({ directive: e.effectiveDirective || e.violatedDirective, blockedURI: e.blockedURI });
  document.addEventListener("securitypolicyviolation", onViolation);

  const results = {};
  const settled = [];

  try { await fetch(remote + "/probe-fetch"); results["fetch"] = "allowed"; }
  catch (err) { results["fetch"] = "refused: " + (err && err.message ? err.message : String(err)); }

  settled.push(new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { results["image"] = "allowed"; resolve(); };
    img.onerror = () => { results["image"] = "refused"; resolve(); };
    img.src = remote + "/probe-image.png";
    setTimeout(() => { if (!results["image"]) { results["image"] = "no answer"; } resolve(); }, 2500);
  }));

  try {
    const sent = navigator.sendBeacon(remote + "/probe-beacon", "x");
    results["beacon"] = sent ? "allowed (return value; the network log is the truth)" : "refused";
  } catch (err) { results["beacon"] = "refused: " + String(err); }

  settled.push(new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.onload = () => { results["xhr"] = "allowed"; resolve(); };
      xhr.onerror = () => { results["xhr"] = "refused"; resolve(); };
      xhr.open("GET", remote + "/probe-xhr");
      xhr.send();
      setTimeout(() => { if (!results["xhr"]) { results["xhr"] = "no answer"; } resolve(); }, 2500);
    } catch (err) { results["xhr"] = "refused: " + String(err); resolve(); }
  }));

  settled.push(new Promise((resolve) => {
    try {
      const ws = new WebSocket(remote.replace(/^http/, "ws") + "/probe-socket");
      ws.onopen = () => { results["websocket"] = "allowed"; try { ws.close(); } catch (e) {} resolve(); };
      ws.onerror = () => { results["websocket"] = "refused"; resolve(); };
      setTimeout(() => { if (!results["websocket"]) { results["websocket"] = "no answer"; } resolve(); }, 2500);
    } catch (err) { results["websocket"] = "refused: " + String(err); resolve(); }
  }));

  delete window.__MATRX_PROBE_PWNED__;
  const a = document.createElement("a");
  a.href = "javascript:window.__MATRX_PROBE_PWNED__=1";
  a.textContent = "probe";
  document.body.appendChild(a);
  a.click();

  await Promise.all(settled);
  await new Promise((r) => setTimeout(r, 400));
  const javascriptUrlRan = window.__MATRX_PROBE_PWNED__ === 1;
  results["javascript-href"] = javascriptUrlRan ? "allowed" : "refused";
  a.remove();
  document.removeEventListener("securitypolicyviolation", onViolation);
  return { violations, results, javascriptUrlRan };
}`;

/** The opaque-origin probes. Same shape, same reason for being one string. */
/** The probe suite, ready to evaluate. */
export function probeExpression(remote: string): string {
    return `(${PROBE_SOURCE})(${JSON.stringify(remote)})`;
}

/** The opaque-origin suite, ready to evaluate. */
export function isolationExpression(): string {
    return `(${ISOLATION_SOURCE})()`;
}

export const ISOLATION_SOURCE = String.raw`() => {
  const out = {};
  const probe = (name, fn) => {
    try { fn(); out[name] = "allowed"; }
    catch (err) { out[name] = (err && err.name ? err.name : "Error") + ": " + (err && err.message ? err.message : String(err)); }
  };
  probe("window.top", () => { void window.top.location.href; });
  probe("parent.document", () => { void window.parent.document.title; });
  probe("document.cookie", () => { void document.cookie; });
  probe("localStorage", () => { window.localStorage.setItem("matrx-probe", "1"); });
  probe("sessionStorage", () => { window.sessionStorage.setItem("matrx-probe", "1"); });
  out["isSubFrame"] = String(window.parent !== window.self);
  // THE TWO ORIGINS, measured rather than assumed. They are NOT the same
  // thing inside a sandboxed frame and the difference is load-bearing: the
  // frame-side origin check compares the SERVED origin, and a code comment
  // that named the wrong one stood in this repo until S6.
  out["location.origin"] = String(location.origin);
  out["self.origin"] = String(self.origin);
  out["url.origin"] = String(new URL(location.href).origin);
  return out;
}`;
