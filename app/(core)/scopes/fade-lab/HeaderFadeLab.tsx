"use client";

import { useEffect, useState } from "react";

const DEFAULT_TAIL_PX = 16;
const ORIGINAL_TAIL_PX = 40;

export default function HeaderFadeLab() {
  const [tailPx, setTailPx] = useState(DEFAULT_TAIL_PX);
  const [headerPx, setHeaderPx] = useState(44);
  const [stickyTable, setStickyTable] = useState(true);
  const effectiveTailPx = stickyTable ? 0 : tailPx;

  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".shell-root");
    if (!shell) return;

    const updateHeight = () => {
      const header = shell.querySelector<HTMLElement>(".shell-header");
      if (header)
        setHeaderPx(Math.round(header.getBoundingClientRect().height));
    };
    if (stickyTable) {
      shell.style.removeProperty("--shell-header-fade-h");
    } else {
      shell.style.setProperty("--shell-header-fade-h", `${tailPx}px`);
    }
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => {
      shell.style.removeProperty("--shell-header-fade-h");
      window.removeEventListener("resize", updateHeight);
    };
  }, [stickyTable, tailPx]);

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="relative min-h-[280px] overflow-hidden bg-gradient-to-r from-fuchsia-500 via-amber-400 to-cyan-400 text-slate-950">
        <div
          className="absolute inset-0 opacity-35"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent 0, transparent 19px, #0f172a 20px, transparent 21px)",
          }}
        />
        <div
          className="absolute inset-x-0 border-t-2 border-dashed border-white"
          style={{ top: headerPx + effectiveTailPx }}
        />
        <div
          className="relative mx-auto max-w-3xl px-4"
          style={{ paddingTop: headerPx + effectiveTailPx + 24 }}
        >
          <p className="text-xs font-bold uppercase tracking-wide">
            The real shell header is above this color
          </p>
          <h1 className="mt-2 text-2xl font-semibold">
            Watch the color emerge below the header
          </h1>
          <p className="mt-2 max-w-xl text-sm">
            The solid header ends where white meets color. The dashed line marks
            where the fade ends. Scroll to watch the color and stripes pass
            behind the real header.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStickyTable(true)}
            aria-pressed={stickyTable}
            className={`rounded-md border px-3 py-2 text-sm ${stickyTable ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
          >
            Sticky table page · Scopes
          </button>
          <button
            type="button"
            onClick={() => setStickyTable(false)}
            aria-pressed={!stickyTable}
            className={`rounded-md border px-3 py-2 text-sm ${!stickyTable ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
          >
            Ordinary page
          </button>
        </div>

        {stickyTable && (
          <div className="rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead
                className="relative bg-muted"
                data-matrx-table-sticky-header="true"
                style={{ position: "sticky", top: 0, zIndex: 10 }}
              >
                <tr>
                  <th className="px-3 py-2">
                    Table header meets solid header at {headerPx}px
                  </th>
                  <th className="px-3 py-2">No translucent gap</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 10 }, (_, index) => (
                  <tr key={index} className="border-t border-border">
                    <td className="px-3 py-2">Scrolling row {index + 1}</td>
                    <td className="px-3 py-2">Visible below the labels</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Fade depth</h2>
            <strong className="text-2xl tabular-nums">
              {effectiveTailPx} px
            </strong>
          </div>
          <input
            aria-label="Fade depth below header"
            type="range"
            min="0"
            max="48"
            step="1"
            value={tailPx}
            onChange={(event) => setTailPx(Number(event.target.value))}
            disabled={stickyTable}
            className="mt-4 w-full accent-primary"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {[0, 8, 12, DEFAULT_TAIL_PX, 24, ORIGINAL_TAIL_PX].map((px) => (
              <button
                key={px}
                type="button"
                onClick={() => setTailPx(px)}
                disabled={stickyTable}
                aria-pressed={tailPx === px}
                className={`rounded-md border px-3 py-2 text-sm ${tailPx === px ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
              >
                {px} px
                {px === DEFAULT_TAIL_PX
                  ? " · new default"
                  : px === ORIGINAL_TAIL_PX
                    ? " · old"
                    : ""}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Metric
            label="Header band"
            value={`${headerPx} px`}
            detail="Fully opaque"
          />
          <Metric
            label="Fade tail"
            value={`${effectiveTailPx} px`}
            detail={
              stickyTable
                ? "Automatically removed for sticky tables"
                : "62% then 28% opacity, down to zero"
            }
          />
          <Metric
            label="End position"
            value={`${headerPx + effectiveTailPx} px`}
            detail="Measured from top of page"
          />
        </div>

        <p className="text-sm text-muted-foreground">
          The shared fade is 16 px on ordinary pages. A document-sticky table
          automatically removes the outside fade so its column labels can meet
          the solid header. Switch to Ordinary page to preview other fade
          depths; leaving this page restores the saved value.
        </p>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
