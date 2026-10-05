/**
 * THE TABLE PAGE KEEPS THE VIEW IN THE ADDRESS (FTS-5c): sort, column filters, search, hidden
 * columns and page ride the URL, so a copied link opens the same look. The page reads the address
 * once and writes every change back; the body hands both to the package's TablePage.
 */
import { readFileSync } from "fs";
import { join } from "path";

const dir = join(__dirname, "..");
const page = readFileSync(join(dir, "UnifiedDataTablePage.tsx"), "utf8");
const body = readFileSync(join(dir, "UnifiedTable.tsx"), "utf8");

describe("the table page keeps the view in the address", () => {
  it("reads the address on arrival and writes changes back", () => {
    expect(page).toContain("viewAddressFromParams");
    expect(page).toContain("viewAddressToParams");
    expect(page).toContain("onViewAddressChange={onViewAddressChange}");
  });
  it("hands both to the package table page", () => {
    expect(body).toContain("{...viewInAddress}");
    expect(body).toContain("onViewAddressChange?:");
  });
});
