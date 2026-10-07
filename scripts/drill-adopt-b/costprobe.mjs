export default async ({ page, go, sleep }) => {
  const ids = ["9de7916c-128b-4fb1-ad17-49620e6ba0b2","8f0ba2bf-49bc-4086-8cdc-e6692b10c742","62465c78-fddd-458e-9f5e-0fb8193c6c18","0f8fb6c6-3003-433d-bbcf-2a03dae66b81","44b18816-26b0-4873-aa02-cf6992910f1d","03dfd12b-af60-47c5-b6fe-ddc38fde71e0","c5c4ee8c-d5b8-4f5d-8b42-54d89893fc14"];
  for (const id of ids) {
    await go(`/research/topics/${id}/costs`);
    await sleep(3000);
    const t = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    console.log(id.slice(0, 8), t.length, t.slice(t.indexOf("Processing") , t.indexOf("Processing") + 900));
  }
};
