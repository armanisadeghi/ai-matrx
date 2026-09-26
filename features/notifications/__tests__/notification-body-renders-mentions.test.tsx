/**
 * @jest-environment jsdom
 *
 * RC-B11 verify round 2, finding 4 — A NOTIFICATION NEVER SHOWS RAW MARKUP. The mention notice quoted
 * the comment's stored form ("@[test@test.com](user:…)") instead of the person's name. Notice bodies
 * render through the ONE core at the inline level (someone else's text: remote images ask first).
 *
 * Use case: a tutor mentions a student on a study-guide comment; the student's inbox shows
 * "Please review … @test@test.com", never brackets and ids.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("server-only", () => ({}));

import { NotificationBody } from "../components/NotificationBody";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

it("renders a stored mention as the person's name, never its markup", async () => {
  await act(async () => {
    root.render(<NotificationBody body={"Please review the map types before Friday @[test@test.com](user:4060701e-706a-4c76-b3ca-0bbc69fa5a14) and **today**"} />);
  });
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  const text = container.textContent ?? "";
  expect(text).toContain("test@test.com");
  expect(text).not.toContain("(user:");
  expect(text).not.toContain("@[");
  expect(text).not.toContain("**");
});
