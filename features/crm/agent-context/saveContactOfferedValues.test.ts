/**
 * Provision `crm.save_contact_selection` wave 4: Dana Whitfield's email
 * signature, highlighted in a note and saved as a contact.
 */
import { saveContactOfferedValues } from "./saveContactOfferedValues";

const draft = {
  name: "Dana Whitfield",
  kind: "person" as const,
  firstName: "Dana",
  lastName: "Whitfield",
  email: " dana@harborlightlogistics.com ",
  phone: "(619) 555-0142",
  domain: "",
  headline: "Operations Director, Harbor Light Logistics",
};

describe("saveContactOfferedValues", () => {
  it("names each reviewed field and the page it came from", () => {
    expect(
      saveContactOfferedValues(draft, {
        pagePath: "/notes/3f1c",
        pageUrl: "https://www.aimatrx.com/notes/3f1c",
        sourceTitle: "Q3 carrier notes",
      }),
    ).toEqual({
      contact_name: "Dana Whitfield",
      party_kind: "person",
      first_name: "Dana",
      last_name: "Whitfield",
      email: "dana@harborlightlogistics.com",
      phone: "(619) 555-0142",
      headline: "Operations Director, Harbor Light Logistics",
      page_path: "/notes/3f1c",
      page_url: "https://www.aimatrx.com/notes/3f1c",
      source_title: "Q3 carrier notes",
    });
  });

  it("omits blanks and never invents the surrounding text", () => {
    const values = saveContactOfferedValues(draft, { sourceTitle: "  " });
    expect("company_domain" in values).toBe(false);
    expect("source_title" in values).toBe(false);
    expect("page_path" in values).toBe(false);
    expect("text_before" in values).toBe(false);
    expect("text_after" in values).toBe(false);
  });
});
