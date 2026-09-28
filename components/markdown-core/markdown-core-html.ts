// components/markdown-core/markdown-core-html.ts
//
// THE ONE CORE's HTML edge: markdown → an HTML tree (hast) through the SAME
// plugin table every rendered surface uses (markdown-core-presets.ts, preset
// "gfm": GFM + the extended syntax). For markup that leaves the app as HTML —
// email bodies, CMS drafts — where no React tree renders it.
//
// Raw HTML in the markdown passes through (as CommonMark renders it); the
// CALLER sanitizes the tree before serializing (lib/markdown/safe-html.ts owns
// the allow-list). Synchronous and DOM-free, so it runs in API routes and in the
// browser alike. Registered as a core file of the one markdown core in
// scripts/rich-content-inventory/registry.ts — the only non-React edge.

import { unified, type PluggableList } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import type { Element, Root, RootContent } from "hast";
import { MARKDOWN_PRESETS, prepareCoreSource } from "./markdown-core-presets";

const PRESET = "gfm" as const;

const processor = unified()
  .use(remarkParse)
  .use((MARKDOWN_PRESETS[PRESET].remark ?? []) as PluggableList)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use((MARKDOWN_PRESETS[PRESET].rehype ?? []) as PluggableList);

const HEADING = /^h[1-6]$/;

/**
 * The heading anchor the extended syntax adds is a hover affordance of a live
 * page (an empty `<a href="#slug">`, and the `user-content-` id it targets);
 * static markup (an email, a CMS page) has no hover, so both are dropped here
 * rather than shipped as an empty link and a generated id.
 */
function dropHeadingAnchors(nodes: RootContent[]): RootContent[] {
  return nodes
    .filter((node) => {
      if (node.type !== "element" || node.tagName !== "a") return true;
      const href = String((node as Element).properties?.href ?? "");
      return !(href.startsWith("#") && (node as Element).children.length === 0);
    })
    .map((node) => {
      if (node.type === "element") {
        const id = node.properties?.id;
        if (HEADING.test(node.tagName) && typeof id === "string" && id.startsWith("user-content-")) {
          delete node.properties.id;
        }
        node.children = dropHeadingAnchors(node.children as RootContent[]) as Element["children"];
      }
      return node;
    });
}

/** Markdown → the core's HTML tree (unsanitized; sanitize before serializing). */
export function markdownToHast(markdown: string): Root {
  const source = prepareCoreSource(markdown, PRESET);
  const tree = processor.runSync(processor.parse(source)) as Root;
  tree.children = dropHeadingAnchors(tree.children);
  return tree;
}
