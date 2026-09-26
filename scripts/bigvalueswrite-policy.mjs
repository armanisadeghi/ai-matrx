// scripts/bigvalueswrite-policy.mjs — lane BIG-VALUES-WRITE: the ~200 KB document a compliance lead
// pastes into one cell. Brightline Heating & Air's records-retention policy, one section per record
// class a residential HVAC contractor keeps. Deterministic, so the walk can check the SHA-256.
const COMPANY = "Brightline Heating & Air";
const CLASSES = [
  ["Service call tickets", "3 years after the call is closed", "the dispatch system and the technician's tablet"],
  ["Installation job files", "the life of the installed equipment plus 2 years", "the job folder and the permit portal"],
  ["Refrigerant recovery logs (EPA Section 608)", "3 years from the date of each recovery", "the recovery log binder and the refrigerant tracking sheet"],
  ["Equipment warranty registrations", "the warranty term plus 1 year", "the manufacturer portals and the customer file"],
  ["Customer maintenance agreements", "4 years after the agreement ends", "the agreements table and signed PDFs"],
  ["Payroll and timecards", "4 years after the pay date", "the payroll provider and the time-clock export"],
  ["Vehicle inspection and fuel records", "3 years", "the fleet folder"],
  ["Permits and inspection sign-offs", "permanently", "the permit portal and the job folder"],
  ["Estimates that were not accepted", "18 months", "the estimating tool"],
  ["Customer payment records", "7 years", "the accounting system"],
  ["Technician certifications (NATE, EPA 608)", "the employment term plus 3 years", "the personnel file"],
  ["Safety incident reports (OSHA 300 log)", "5 years following the end of the calendar year", "the safety binder"],
];
const PARAGRAPHS = [
  (c, w) => `Where it lives. Records in this class are kept in ${w}. A copy saved anywhere else — a personal phone, a text thread, a printed page in a truck — is a working copy, not the record, and is destroyed when the job it served is closed.`,
  (c) => `Legal hold. When the company is told of a claim, an audit, a warranty dispute or an inspection that could touch ${c.toLowerCase()}, the office manager places those records on hold. Nothing on hold is destroyed, whatever this schedule says, until the hold is released in writing.`,
  (c) => `Destruction. When the retention period ends, paper records are cross-cut shredded by the bonded shredding vendor and electronic records are deleted from the system of record and its backups at the next quarterly purge. The purge is logged with the date, the class (${c.toLowerCase()}), the number of records and the name of the person who ran it.`,
  () => `Customer requests. A customer may ask for a copy of any record about their own home or equipment. The office sends it within ten business days, free of charge for the first copy each year, and notes the request in the customer file.`,
  () => `Review. The owner and the office manager review this section every January against the current California and federal requirements and the manufacturers' warranty terms, and record the review date at the top of this policy.`,
];
export function policyText(targetBytes = 200_000) {
  const parts = [
    `${COMPANY} — Records Retention and Destruction Policy`,
    `Effective January 1, 2027. Approved by the owner. This policy says how long the company keeps each kind of record it creates while installing, servicing and maintaining heating, ventilation and air-conditioning systems in customers' homes, where each record lives, and how it is destroyed when its time is up.`,
  ];
  let n = 0;
  while (Buffer.byteLength(parts.join("\n\n"), "utf8") < targetBytes) {
    const [c, w, where] = CLASSES[n % CLASSES.length];
    const round = Math.floor(n / CLASSES.length) + 1;
    parts.push(`Section ${n + 1}. ${c}${round > 1 ? ` — location ${round}` : ""}`);
    parts.push(`Retention period. ${COMPANY} keeps ${c.toLowerCase()} for ${w}${round > 1 ? ` at branch location ${round}` : ""}.`);
    for (const p of PARAGRAPHS) parts.push(p(c, where));
    n += 1;
  }
  return parts.join("\n\n");
}
