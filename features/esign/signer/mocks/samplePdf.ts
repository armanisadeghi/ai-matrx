// features/esign/signer/mocks/samplePdf.ts — DEV DEMO ONLY: a real two-page PDF built in memory.
// Imported only by app/(dev)/demos/esign-signer (esign-parity CONTRACT §17 step 4).

function pageStream(lines: Array<[number, number, number, string]>): string {
  // [x, y, size, text] in PDF points, origin bottom-left.
  const ops = lines.map(([x, y, size, t]) => {
    const safe = t.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    return `BT /F1 ${size} Tf ${x} ${y} Td (${safe}) Tj ET`;
  });
  return ops.join("\n");
}

const PAGE_1: Array<[number, number, number, string]> = [
  [72, 720, 20, "Patient Services Agreement"],
  [72, 690, 11, "This agreement is between Riverside Clinic (the Clinic) and the patient named below."],
  [72, 674, 11, "The patient agrees to the procedure described in the attached consent and understands"],
  [72, 658, 11, "the risks, benefits and alternatives that were explained by the care team."],
  [72, 620, 12, "1. Patient details"],
  [72, 596, 11, "Full name: ________________________________"],
  [72, 572, 11, "Email: ____________________________________"],
  [72, 548, 11, "Company: __________________________________"],
  [72, 524, 11, "Date of birth: ____________________________"],
  [72, 500, 11, "Number of visits per year: ________________"],
  [72, 462, 12, "2. Preferences"],
  [72, 438, 11, "Preferred contact:     [ ] Phone     [ ] Email     [ ] Text"],
  [72, 414, 11, "I would like reminders before each visit:  [ ]"],
  [72, 390, 11, "Preferred location: ________________________"],
  [72, 352, 12, "3. Notes for the care team"],
  [72, 328, 11, "_____________________________________________________________"],
  [72, 304, 11, "_____________________________________________________________"],
  [72, 250, 11, "Initial here to confirm you read this page: ______"],
  [72, 60, 9, "Page 1 of 2"],
];

const PAGE_2: Array<[number, number, number, string]> = [
  [72, 720, 16, "Consent and signature"],
  [72, 690, 11, "By signing below, the patient confirms they read every page of this agreement and"],
  [72, 674, 11, "agree to its terms. A copy will be emailed to every party once all have signed."],
  [72, 636, 11, "I agree to the privacy notice:  [ ]"],
  [72, 590, 11, "Patient signature: ___________________________     Date: ______________"],
  [72, 540, 11, "Initials: ______"],
  [72, 470, 11, "Clinic representative: _______________________     Date: ______________"],
  [72, 60, 9, "Page 2 of 2"],
];

/** A two-page letter-size PDF with text a person can read. */
export function samplePdfBytes(): Uint8Array<ArrayBuffer> {
  const streams = [pageStream(PAGE_1), pageStream(PAGE_2)];
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>",
    `<< /Length ${streams[0].length} >>\nstream\n${streams[0]}\nendstream`,
    `<< /Length ${streams[1].length} >>\nstream\n${streams[1]}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(new ArrayBuffer(out.length));
  for (let i = 0; i < out.length; i += 1) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
