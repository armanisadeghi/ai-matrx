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
