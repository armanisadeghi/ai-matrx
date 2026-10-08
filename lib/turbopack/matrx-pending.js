// The stand-in the dev server compiles in for an @ai-matrx name the installed package does not ship
// yet (lib/turbopack/matrx-pending-imports-loader.cjs → scripts/lib/matrx-pending-imports.mjs).
// It announces itself — one console error per name, a red inline box wherever it renders — and
// otherwise stays inert so the module around it loads and every other route keeps working.
// Never reached by a build: the loader is wired for `next dev` only.
import { createElement } from "react";

const announced = new Set();
const INERT = new Set(["then", "$$typeof", "prototype", "__esModule", "toJSON", "displayName", "defaultProps", "propTypes", "contextTypes", "getDerivedStateFromProps", "_init", "_payload", "render", "compare", "type"]);

function label(info, name) {
  const from = info.version ? `${info.pkg}@${info.version}` : `${info.pkg} (not installed)`;
  return `${name === "*" ? info.specifier : `${name} (${info.specifier})`} — not in ${from}${info.source ? `; source ${info.source}` : ""}`;
}

function announce(info, name) {
  const key = `${info.file}|${info.specifier}|${name}`;
  if (announced.has(key)) return;
  announced.add(key);
  console.error(
    `[matrx-pending] ${info.file}:${info.line} uses ${label(info, name)}. Placeholder rendered; publish the package and run pnpm up ${info.pkg}@latest.`,
  );
}

function Pending({ text }) {
  return createElement(
    "span",
    {
      role: "alert",
      "data-matrx-pending": "",
      title: text,
      className: "inline-flex max-w-full truncate rounded border border-destructive bg-destructive/10 px-1.5 py-0.5 font-mono text-xs text-destructive",
    },
    `Not published yet: ${text}`,
  );
}

function stand(info, name) {
  const text = label(info, name);
  const target = () => {};
  return new Proxy(target, {
    get(_, key) {
      if (key === Symbol.toPrimitive || key === "toString" || key === "valueOf") return () => `[matrx-pending ${text}]`;
      if (key === Symbol.iterator) return function* empty() {};
      if (typeof key === "symbol" || INERT.has(key)) return undefined;
      return stand(info, `${name}.${key}`);
    },
    has: () => false,
    // A Capitalized name is a component: render a red box naming what is pending. Anything else is
    // a hook or function (useTypedTable(), defineTypedTable(), f.text()): hand back another stand-in so
    // the caller's `.rows.filter(…)` keeps going and the page renders around the gap.
    apply: () => (/^[A-Z]/.test(name.split(".").pop() ?? "") || name === "default" ? createElement(Pending, { text }) : stand(info, `${name}()`)),
  });
}

export function matrxPending(info, name) {
  announce(info, name);
  return stand(info, name);
}

matrxPending.namespace = (info) => {
  announce(info, "*");
  return new Proxy(
    {},
    {
      get(_, key) {
        if (typeof key === "symbol" || key === "then" || key === "__esModule") return undefined;
        return stand(info, String(key));
      },
    },
  );
};
