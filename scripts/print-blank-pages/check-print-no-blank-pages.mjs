/**
 * NO BLANK PRINTED PAGES (`pnpm check:print-no-blank-pages`).
 *
 * A composed message print (prose + embedded blocks, the document Quick Print
 * opens) is rendered by real headless Chromium to a PDF, and every page is read
 * back: a page whose only content is its page number ("4 / 25") FAILS the
 * check. On 2026-10-08 the admin's 25-page message print had two of those —
 * a diagram taller than a page was pushed whole to the next page, leaving its
 * panel header alone at the foot of one page and an empty page after it.
 *
 * Content = any text besides the page number, or any painted image. The
 * fixture mixes the shapes that broke: a diagram picture taller than a page in
 * a titled panel, a captured web page (an image) taller than a page, prose,
 * code, a table, and page breaks (two in a row, one at the very end).
 *
 * `--package <dir>` checks a local @ai-matrx/print build (its `dist`) instead
 * of the installed one — how a fix is proven before it is published.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
const args = process.argv.slice(2);
const pkgFlag = args.indexOf("--package");
const markdownModule = pkgFlag >= 0
    ? pathToFileURL(path.resolve(args[pkgFlag + 1], "dist/markdown.js")).href
    : "@ai-matrx/print/markdown";
const { renderMarkdownDocument } = (await import(markdownModule));
/** A tall picture with words in it (a flowchart's shape). */
function tallSvg(label) {
    const boxes = Array.from({ length: 9 }, (_, i) => `<rect x="150" y="${40 + i * 150}" width="300" height="90" fill="#eef" stroke="#55c"/><text x="300" y="${90 + i * 150}" text-anchor="middle" font-size="22" font-family="sans-serif">${label} step ${i + 1}</text>`).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1400" viewBox="0 0 600 1400">${boxes}</svg>`;
}
/** A tall raster (a captured web page), drawn in a page so it is a real PNG. */
async function tallPng() {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 800, height: 2600 } });
    await page.setContent(`<body style="margin:0;background:linear-gradient(#fde68a,#93c5fd);height:2600px"></body>`);
    const png = await page.screenshot({ fullPage: true });
    await browser.close();
    return `data:image/png;base64,${png.toString("base64")}`;
}
const prose = (n) => Array.from({ length: n }, (_, i) => `Paragraph ${i + 1} of the answer explains the finding in plain words so a page fills up.`).join("\n\n");
const MARKDOWN = [
    "# How the eye fills gaps",
    prose(9),
    '<artifact type="mermaid" title="Flowchart">',
    "graph TD; A-->B",
    "</artifact>",
    prose(3),
    "```ts\nconst seen = fill(gaps);\n```",
    "| Stage | Time |\n| --- | --- |\n| Retina | 1 ms |\n| Cortex | 80 ms |",
    prose(6),
    '<artifact type="html" title="Optical illusion page">',
    "<!DOCTYPE html><html><body>x</body></html>",
    "</artifact>",
    "```mermaid\ngraph LR; X-->Y\n```",
    prose(2),
    "\\newpage",
    "\\newpage",
    "## After two breaks",
    prose(2),
    "\\newpage",
].join("\n\n");
async function main() {
    const png = await tallPng();
    const html = renderMarkdownDocument(MARKDOWN, {
        skin: "article",
        title: "Blank page guard",
        renderBlock: (block) => {
            if (block.type === "mermaid")
                return { svg: tallSvg(block.source), alt: "Diagram" };
            if (block.type === "html")
                return { image: { src: png, alt: "Web page" } };
            return null;
        },
    });
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "Letter", printBackground: true, preferCSSPageSize: true });
    await browser.close();
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }).promise;
    const IMAGE_OPS = new Set([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject]);
    const blank = [];
    const report = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
        const p = await doc.getPage(n);
        const text = (await p.getTextContent()).items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ")
            .replace(/\b\d+\s*\/\s*\d+\b/g, "")
            .trim();
        const ops = await p.getOperatorList();
        const images = ops.fnArray.filter((fn) => IMAGE_OPS.has(fn)).length;
        report.push(`page ${n}: ${text.length} chars, ${images} image(s)${text ? ` — "${text.slice(0, 50)}"` : ""}`);
        if (!text && images === 0)
            blank.push(n);
    }
    console.log(report.join("\n"));
    if (blank.length > 0) {
        console.error(`\nFAIL: ${blank.length} of ${doc.numPages} printed page(s) hold nothing but the page number: ${blank.join(", ")}`);
        process.exit(1);
    }
    console.log(`\nPASS: every one of ${doc.numPages} printed pages has content`);
}
await main();
