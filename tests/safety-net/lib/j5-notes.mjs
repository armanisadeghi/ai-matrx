// J5 helpers: delete the note this journey created, through the note's own right-click menu ("Move to Trash").
import { open, sleep } from "./harness.mjs";

export async function findCreatedNoteTitle(page, title) {
  return page.getByText(title).first().isVisible().catch(() => false);
}

export async function deleteNoteByTitle(page, s, title) {
  await open(s, "/notes");
  const row = page.getByText(title).first();
  await row.waitFor({ timeout: 90000 });
  await row.click({ button: "right" });
  await page.getByText("Move to Trash").first().click({ timeout: 15000 });
  const confirm = page.getByRole("button", { name: /^(move to trash|delete|confirm)$/i }).last();
  if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) await confirm.click();
  await sleep(3000);
  return !(await page.getByText(title).first().isVisible().catch(() => false));
}
