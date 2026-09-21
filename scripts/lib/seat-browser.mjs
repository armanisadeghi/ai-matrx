// scripts/lib/seat-browser.mjs
//
// THE SEAT, IN A BROWSER — the two steps every headless proof lane has to do before it can
// prove anything, in ONE place so they are not re-discovered per lane.
//
// Both were copied per-lane until 2026-09-21, and the copy is how lane REALTIME-2 spent an
// hour concluding the organization picker was broken when it was working exactly as ruled.
//
// 🚨 THE TEST-ORGANIZATION DISCLOSURE, WHICH IS THE WHOLE REASON THIS FILE EXISTS.
// Lane FRONT-DOOR classified every real-data crew organization — Rincon Plumbing Co included —
// as `settings.test_fixture: true`, and the picker hides those by default behind ONE
// disclosure control, the archived-items-law pattern: a `<button aria-expanded>` reading
// "Test organizations (N)". A person reaches them in one click. A proof that only searched
// found NOTHING — not the row, not the id, not the string anywhere in the document — and the
// picker's own sentence said why:
//
//     Nothing matches "Rincon" outside the test organizations below.
//
// So `setOrganization` does what a person does: open the group, search, and if the match is
// behind the disclosure, open the disclosure, then pick the row. Never a cookie and never a
// URL — forcing an organization from outside tests a state no person can reach, which is the
// picker's own doctrine.

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function until(label, fn, timeoutMs = 25000) {
  const start = Date.now();
  for (;;) {
    let v;
    try {
      v = await fn();
    } catch {
      v = null;
    }
    if (v) return { v, ms: Date.now() - start };
    if (Date.now() - start > timeoutMs) return { v: null, ms: Date.now() - start, label };
    await sleep(250);
  }
}

/**
 * Sign in the way a person does — the login form, a password, no dev-login nonce and no token
 * in a URL. Returns the email the app itself says is signed in, so a caller never assumes.
 */
export async function signIn(page, origin, email, password, who = email) {
  await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  // Hydration: the form is server-rendered but only accepts input once the bundle attaches,
  // and a fill that lands before that silently does nothing.
  await page.waitForSelector("#email", { timeout: 120000 });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button:has-text("Sign in")');
  const { v } = await until(
    `${who} sign-in`,
    async () => {
      const seen = await page.evaluate(async () => {
        try {
          return await (await fetch("/api/whoami")).json();
        } catch {
          return null;
        }
      });
      return seen?.email ?? null;
    },
    60000,
  );
  if (!v) throw new Error(`${who} (${email}) never signed in`);
  return v;
}

/** Open the sidebar's organization group, which is a collapsed section until it is clicked. */
async function openOrganizationGroup(page) {
  await page.evaluate(() => {
    const side = document.querySelector("#shell-sidebar-toggle");
    if (side instanceof HTMLInputElement && !side.checked) side.click();
    const group = document.querySelector("#menu-group-organization");
    if (group instanceof HTMLInputElement && !group.checked) group.click();
  });
  await sleep(1200);
}

/** Click the one disclosure that reveals the test organizations. Returns whether it opened. */
async function revealTestOrganizations(page) {
  return page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (b) =>
        /test organizations/i.test(b.textContent ?? "") && b.getAttribute("aria-expanded") !== null,
    );
    if (!button) return false;
    if (button.getAttribute("aria-expanded") === "true") return true;
    button.scrollIntoView({ block: "center" });
    button.click();
    return true;
  });
}

/** Click the row whose own text is exactly this organization's name. */
async function clickOrganizationRow(page, name) {
  return page.evaluate((wanted) => {
    const leaf = Array.from(document.querySelectorAll("body *")).find(
      (el) => el.children.length === 0 && (el.textContent ?? "").trim() === wanted,
    );
    if (!leaf) return false;
    const target =
      leaf.closest("button, [role='option'], [role='menuitem'], [role='button'], a, li") ??
      leaf.parentElement;
    if (!target) return false;
    target.scrollIntoView({ block: "center" });
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  }, name);
}

/**
 * PICK THE ORGANIZATION THE WAY A PERSON DOES — off the screen the app puts in front of them.
 * The platform deliberately never picks one for you, so anything written from outside would be
 * testing a state nobody can reach.
 */
export async function setOrganization(page, organizationName) {
  await openOrganizationGroup(page);

  // TYPE INTO THE PICKER'S SEARCH BOX WITHOUT PLAYWRIGHT'S CLICK. The "pick an organization"
  // hold notice (`[data-testid="organization-required-notice"]`) sits over the shell and
  // intercepts pointer events, so a real `.click()` on the box times out forever while the box
  // itself is perfectly visible and usable. Setting the value through the native setter and
  // dispatching `input` is what a keystroke does to a React-controlled field.
  const typeSearch = (value) =>
    page.evaluate((text) => {
      const boxes = Array.from(
        document.querySelectorAll('input[data-slot="organization-picker-search"]'),
      ).filter((el) => el.offsetParent !== null);
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      let typed = 0;
      for (const box of boxes) {
        setter?.call(box, text);
        box.dispatchEvent(new Event("input", { bubbles: true }));
        typed += 1;
      }
      return typed;
    }, value);

  await typeSearch(organizationName);
  await sleep(1200);

  if (await clickOrganizationRow(page, organizationName)) {
    await sleep(1500);
    return "listed";
  }

  // NOT IN THE LIST IS NOT "NOT THERE". Every real-data crew organization is a test fixture,
  // hidden behind one disclosure — open it, exactly as a person clicks it.
  if (await revealTestOrganizations(page)) {
    await sleep(1200);
    const { v } = await until(
      "the organization behind the test-organization disclosure",
      () => clickOrganizationRow(page, organizationName),
      30000,
    );
    if (v) {
      await sleep(1500);
      return "behind the test-organization disclosure";
    }
  }

  // Last resort, still a person's move: clear the filter and let the whole list build.
  await typeSearch("");
  await sleep(1000);
  await revealTestOrganizations(page);
  const { v: late } = await until(
    "the organization picker",
    async () => {
      if (await clickOrganizationRow(page, organizationName)) return true;
      await page.evaluate(() => {
        for (const el of Array.from(document.querySelectorAll("body *"))) {
          if (el.scrollHeight > el.clientHeight + 40) el.scrollTop += el.clientHeight;
        }
      });
      return false;
    },
    60000,
  );
  if (!late) throw new Error(`the organization "${organizationName}" was not on the picker`);
  await sleep(1500);
  return "after clearing the filter";
}
