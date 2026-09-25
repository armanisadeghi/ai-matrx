/**
 * Spatial view demo — replay scripts.
 *
 * Every tile on the demo board streams one of these through the REAL
 * accumulator. They are replays, and the board says so on every tile — no
 * agent runs here. Structured kinds use the database's canonical examples
 * when the page could read them; the two small fallbacks below exist only so
 * the board still demonstrates kinds when that read fails, and the page
 * announces which one it used.
 */

export const RESEARCH_REPORT = `# Home battery storage in 2026 — what changed

## Summary
Residential batteries crossed a threshold this year: for most households on time-of-use tariffs, a 13 kWh system now pays back in **6–8 years**, down from 11–14 in 2022. Three forces drove it — cell prices, tariff design and software.

## 1. Cell prices
Lithium iron phosphate (LFP) pack prices fell below $90/kWh at the pack level. LFP trades a little energy density for a much longer cycle life (6,000+ cycles) and far better thermal stability, which is why nearly every new home product uses it.

## 2. Tariffs reward shifting, not just storing
Utilities moved from flat net metering to **time-of-use** and export-rate structures. The value of a battery is now the spread between the cheapest and most expensive hours, not the retail rate:

| Tariff | Peak | Off-peak | Daily spread (13 kWh) |
|---|---|---|---|
| Legacy flat | $0.31 | $0.31 | $0.00 |
| TOU-A | $0.52 | $0.24 | $3.64 |
| TOU-D | $0.61 | $0.19 | $5.46 |

## 3. Software is the product
Forecast-driven dispatch — charging from solar or cheap grid hours and discharging into the peak — adds **15–25%** to annual savings over simple self-consumption. Virtual power plant programs pay a further $500–$1,000 a year for letting the utility call on the battery a few dozen times.

## What to watch
- Sodium-ion packs entering the home market at lower cost but lower density.
- Bidirectional EV charging turning the car into the largest battery in the house.
- Interconnection queues, still the slowest part of any installation.
`;

export const PODCAST_NOTES = `## Episode notes — "The battery in your garage"

**Angle:** the listener already owns solar or is about to; the battery question is really a tariff question.

**Beats**
1. Cold open: a July evening, the grid at its peak price, one house running on its own stored sunlight.
2. Why 2026 is different — three numbers: $90/kWh, a $5 daily spread, 6,000 cycles.
3. The part nobody explains: dispatch software, and why two identical batteries earn different amounts.
4. Virtual power plants — getting paid to let the utility borrow your battery.
5. Close: the car as the biggest battery you'll ever own.

**Guest questions**
- What surprised you most when you read your first time-of-use bill?
- Would you let the utility discharge your battery during a heat wave?
`;

export const PODCAST_SCRIPT = `## Script — cold open

**HOST:** It's 7:40 on a July evening. Across the valley, air conditioners are straining, and the price of a kilowatt-hour has just tripled. One house on this street hasn't noticed.

**HOST:** Its lights are on. Its air conditioning is running. And it's paying nothing — because the power it's using right now was sunlight at two o'clock this afternoon.

**CO-HOST:** Which sounds like a commercial. So let's do the actual math.

**HOST:** Three numbers. Ninety dollars — that's what a kilowatt-hour of battery costs to build now. Five dollars — what a battery can earn *per day* on the right tariff. And six thousand — the number of times it can do that before it wears out.

**CO-HOST:** Six thousand days is about sixteen years.

**HOST:** Which is the whole story. The battery didn't get magic. The bill did.

## Segment one — the tariff is the product

**CO-HOST:** Most people think a battery stores their solar. That's the small idea. The big idea is that it lets you *choose when you buy electricity at all*…
`;

export const FLASHCARD_FALLBACK: Record<string, unknown> = {
  title: "Battery storage — key terms",
  cards: [
    { front: "What does LFP stand for?", back: "Lithium iron phosphate — a battery chemistry with long cycle life and high thermal stability." },
    { front: "What is a time-of-use (TOU) tariff?", back: "A rate plan where the price of electricity changes by time of day, highest at the evening peak." },
    { front: "What is a virtual power plant?", back: "Many home batteries dispatched together by a utility, paid as if they were one power station." },
    { front: "What is battery dispatch?", back: "The software decision of when to charge and when to discharge to maximise savings." },
  ],
};

export const QUIZ_FALLBACK: Record<string, unknown> = {
  title: "Battery storage check-in",
  questions: [
    {
      question: "Why do most new home batteries use LFP cells?",
      options: ["Highest energy density", "Long cycle life and thermal stability", "Lowest weight", "No inverter needed"],
      correct_answer: "Long cycle life and thermal stability",
      explanation: "LFP gives up some density for 6,000+ cycles and better thermal behaviour.",
    },
    {
      question: "On a time-of-use tariff, a battery's value mostly comes from…",
      options: ["The retail rate", "The spread between cheap and expensive hours", "Export to the grid only", "Backup during outages"],
      correct_answer: "The spread between cheap and expensive hours",
      explanation: "Charging cheap and discharging into the peak is where the money is.",
    },
  ],
};

/** Paragraph pool for the stress-test tiles (a board of 100 live streams). */
export const STRESS_LINES = [
  "Pack prices fell again this quarter, led by LFP cells from three new plants.",
  "Dispatch software shifted 11% more load into the evening peak than last year.",
  "Interconnection queues remain the slowest step in residential installs.",
  "Sodium-ion prototypes reached 160 Wh/kg in independent testing.",
  "Two utilities announced virtual power plant programs paying per event.",
  "Bidirectional chargers are now certified in four more states.",
  "Heat-wave demand peaks set records on six consecutive evenings.",
  "Average payback for a 13 kWh system is now between six and eight years.",
];

export function stressScript(i: number): string {
  const lines: string[] = [`### Monitor ${i + 1}`];
  for (let n = 0; n < 9; n++) lines.push(STRESS_LINES[(i * 3 + n) % STRESS_LINES.length]);
  return lines.join("\n\n");
}
