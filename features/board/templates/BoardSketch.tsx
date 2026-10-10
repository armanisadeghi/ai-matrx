"use client";

// A flat picture of a board's layout for the template picker: frames, tiles (named), and the lines between them.
// No live tile is mounted, so previewing a template can never create a note, start a chat or load a record.

import type { BoardDocument } from "../board/document";

const KIND_LABELS: Record<string, string> = { text: "Write-up", label: "Text", html: "Page", stream: "AI result", thread: "Thread", record: "Record" };

/** The tile's kind as a person reads it ("social-post" -> "Social post"), never the registry key. */
function kindLabel(source: BoardDocument["nodes"][number]["source"]): string {
  const key = source.kind === "entity" ? source.entity : source.kind;
  const named = KIND_LABELS[key];
  if (named) return named;
  const words = key.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function BoardSketch({ doc }: { doc: BoardDocument }) {
  const boxes = [...doc.groups.map((g) => g.rect), ...doc.nodes.map((n) => n.rect)];
  if (boxes.length === 0) return <p className="text-sm text-muted-foreground">This board is empty.</p>;
  const pad = 40;
  const minX = Math.min(...boxes.map((r) => r.x)) - pad;
  const minY = Math.min(...boxes.map((r) => r.y)) - pad;
  const maxX = Math.max(...boxes.map((r) => r.x + r.w)) + pad;
  const maxY = Math.max(...boxes.map((r) => r.y + r.h)) + pad;
  const byId = new Map(doc.nodes.map((n) => [n.id, n.rect]));
  return (
    <svg
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      className="h-auto w-full max-w-4xl"
      role="img"
      aria-label={`Layout: ${doc.nodes.length} tiles`}
    >
      {doc.groups.map((g) => (
        <g key={g.id}>
          <rect x={g.rect.x} y={g.rect.y} width={g.rect.w} height={g.rect.h} rx={24} fill="none" stroke="currentColor" strokeOpacity={0.3} strokeDasharray="14 10" strokeWidth={4} />
          <text x={g.rect.x + 24} y={g.rect.y + 52} fontSize={36} fill="currentColor" fillOpacity={0.55}>
            {g.title}
          </text>
        </g>
      ))}
      {doc.edges.map((e) => {
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!a || !b) return null;
        return <line key={e.id} x1={a.x + a.w / 2} y1={a.y + a.h / 2} x2={b.x + b.w / 2} y2={b.y + b.h / 2} stroke="currentColor" strokeOpacity={0.45} strokeWidth={5} />;
      })}
      {doc.nodes.map((n) => (
        <g key={n.id}>
          <rect x={n.rect.x} y={n.rect.y} width={n.rect.w} height={n.rect.h} rx={16} className="fill-card stroke-border" strokeWidth={4} />
          <text x={n.rect.x + 24} y={n.rect.y + 56} fontSize={34} fontWeight={600} fill="currentColor">
            {n.title}
          </text>
          <text x={n.rect.x + 24} y={n.rect.y + 100} fontSize={26} fill="currentColor" fillOpacity={0.55}>
            {kindLabel(n.source)}
          </text>
        </g>
      ))}
    </svg>
  );
}
