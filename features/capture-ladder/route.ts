/**
 * The full list of pages waiting for a person's own browser.
 *
 * Its own module so that naming the route costs nobody a component import —
 * this used to live in the tray, which meant `BatchScrapePage` pulled a
 * floating overlay and its whole read stack in to write one `href`.
 */
export const NEEDS_YOU_ROUTE = "/capture/needs-you";
