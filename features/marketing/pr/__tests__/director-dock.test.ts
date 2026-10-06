/**
 * THE PR DIRECTOR DOES NOT SQUEEZE THE PRESS ROOM BY DEFAULT.
 *
 * Walk 2026-10-05: at a laptop width the Director column opened by default and left the
 * angle list about 230px wide. The dock now opens by default only where both fit side by side
 * (DIRECTOR_DOCK_MIN_WIDTH), and a person's own open/close choice is remembered and wins.
 * It is a personal view preference (like a sidebar), so it lives with the person, not as an
 * organization setting.
 */

import { DIRECTOR_DOCK_KEY, DIRECTOR_DOCK_MIN_WIDTH, initialDirectorDocked } from "../director/director-dock";

beforeEach(() => localStorage.clear());

test("closed by default where the angle list would be squeezed, open where both fit", () => {
  expect(initialDirectorDocked(1024)).toBe(false);
  expect(initialDirectorDocked(1280)).toBe(false);
  expect(initialDirectorDocked(DIRECTOR_DOCK_MIN_WIDTH)).toBe(true);
});

test("the person's own choice is remembered and wins over the width", () => {
  localStorage.setItem(DIRECTOR_DOCK_KEY, "open");
  expect(initialDirectorDocked(1024)).toBe(true);
  localStorage.setItem(DIRECTOR_DOCK_KEY, "closed");
  expect(initialDirectorDocked(1920)).toBe(false);
});

/*
 * Final walk 2026-10-05: after a reload mid-conversation the panel stayed closed (1280px, below the
 * dock width) and the conversation only showed after a manual click. A page holding a conversation
 * (`?director=`) reopens the Director, whatever the width or the stored choice.
 */
test("a page holding a conversation reopens the Director", () => {
  expect(initialDirectorDocked(1280, true)).toBe(true);
  localStorage.setItem(DIRECTOR_DOCK_KEY, "closed");
  expect(initialDirectorDocked(1024, true)).toBe(true);
  expect(initialDirectorDocked(1024, false)).toBe(false);
});
