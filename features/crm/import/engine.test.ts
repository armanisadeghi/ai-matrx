import {
  guessMapping,
  parseDelimitedText,
  parseImportFile,
  parseVCard,
} from "./engine";

describe("CRM native contact import parsing", () => {
  it("recognizes and maps a Google Contacts CSV export", () => {
    const parsed = parseDelimitedText(
      [
        "Given Name,Family Name,Organization 1 - Name,Organization 1 - Title,E-mail 1 - Type,E-mail 1 - Value,Phone 1 - Value",
        "Ada,Lovelace,Analytical Engines,Chief Analyst,Work,ada@example.com,+13105551234",
      ].join("\n"),
    );

    expect(parsed.sourceLabel).toBe("Google Contacts");
    expect(guessMapping(parsed.headers, "person")).toMatchObject({
      "Given Name": "first_name",
      "Family Name": "last_name",
      "Organization 1 - Name": "company",
      "Organization 1 - Title": "job_title",
      "E-mail 1 - Type": null,
      "E-mail 1 - Value": "email",
      "Phone 1 - Value": "phone",
    });
  });

  it("parses tab-separated Outlook-style text", () => {
    const parsed = parseDelimitedText(
      "First Name\tLast Name\tE-mail Address\tBusiness Phone\nGrace\tHopper\tgrace@example.com\t+12025550100",
    );

    expect(parsed.format).toBe("tsv");
    expect(parsed.sourceLabel).toBe("Microsoft Outlook");
  });

  it("preserves and warns about cells wider than the header", () => {
    const parsed = parseDelimitedText(
      "Name,Email\nAda Lovelace,ada@example.com,unexpected",
    );

    expect(parsed.headers).toEqual(["Name", "Email", "Column 3"]);
    expect(parsed.rows[0]?.["Column 3"]).toBe("unexpected");
    expect(parsed.parseWarnings[0]).toContain("Extra values were preserved");
  });

  it("parses folded vCard fields and the first two contact channels", () => {
    const parsed = parseVCard(
      [
        "BEGIN:VCARD",
        "VERSION:3.0",
        "N:Lovelace;Ada;;;",
        "FN:Ada Lovelace",
        "ORG:Analytical Engines Ltd",
        "TITLE:Chief Analyst",
        "EMAIL;TYPE=WORK:ada@analyticalengines.example",
        "EMAIL;TYPE=HOME:ada@example.com",
        "TEL;TYPE=CELL:+13105551234",
        "TEL;TYPE=WORK:+13105555678",
        "END:VCARD",
      ].join("\r\n"),
    );

    expect(parsed.format).toBe("vcard");
    expect(parsed.rows).toEqual([
      expect.objectContaining({
        "First name": "Ada",
        "Last name": "Lovelace",
        "Full name": "Ada Lovelace",
        Company: "Analytical Engines Ltd",
        "Job title": "Chief Analyst",
        Email: "ada@analyticalengines.example",
        "Email 2": "ada@example.com",
        Phone: "+13105551234",
        "Phone 2": "+13105555678",
      }),
    ]);
  });

  it("keeps quoted-printable UTF-8 names readable", () => {
    const parsed = parseVCard(
      "BEGIN:VCARD\nVERSION:2.1\nN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Garc=C3=ADa;Jos=C3=A9\nFN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Jos=C3=A9 Garc=C3=ADa\nEND:VCARD",
    );

    expect(parsed.rows[0]).toMatchObject({
      "First name": "José",
      "Last name": "García",
      "Full name": "José García",
    });
  });

  it("does not split escaped semicolons inside structured vCard values", () => {
    const parsed = parseVCard(
      "BEGIN:VCARD\nVERSION:3.0\nN:Doe\\;Smith;Jane;;;\nFN:Jane Doe-Smith\nORG:Research\\; Labs;Division\nEND:VCARD",
    );

    expect(parsed.rows[0]).toMatchObject({
      "First name": "Jane",
      "Last name": "Doe;Smith",
      Company: "Research; Labs",
    });
  });

  it("ignores metadata that merely mentions email or phone", () => {
    const headers = [
      "Email",
      "Email Opt Out",
      "E-mail Display Name",
      "Phone",
      "Phone Extension",
    ];

    expect(guessMapping(headers, "person")).toMatchObject({
      Email: "email",
      "Email Opt Out": null,
      "E-mail Display Name": null,
      Phone: "phone",
      "Phone Extension": null,
    });
    expect(guessMapping(["Email", "Email 2 Address"], "organization")).toEqual({
      Email: "email",
      "Email 2 Address": null,
    });
  });

  it("reads the first non-empty Excel worksheet and reports other sheets", async () => {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["First Name", "Email"],
        ["Ada", "ada@example.com"],
      ]),
      "Contacts",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["Company"], ["Analytical Engines"]]),
      "Companies",
    );
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const file = {
      name: "outlook-contacts.xlsx",
      size: bytes.byteLength,
      text: async () => "",
      arrayBuffer: async () => bytes,
    };

    const parsed = await parseImportFile(file);

    expect(parsed.format).toBe("xlsx");
    expect(parsed.sheetName).toBe("Contacts");
    expect(parsed.rows[0]).toEqual({
      "First Name": "Ada",
      Email: "ada@example.com",
    });
    expect(parsed.parseWarnings[0]).toContain(
      "Import additional worksheets separately",
    );
  });
});
