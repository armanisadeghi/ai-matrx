// features/education/publishing/ogImage.tsx
//
// Shared Open Graph image renderer for Education Hub SEO surfaces (learn docs +
// axis entries). One branded card so every education share looks like one
// system. No emoji (enterprise) — a 2-char letter badge + the M wordmark.
// Consumed by the thin `opengraph-image.tsx` route files.

import { ImageResponse } from "next/og";

export const eduOgSize = { width: 1200, height: 630 };
export const eduOgContentType = "image/png";

export interface EduOgOptions {
  /** Small uppercase label above the title (e.g. "Study Guide", "Exam Prep"). */
  eyebrow: string;
  title: string;
  description?: string;
  /** 2-char badge (the route/axis letter). */
  letter: string;
}

export function renderEduOgImage({
  eyebrow,
  title,
  description,
  letter,
}: EduOgOptions): ImageResponse {
  const brand = "#6366f1"; // indigo-500, matches the hub accent
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "1200px",
          height: "630px",
          background: "#0b1120",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "10px",
            height: "630px",
            background: brand,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: "-140px",
            top: "-140px",
            width: "560px",
            height: "560px",
            borderRadius: "50%",
            background: brand,
            opacity: 0.14,
            filter: "blur(90px)",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "64px 80px",
            width: "100%",
            height: "100%",
          }}
        >
          {/* Header: letter badge + eyebrow */}
          <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "56px",
                height: "56px",
                borderRadius: "14px",
                background: `${brand}26`,
                border: `2px solid ${brand}66`,
                color: "#c7d2fe",
                fontSize: "24px",
                fontWeight: 800,
              }}
            >
              {letter}
            </div>
            <span
              style={{
                color: "#a5b4fc",
                fontSize: "22px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {eyebrow}
            </span>
          </div>

          {/* Title + description */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              flex: 1,
              justifyContent: "center",
            }}
          >
            <div
              style={{
                fontSize: title.length > 52 ? "52px" : title.length > 32 ? "60px" : "68px",
                fontWeight: 800,
                color: "#f8fafc",
                lineHeight: 1.08,
                letterSpacing: "-0.03em",
                maxWidth: "980px",
              }}
            >
              {title}
            </div>
            {description ? (
              <div
                style={{
                  fontSize: "26px",
                  color: "#94a3b8",
                  lineHeight: 1.45,
                  maxWidth: "900px",
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {description}
              </div>
            ) : null}
          </div>

          {/* Footer: wordmark */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #6366f1, #7c3aed)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
                fontWeight: 800,
                color: "#fff",
              }}
            >
              M
            </div>
            <span style={{ color: "#cbd5e1", fontSize: "22px", fontWeight: 700 }}>
              AI Matrx Education
            </span>
          </div>
        </div>
      </div>
    ),
    { ...eduOgSize },
  );
}
