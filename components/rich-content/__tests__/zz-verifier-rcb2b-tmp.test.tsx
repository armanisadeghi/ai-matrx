import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

jest.mock("server-only", () => ({}));
// The client edge, rendered synchronously (next/dynamic has no loader in jest).
jest.mock("@/components/markdown-core/MarkdownCore", () => ({
  __esModule: true,
  default: jest.requireActual("@/components/markdown-core/MarkdownCoreImpl")
    .default,
}));
jest.mock("@/components/matrx/buttons/MarkdownCopyButton", () => ({
  InlineCopyButton: () => null,
}));
jest.mock("@/features/code-editor/components/code-block/CodeBlock", () => ({
  __esModule: true,
  default: ({ code }: { code: string }) => <pre>{code}</pre>,
}));
import fs from "node:fs";
import { RichContentServer } from "@/components/rich-content/server/RichContentServer";
import { RichContentStaticProse } from "@/components/rich-content/RichContentStaticProse";
import RichContentStandardImpl from "@/components/rich-content/RichContentStandardImpl";

const NOTE = fs.readFileSync(process.env.VERIFY_NOTE as string, "utf8");
const OUT = process.env.VERIFY_OUT as string;

function clientHtml(el: React.ReactElement): string {
  const c = document.createElement("div");
  document.body.appendChild(c);
  let root: Root | null = null;
  act(() => {
    root = createRoot(c);
    root.render(el);
  });
  const h = c.innerHTML;
  act(() => {
    root?.unmount();
  });
  c.remove();
  return h;
}

test("dump", () => {
  const server = renderToStaticMarkup(<RichContentServer level="standard" source={NOTE} />);
  const staticProse = renderToStaticMarkup(<RichContentStaticProse source={NOTE} />);
  const client = clientHtml(<RichContentStandardImpl content={NOTE} />);
  fs.writeFileSync(OUT + "/server.html", server);
  fs.writeFileSync(OUT + "/staticprose.html", staticProse);
  fs.writeFileSync(OUT + "/client.html", client);
  const big = Array.from({ length: 3000 }, (_, i) => `## Section ${i}\n\n**Bold ${i}** with $x_${i}^2$ and a [link](https://a.example/${i}).\n\n- item\n- item\n`).join("\n");
  const t0 = Date.now();
  const bigHtml = renderToStaticMarkup(<RichContentServer level="standard" source={big} />);
  fs.writeFileSync(OUT + "/big.txt", `len=${big.length} html=${bigHtml.length} ms=${Date.now() - t0} h2=${(bigHtml.match(/<h2/g) || []).length} katex=${(bigHtml.match(/class="katex"/g) || []).length} literal**=${(bigHtml.replace(/<[^>]+>/g, "").match(/\*\*/g) || []).length}`);
  const edges = ["$", "$$", "$$\n\\frac{1}{", "\\(", "$5 and $10", "\\[x\\]", "$\\begin{matrix}a&b\\end{matrix}$", "$\\undefinedmacro{x}$", "$$\n" + "\\left(".repeat(200) + "\n$$", "$\\def\\a{\\a}\\a$", "$\\rule{1000em}{1000em}$", "$\\color{red}{x}$", "$\\href{javascript:alert(1)}{x}$"];
  const edgeOut = edges.map((e) => {
    try {
      return JSON.stringify(e.slice(0, 40)) + " => " + renderToStaticMarkup(<RichContentServer level="standard" source={e} />).slice(0, 400);
    } catch (err) {
      return JSON.stringify(e.slice(0, 40)) + " THREW " + String(err).slice(0, 200);
    }
  });
  fs.writeFileSync(OUT + "/edges.txt", edgeOut.join("\n\n"));
});
