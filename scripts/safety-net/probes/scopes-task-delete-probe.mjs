// Probe (lane SN-SCOPES): what pressing "Delete task" shows, to archive the walk's tasks. Not a check.
import { openWalk, bodyText, sleep } from "../lib/harness.mjs";
const ctx = await openWalk("_scopes-task-delete");
try {
  const page = await ctx.page("admin");
  await ctx.goto(page, "/tasks");
  await sleep(10000);
  await page.getByText("Book the ACL re-check visit Oct 1 0235", { exact: true }).locator("visible=true").first().click();
  await sleep(4000);
  await ctx.shot(page, "editor");
  const del = page.locator('[title="Delete task"]:visible');
  console.log("delete controls", await del.count());
  await del.first().click();
  await sleep(2500);
  await ctx.shot(page, "after-delete-press");
  console.log("dialogs", await page.evaluate(() => [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].map((d) => d.getAttribute("role") + ": " + d.innerText.slice(0, 300))));
} finally {
  await ctx.finish();
}
