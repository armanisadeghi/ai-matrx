import { ImageResponse } from "next/og";

import { resolveShareToken } from "@/utils/permissions/shareLinks";
import {
  resolveShareLensOg,
  type ShareLensOg,
} from "@/features/sharing/lenses/metadata";
import { createClient } from "@/utils/supabase/server";

// Social-card image for share links. Per-token data extraction lives in the
// share-lens metadata module (features/sharing/lenses/metadata.ts); this route
// owns only the JSX layouts — one per OG payload kind, plus the branded
// generic card every unregistered lens gets. Never sniff resource shapes here.
export const runtime = "nodejs";
export const alt = "Shared on AI Matrx";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const shell = {
  display: "flex",
  width: "1200px",
  height: "630px",
  background: "linear-gradient(135deg, #071126 0%, #111b3c 55%, #31205f 100%)",
  color: "white",
  fontFamily: "system-ui, sans-serif",
  padding: "64px",
  position: "relative" as const,
  overflow: "hidden" as const,
};

const glow = {
  position: "absolute" as const,
  width: "460px",
  height: "460px",
  borderRadius: "50%",
  background: "#6d5dfc",
  filter: "blur(100px)",
  opacity: 0.2,
  right: "-100px",
  top: "-120px",
};

function Badge({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        border: "1px solid #786cf8",
        background: "#6d5dfc33",
        borderRadius: "999px",
        padding: "10px 20px",
        fontSize: "18px",
        fontWeight: 650,
      }}
    >
      {children}
    </div>
  );
}

function Wordmark() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        color: "#cbd5e1",
        fontSize: "20px",
        fontWeight: 650,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "36px",
          height: "36px",
          borderRadius: "10px",
          background: "linear-gradient(135deg,#3b82f6,#8b5cf6)",
          color: "white",
        }}
      >
        M
      </div>
      AI Matrx
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        border: "1px solid #ffffff26",
        background: "#ffffff10",
        borderRadius: "16px",
        padding: "14px 22px",
        minWidth: "180px",
      }}
    >
      <span style={{ fontSize: "30px", fontWeight: 750 }}>{value}</span>
      <span style={{ color: "#9aa7bf", fontSize: "16px" }}>{label}</span>
    </div>
  );
}

function AiVisibilityCard({
  og,
}: {
  og: Extract<ShareLensOg, { kind: "ai_visibility" }>;
}) {
  return (
    <div style={shell}>
      <div style={glow} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          justifyContent: "space-between",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Badge>AI Visibility Report</Badge>
          <Wordmark />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div
            style={{
              fontSize: og.brand.length > 40 ? "46px" : "60px",
              fontWeight: 800,
              letterSpacing: "-0.04em",
              maxWidth: "940px",
              lineHeight: 1.05,
            }}
          >
            {og.brand}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "25px",
              color: "#b8c2d8",
              maxWidth: "970px",
              lineHeight: 1.35,
            }}
          >
            {`“${og.query.slice(0, 170)}”`}
          </div>
        </div>
        <div style={{ display: "flex", gap: "18px" }}>
          <Stat value={`${og.enginesChecked}/4`} label="engines checked" />
          <Stat value={String(og.mentions)} label="brand mentions" />
          <Stat
            value={og.bestRank ? `#${og.bestRank}` : "—"}
            label="best position"
          />
        </div>
      </div>
    </div>
  );
}

function GenericCard({
  og,
}: {
  og: Extract<ShareLensOg, { kind: "generic" }>;
}) {
  return (
    <div style={shell}>
      <div style={glow} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          justifyContent: "space-between",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Badge>{og.badge}</Badge>
          <Wordmark />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div
            style={{
              fontSize: og.title.length > 40 ? "46px" : "60px",
              fontWeight: 800,
              letterSpacing: "-0.04em",
              maxWidth: "980px",
              lineHeight: 1.05,
            }}
          >
            {og.title.slice(0, 120)}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "25px",
              color: "#b8c2d8",
              maxWidth: "970px",
              lineHeight: 1.35,
            }}
          >
            {og.description.slice(0, 170)}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            color: "#9aa7bf",
            fontSize: "18px",
          }}
        >
          Shared with you on AI Matrx
        </div>
      </div>
    </div>
  );
}

export default async function SharedTokenOgImage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const resolved = await resolveShareToken(token, supabase as never);
  const og = resolveShareLensOg(resolved);

  return new ImageResponse(
    og.kind === "ai_visibility" ? (
      <AiVisibilityCard og={og} />
    ) : (
      <GenericCard og={og} />
    ),
    size,
  );
}
