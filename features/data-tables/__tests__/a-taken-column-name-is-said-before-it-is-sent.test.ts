/**
 * Add Column with a name another column has (BREAKER-1 B-F7's neighbour, DATA-V2-BASICS-2): the
 * dialog says so from the columns on screen, and never sends it (it used to 409 and log an error).
 */
import { columnNameTaken } from "../column-name-taken";

const columns = [{ display_name: "Room" }, { display_name: "Stock Status 🔥" }, { display_name: "Treatment area" }];

describe("a taken column name is said before it is sent", () => {
  it("says a name another column has, however it is cased or spaced", () => {
    expect(columnNameTaken("Room", columns)).toMatch(/already have a column called "Room"/);
    expect(columnNameTaken("  room ", columns)).toMatch(/"Room"/);
    expect(columnNameTaken("Stock Status 🔥", columns)).toMatch(/"Stock Status 🔥"/);
  });

  it("lets a new name, an emoji beside a real name, and a renamed column's old name through", () => {
    expect(columnNameTaken("Supplier", columns)).toBeNull();
    expect(columnNameTaken("Room 🔥", columns)).toBeNull();
    expect(columnNameTaken("", columns)).toBeNull();
  });
});

import { columnNameProblem } from "../column-name-taken";

describe("BREAKER-2: every column name is judged as it is typed", () => {
  const visit = [{ display_name: "Visit Status" }];
  it("refuses a blank name (three spaces)", () => {
    expect(columnNameProblem("   ", visit)).toMatch(/needs a name/);
  });
  it("catches a doubled space as the same name", () => {
    expect(columnNameProblem("Visit  Status", visit)).toMatch(/already have a column called "Visit Status"/);
  });
  it("refuses a 300-letter name", () => {
    expect(columnNameProblem("x".repeat(300), visit)).toMatch(/takes up to 80/);
  });
  it("refuses a name the table keeps for itself", () => {
    expect(columnNameProblem("id", visit)).toMatch(/keeps for itself/);
    expect(columnNameProblem("Created At", visit)).toMatch(/keeps for itself/);
    expect(columnNameProblem("Patient ID", visit)).toBeNull();
  });
});
