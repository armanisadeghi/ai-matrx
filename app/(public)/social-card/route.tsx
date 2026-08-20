import { ImageResponse } from "next/og";

import {
  resolveSocialCardTheme,
  sanitizeSocialCardText,
} from "@/features/social-cards/social-card";

export const runtime = "edge";

const CARD_SIZE = { width: 1200, height: 630 };

function Motif({ motif, accent }: { motif: string; accent: string }) {
  if (motif === "grid") {
    return (
      <div style={{ display: "flex", position: "absolute", inset: 0, opacity: 0.18, backgroundImage: `linear-gradient(${accent}55 1px, transparent 1px), linear-gradient(90deg, ${accent}55 1px, transparent 1px)`, backgroundSize: "72px 72px", transform: "perspective(500px) rotateX(58deg) scale(1.45)", transformOrigin: "bottom" }} />
    );
  }
  if (motif === "rays") {
    return (
      <div style={{ display: "flex", position: "absolute", width: 620, height: 620, right: -120, top: -210, border: `2px solid ${accent}55`, borderRadius: 310, opacity: 0.7 }}>
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={index} style={{ display: "flex", position: "absolute", width: 520, height: 2, left: 50, top: 309, background: `${accent}55`, transform: `rotate(${index * 31}deg)` }} />
        ))}
      </div>
    );
  }
  if (motif === "stack") {
    return (
      <div style={{ display: "flex", position: "absolute", right: 82, top: 82, width: 320, height: 320 }}>
        {[0, 1, 2].map((index) => (
          <div key={index} style={{ display: "flex", position: "absolute", width: 220, height: 150, right: index * 32, top: index * 54, border: `2px solid ${accent}66`, borderRadius: 28, transform: `rotate(${8 - index * 7}deg)`, background: `${accent}12` }} />
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", position: "absolute", width: 520, height: 520, right: -60, top: -140, border: `2px solid ${accent}55`, borderRadius: 260, boxShadow: `inset 0 0 0 70px transparent, inset 0 0 0 72px ${accent}22, inset 0 0 0 150px transparent, inset 0 0 0 152px ${accent}22` }} />
  );
}

export async function GET(request: Request): Promise<ImageResponse> {
  const params = new URL(request.url).searchParams;
  const title = sanitizeSocialCardText(params.get("title"), 96) || "AI Matrx";
  const description = sanitizeSocialCardText(params.get("description"), 180);
  const eyebrow = sanitizeSocialCardText(params.get("eyebrow"), 36) || "AI Matrx";
  const intent = sanitizeSocialCardText(params.get("intent"), 32);
  const seed = sanitizeSocialCardText(params.get("seed"), 96) || `${intent}:${title}`;
  const theme = resolveSocialCardTheme(seed, params.get("theme"));

  return new ImageResponse(
    (
      <div style={{ display: "flex", position: "relative", width: "100%", height: "100%", overflow: "hidden", color: "#fff", background: `linear-gradient(135deg, ${theme.background} 0%, ${theme.surface} 100%)`, fontFamily: "system-ui, sans-serif", padding: "64px 70px" }}>
        <div style={{ display: "flex", position: "absolute", width: 560, height: 560, right: -100, top: -200, borderRadius: 280, background: theme.glow, filter: "blur(105px)", opacity: 0.38 }} />
        <Motif motif={theme.motif} accent={theme.accent} />
        <div style={{ display: "flex", position: "relative", flexDirection: "column", width: "100%", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, color: theme.accent, fontSize: 19, fontWeight: 750, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              <div style={{ display: "flex", width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 13, background: theme.accent, color: theme.background, fontSize: 22, fontWeight: 900 }}>M</div>
              {eyebrow}
            </div>
            {intent ? <div style={{ display: "flex", border: `1px solid ${theme.accent}77`, background: `${theme.accent}18`, borderRadius: 999, padding: "10px 18px", color: theme.accent, fontSize: 17, fontWeight: 650 }}>{intent}</div> : null}
          </div>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 940, gap: 20 }}>
            <div style={{ display: "flex", fontSize: title.length > 58 ? 48 : 62, lineHeight: 1.04, fontWeight: 820, letterSpacing: "-0.045em", textWrap: "balance" }}>{title}</div>
            {description ? <div style={{ display: "flex", maxWidth: 880, color: "#d8e0ec", fontSize: 25, lineHeight: 1.35 }}>{description}</div> : null}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, color: "#cbd5e1", fontSize: 19, fontWeight: 600 }}>
            <div style={{ display: "flex", width: 36, height: 2, background: theme.accent }} />
            Expertise, made reliable.
          </div>
        </div>
      </div>
    ),
    { ...CARD_SIZE, headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } },
  );
}
