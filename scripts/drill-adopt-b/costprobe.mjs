export default async ({ page, go, sleep, arg }) => {
  await go(`/research/topics/${arg}/costs`);
  await sleep(4000);
  const t = (await page.locator("main, body").first().innerText()).replace(/[ \t]+/g, " ");
  console.log(t.slice(0, 6000));
};
