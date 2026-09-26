/**
 * GFM's table rule for pipes in code (spec example 200; GitHub renders it so):
 * a row is split into cells FIRST, then the `\|` that kept a pipe inside a
 * cell is unescaped — inside code spans too. micromark keeps the backslash in
 * code, so without this the chat answer and Preview showed `err\|warn` where
 * the editor (marked) showed `err|warn` (verify-RC-B4 R4-3). Only inline code
 * inside a table cell is touched; code outside a table keeps every byte.
 */
type Node = { type: string; value?: string; children?: Node[] };

function unescapeCodeIn(node: Node): void {
  if (node.type === "inlineCode" && typeof node.value === "string") {
    node.value = node.value.replace(/\\\|/g, "|");
    return;
  }
  node.children?.forEach(unescapeCodeIn);
}

function visit(node: Node): void {
  if (node.type === "tableCell") {
    unescapeCodeIn(node);
    return;
  }
  node.children?.forEach(visit);
}

export default function remarkTableCodePipes() {
  return (tree: Node) => {
    visit(tree);
  };
}
