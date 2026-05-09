// Backdrop content the glass slides over.
//
// Goal: cover the actual hard cases that break our current glass —
//   1. A bright white "document" surface (the screenshot's failure case)
//   2. A pure-black "console" surface (the inverse failure)
//   3. A photographic-feeling synthetic backdrop (mixed luminance)
//   4. Vibrant solid color tiles (saturate boost stress test)
//   5. A neutral theme card (the "glass works fine here" baseline)
//   6. A black-on-white checkerboard (worst case for any single tint)
//   7. A rainbow gradient (color-shift across the surface)

export function BackdropGallery() {
  return (
    <div className="glab-stage">
      {/* 1 — Bright white document. The exact screenshot scenario. */}
      <div className="glab-zone glab-zone-document">
        <h3>Chapter 13 — Periodic Functions</h3>
        <p>
          A periodic function is a function that repeats a pattern of{" "}
          <span className="formula">y</span>-values at regular intervals. The
          horizontal length of one cycle is called the <em>period</em>.
        </p>
        <p>
          The amplitude of a periodic function is half the difference between
          its maximum and minimum values. For{" "}
          <span className="formula">y = a sin(bx)</span>, the amplitude is{" "}
          <span className="formula">|a|</span> and the period is{" "}
          <span className="formula">2π / |b|</span>.
        </p>
        <p>
          Cycles can be identified by selecting two different points where the
          graph crosses the same y-value moving in the same direction.
        </p>
      </div>

      {/* 2 — Pure black console. Inverse failure case. */}
      <div className="glab-zone glab-zone-console">
        <div>
          <span className="tok-c">{"// streaming response handler"}</span>
        </div>
        <div>
          <span className="tok-k">async function</span>{" "}
          <span className="tok-f">streamMessage</span>(payload) {"{"}
        </div>
        <div>
          {"  "}
          <span className="tok-k">const</span> stream ={" "}
          <span className="tok-k">await</span>{" "}
          <span className="tok-f">openai.chat.create</span>({"{"}
        </div>
        <div>
          {"    "}model: <span className="tok-s">"gpt-5.4"</span>,
        </div>
        <div>
          {"    "}messages, stream: <span className="tok-k">true</span>,
        </div>
        <div>{"  })"}</div>
        <div>
          {"  "}
          <span className="tok-k">for await</span> (
          <span className="tok-k">const</span> chunk{" "}
          <span className="tok-k">of</span> stream) {"{"}
        </div>
        <div>
          {"    "}
          <span className="tok-f">yield</span> chunk.choices[0].delta.content;
        </div>
        <div>{"  }"}</div>
        <div>{"}"}</div>
        <div>&nbsp;</div>
        <div>
          <span className="tok-c">
            {"// status: 200 OK · 1.2s · 847 tokens"}
          </span>
        </div>
      </div>

      {/* 3 — Photographic synthetic backdrop. Multi-color zones. */}
      <div className="glab-zone glab-zone-photo" />

      {/* 4 — Vibrant color row */}
      <div className="glab-zone glab-zone-red" />
      <div className="glab-zone glab-zone-yellow" />
      <div className="glab-zone glab-zone-green" />
      <div className="glab-zone glab-zone-blue" />
      <div className="glab-zone glab-zone-purple" />
      <div className="glab-zone glab-zone-pink" />

      {/* 5 — Neutral theme card. Baseline. */}
      <div className="glab-zone glab-zone-neutral">
        <h3 className="text-base font-semibold mb-2">Theme Card</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Standard background — the surface glass was originally designed for.
          Reads as zinc-100 in light mode and zinc-850 in dark mode. Glass
          should feel native here in both themes. If a variant looks great on
          this card but fails on the bright/dark zones above, the variant is
          theme-bound rather than backdrop-aware.
        </p>
      </div>

      {/* 6 — Black/white checker */}
      <div className="glab-zone glab-zone-checker" />

      {/* 7 — Rainbow gradient */}
      <div className="glab-zone glab-zone-rainbow" />
    </div>
  );
}
