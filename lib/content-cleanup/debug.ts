// lib/content-cleanup/debug.ts
//
// Builds an XML-ish debug payload for the cleanup run — the "Copy for AI"
// output. Total transparency: every protected region, every operation outcome,
// the full before/after content, and the run stats, with no truncation. Paste
// it to an agent (or read it yourself) to see exactly what the engine did.

import type { CleanupReport } from "./types";

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Wrap text in CDATA, escaping any literal "]]>" so it stays well-formed. */
function cdata(text: string): string {
  return `<![CDATA[${text.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

export interface CleanupDebugContext {
  noteId?: string;
  noteLabel?: string;
  /** ISO timestamp; pass from the caller (the engine has no clock). */
  timestamp?: string;
}

export function buildCleanupDebugXml(
  report: CleanupReport,
  ctx: CleanupDebugContext = {},
): string {
  const { stats } = report;
  const lines: string[] = [];

  lines.push("<note-cleanup-debug>");

  const metaAttrs = [
    ctx.noteId ? `noteId="${escapeAttr(ctx.noteId)}"` : null,
    ctx.noteLabel ? `noteLabel="${escapeAttr(ctx.noteLabel)}"` : null,
    ctx.timestamp ? `timestamp="${escapeAttr(ctx.timestamp)}"` : null,
    `changed="${report.changed}"`,
  ]
    .filter(Boolean)
    .join(" ");
  lines.push(`  <meta ${metaAttrs} />`);

  lines.push(
    `  <stats charsBefore="${stats.charsBefore}" charsAfter="${stats.charsAfter}" ` +
      `protectedChars="${stats.protectedChars}" cleanableChars="${stats.cleanableChars}" ` +
      `protectedRegions="${stats.protectedRegions}" totalChanges="${stats.totalChanges}" />`,
  );

  lines.push("  <operations>");
  for (const op of report.operations) {
    lines.push(
      `    <operation id="${escapeAttr(op.id)}" label="${escapeAttr(op.label)}" ` +
        `enabled="${op.enabled}" changes="${op.changes}" />`,
    );
  }
  lines.push("  </operations>");

  lines.push(`  <protected-regions count="${report.protectedRegions.length}">`);
  for (const r of report.protectedRegions) {
    lines.push(
      `    <region kind="${escapeAttr(r.kind)}" confidence="${escapeAttr(r.confidence)}" ` +
        `start="${r.start}" end="${r.end}" lineCount="${r.lineCount}" reason="${escapeAttr(r.reason)}">`,
    );
    lines.push(`      <preview>${escapeAttr(r.preview)}</preview>`);
    lines.push("    </region>");
  }
  lines.push("  </protected-regions>");

  lines.push(`  <original>${cdata(report.original)}</original>`);
  lines.push(`  <cleaned>${cdata(report.cleaned)}</cleaned>`);

  lines.push("</note-cleanup-debug>");
  return lines.join("\n");
}
