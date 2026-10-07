// app/(public)/templates/[slug]/social-image/route.tsx — a template's social card (lane CHAIR-GALLERY):
// its name and business over a picture of its main table with the first sample rows. The page's
// OpenGraph and Twitter image point here (generateMetadata in ../page.tsx).

import { ImageResponse } from "next/og";
import { formatUsd } from "@ai-matrx/kit/format";

import { readTemplatePage } from "@/features/make/gallery/publicCatalogue.server";
import type { ShowField, ShowTable } from "@/features/make/gallery/TemplateShowcase";

export const runtime = "nodejs";
export const revalidate = 86400;
const size = { width: 1200, height: 630 };

const SIMPLE = new Set(["text", "select", "currency", "number", "integer", "decimal", "percent", "email", "phone", "datetime", "checkbox"]);

function cell(field: ShowField, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field.parityType === "currency" && typeof value === "number") return formatUsd(value, { digits: "whole" });
  if (field.parityType === "percent" && typeof value === "number") return `${value}%`;
  if (field.parityType === "checkbox") return value ? "Yes" : "No";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }
  const s = String(value);
  return s.length > 28 ? `${s.slice(0, 27)}…` : s;
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await readTemplatePage(decodeURIComponent(slug));
  const name = page?.card.name ?? "Template";
  const business = page?.spec.business?.name ?? page?.card.business ?? "";
  const table: ShowTable | undefined = page?.spec.tables[0];
  const fields = table ? [...table.fields.filter((f) => f.key === table.titleField), ...table.fields.filter((f) => f.key !== table.titleField && SIMPLE.has(f.parityType))].slice(0, 4) : [];
  const rows = table?.rows?.slice(0, 5) ?? [];

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "1200px", height: "630px", background: "linear-gradient(135deg, #071126 0%, #111b3c 55%, #31205f 100%)", color: "white", fontFamily: "system-ui, sans-serif", padding: "56px", gap: "28px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", fontSize: "22px", color: "#a5b4fc" }}>AI Matrx template</div>
          <div style={{ display: "flex", fontSize: "52px", fontWeight: 700, lineHeight: 1.1 }}>{name.length > 60 ? `${name.slice(0, 59)}…` : name}</div>
          {business ? <div style={{ display: "flex", fontSize: "26px", color: "#cbd5e1" }}>{business}</div> : null}
        </div>
        {table && fields.length ? (
          <div style={{ display: "flex", flexDirection: "column", background: "#ffffff", color: "#0f172a", borderRadius: "16px", overflow: "hidden", fontSize: "20px" }}>
            <div style={{ display: "flex", background: "#eef2ff", padding: "10px 18px", fontWeight: 700, fontSize: "18px", color: "#3730a3" }}>{table.name}</div>
            <div style={{ display: "flex", padding: "8px 18px", background: "#f8fafc", color: "#64748b", fontSize: "17px" }}>
              {fields.map((f) => (
                <div key={f.key} style={{ display: "flex", flex: 1 }}>
                  {f.label}
                </div>
              ))}
            </div>
            {rows.map((r) => (
              <div key={r.key} style={{ display: "flex", padding: "8px 18px", borderTop: "1px solid #e2e8f0" }}>
                {fields.map((f, i) => (
                  <div key={f.key} style={{ display: "flex", flex: 1, fontWeight: i === 0 ? 600 : 400, color: i === 0 ? "#0f172a" : "#334155" }}>
                    {cell(f, r.values[f.key])}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    ),
    size,
  );
}
