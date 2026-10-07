export default async ({ page, go }) => {
  await go("/research/topics");
  const hrefs = await page.evaluate(() => [...document.querySelectorAll("a[href*='/research/topics/']")].map((a) => a.getAttribute("href")).slice(0, 15));
  console.log(JSON.stringify(hrefs));
};
