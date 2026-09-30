/**
 * Every board resizes its tiles. A `<SpatialTile>` that can be MOVED must say
 * how it is RESIZED: `onResize={handler}`, or `onResize={null}` for a board
 * whose own layout model cannot take a size (it then says why in a comment).
 * A board that forgets resize fails here, by file and line.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const REPO = join(__dirname, "..", "..", "..");

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) tsxFiles(path, out);
    else if (name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

interface Use {
  where: string;
  movable: boolean;
  resize: "handler" | "null" | "missing";
}

function spatialTileUses(): Use[] {
  const uses: Use[] = [];
  for (const file of tsxFiles(join(REPO, "features"))) {
    const text = readFileSync(file, "utf8");
    if (!text.includes("<SpatialTile")) continue;
    const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        node.tagName.getText(src) === "SpatialTile"
      ) {
        const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
        const named = (n: string) => attrs.find((a) => a.name.getText(src) === n);
        const resize = named("onResize");
        const expr = resize?.initializer && ts.isJsxExpression(resize.initializer) ? resize.initializer.expression : undefined;
        const { line } = src.getLineAndCharacterOfPosition(node.getStart(src));
        uses.push({
          where: `${relative(REPO, file)}:${line + 1}`,
          movable: !!named("onMove"),
          resize: !resize ? "missing" : expr && expr.kind === ts.SyntaxKind.NullKeyword ? "null" : "handler",
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(src);
  }
  return uses;
}

describe("every board wires tile resize", () => {
  const uses = spatialTileUses();

  it("finds the boards", () => {
    // /board, the demo, the meeting board, the workflow run board, War Room.
    expect(new Set(uses.map((u) => u.where.split(":")[0])).size).toBeGreaterThanOrEqual(5);
  });

  it("no movable tile is mounted without a resize decision", () => {
    expect(uses.filter((u) => u.movable && u.resize === "missing").map((u) => u.where)).toEqual([]);
  });

  it("only War Room opts out (its parts are sized by its thread layout)", () => {
    const optedOut = uses.filter((u) => u.resize === "null").map((u) => u.where.split(":")[0]);
    expect([...new Set(optedOut)]).toEqual(
      optedOut.length ? ["features/war-room/components/board/RoomBoardView.tsx"] : [],
    );
  });
});
