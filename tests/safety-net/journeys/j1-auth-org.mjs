import { open, whoami, faulted, sleep, until } from "../lib/harness.mjs";
import { signIn, setOrganization } from "../../../scripts/lib/seat-browser.mjs";
import { activeOrgName, listedOrgNames, signOutThroughUi } from "../lib/j1-org.mjs";

export default {
  id: "j1-auth-org", title: "Sign in, reload stays signed in, org switch, lists show all orgs",
  async run({ s, check, note, skip }) {
    const { page } = s;
    const admin = s.env.AI_ADMIN_USERNAME;
    check("signed in as admin@admin.com", whoami && s.email === admin && (await whoami(page)) === admin, s.email);

    // Reload a protected page: still signed in, not bounced to login.
    await open(s, "/dashboard");
    await page.reload({ waitUntil: "domcontentloaded", timeout: 180000 });
    check("reload of /dashboard stays signed in", (await whoami(page)) === admin && !/\/login/.test(page.url()), page.url());

    // Org switch first (while signed in), then the sign-out round trip.
    let original = null;
    try {
      original = await activeOrgName(page);
      const names = await listedOrgNames(page);
      note(`active org: ${original}; picker lists ${names.length} org(s)`);
      const target = faulted("j1-auth-org") ? "Org That Does Not Exist 9f3a" : names.find((n) => n && n !== original);
      if (!target) skip("switch organization", "picker lists no second organization");
      else {
        let switched = true;
        try { await setOrganization(page, target); } catch { switched = false; }
        await sleep(2000);
        const now = await activeOrgName(page);
        check("picker label shows the new organization", switched && now === target, `wanted ${target}, saw ${now}`);
        await page.reload({ waitUntil: "domcontentloaded", timeout: 180000 });
        check("new organization persists after reload", (await activeOrgName(page)) === target);

        // Lists are never filtered by the active org: /organizations shows more than one.
        await open(s, "/organizations");
        await sleep(5000);
        const links = await page.evaluate(() => new Set(Array.from(document.querySelectorAll('a[href^="/organizations/"]')).map((a) => a.getAttribute("href"))).size);
        if (links === 0) skip("organizations list shows more than one org", "no org links rendered on /organizations");
        else check("organizations list shows more than one org with one active", links > 1, `${links} org link(s)`);
      }
    } finally {
      if (original) { await open(s, "/dashboard"); await setOrganization(page, original).catch(() => undefined); }
    }
    if (original) check("switched back to the original organization", (await activeOrgName(page)) === original, original);

    // Sign out in THIS context only (device scoped), then sign back in.
    const out = await signOutThroughUi(page, s.origin, (p) => open(s, p));
    check("sign-out lands on the login page", out, page.url());
    check("whoami is null after sign-out", (await whoami(page)) === null);
    if (faulted("j1-auth-org")) { check("signed in again (fault: sign-in skipped)", (await whoami(page)) === admin); return; }
    const again = await signIn(page, s.origin, admin, s.env.AI_ADMIN_PASSWORD, "admin");
    check("signed in again after sign-out", again === admin && (await whoami(page)) === admin);
  },
};
