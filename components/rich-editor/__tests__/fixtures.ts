// Stored-text fixtures for the rich editor's gates. Shaped from real rows the
// corpus runs over (a recycling company's operations notes and agent prompts):
// every construct the platform stores, in the spellings people and agents use.

export const ROUTE_PLANNING_NOTE = `# Tuesday pickup route — Irvine commercial

Driver **Marisol Vega** runs the Irvine loop; dispatch confirms with {{dispatcher_name}} by 7:30.
Load weight target is $w \\le 4{,}200$ kg per truck; overage is billed at $0.18/lb.

* Office park on Alton — 6 gray totes, e-waste only
* Medical plaza on Barranca — sharps go to the __licensed__ hauler
  - confirm the manifest number before loading
* Warehouse row on Main — pallets of CRT monitors

1) Weigh in at the Tustin yard
2) Photograph every manifest

- [ ] Call the Alton property manager about gate code
- [x] Reserve the second box truck

> **Note:** the Barranca dock is closed Tuesdays after 2 pm.
> Plan the stop before lunch.

| Stop | Totes | Window |
|:-----|------:|--------|
| Alton | 6 | 8–10 |
| Barranca | 2 | 10–12 |

\`\`\`json
{"route": "irvine-commercial", "stops": 3}
\`\`\`

{"__kind": "checklist", "title": "Truck pre-trip", "items": ["Tires", "Liftgate", "Straps"]}

<thinking>
Barranca first keeps the sharps off the truck during the Main stop.
</thinking>

$$
\\text{cost} = 0.18 \\times (w - 4200)
$$
<!--@a:route-review-7-->
See the county rules at [OC Waste](https://oclandfills.com "OC Waste & Recycling") or <https://calrecycle.ca.gov>.

Setext summary
==============

***Priority:*** keep \`manifest_id\` with the load. Escaped star stays: 5 \\* 3 &amp; done.

---
Signed off by dispatch.
`;

export const INTAKE_PROMPT = `You are the intake coordinator for {{company_name}}, a certified e-waste recycler.

## Your job
Read the customer's message and fill the pickup request.

<instructions>
- Ask for {{missing_fields}} one at a time.
- Never quote a price; say "our coordinator will confirm".
</instructions>

Customer message:
{{customer_message}}

Reply in **plain English**, under 120 words.`;

export const MEETING_NOTES_WITH_HTML = `Quarterly review with the Tustin yard team

<div align="center">
<img src="https://cdn.allgreen.example/logo.png" width="120">
</div>

Attendees: Marisol, Devin, Priya<br>
Decisions below.

    indented code keeps its spaces

1. Move CRT intake to Thursdays
2. Add a second scale at bay 4

Footnote style reference[^1].

[^1]: County ordinance 4-12, section B.
`;

export const WINDOWS_LINE_ENDINGS = "Line one of a pasted email\r\nLine two\r\n\r\nSecond paragraph\r\n";

export const EMPTY = "";
export const WHITESPACE_ONLY = "\n\n  \n";
export const WHITESPACE_LINES_INSIDE = "First paragraph line\n   \nSecond run after a spaces-only line\n  \n- item after spaces\n";

export const ALL_FIXTURES: Array<[string, string]> = [
  ["route planning note", ROUTE_PLANNING_NOTE],
  ["intake prompt with variables", INTAKE_PROMPT],
  ["meeting notes with raw HTML", MEETING_NOTES_WITH_HTML],
  ["CRLF text", WINDOWS_LINE_ENDINGS],
  ["empty", EMPTY],
  ["whitespace only", WHITESPACE_ONLY],
  ["spaces-only lines inside a block", WHITESPACE_LINES_INSIDE],
];
