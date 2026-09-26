/**
 * RC-B12 round 5: /podcast hid "Your podcasts" when the library read failed —
 * the page looked like a person with no shows. A failed read is shown, with
 * the Alchemy Menu (through ErrorNotice) and a retry.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

let mockLibrary: { myShows: unknown[]; episodes: unknown[]; loading: boolean; error: string | null; refresh: () => Promise<void> };

jest.mock("next/link", () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
jest.mock("@/components/ui/button", () => ({ Button: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button> }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "user-1" }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => "user-1" }));
jest.mock("@/features/podcasts/hooks/useMyPodcasts", () => ({ useMyPodcasts: () => mockLibrary }));
jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
  SurfaceRuntimeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/features/surfaces/manifests/podcast.manifest", () => ({
  createPodcastScope: jest.fn(),
  podcastEpisodeEntry: jest.fn(),
  podcastShowEntry: jest.fn(),
}));
jest.mock("../PodcastGrid", () => ({ PodcastGrid: () => <div>grid</div> }));
jest.mock("@/components/errors/ErrorNotice", () => ({
  ErrorNotice: ({ title, error }: { title?: string; error?: unknown }) => (
    <div data-error-notice="">
      {title} {String(error)}
    </div>
  ),
}));

import { PodcastIndexClient } from "../PodcastIndexClient";

it("a failed library read shows the failure where 'Your podcasts' would be", () => {
  mockLibrary = { myShows: [], episodes: [], loading: false, error: "forced failure (pc_shows)", refresh: async () => {} };
  const html = renderToStaticMarkup(<PodcastIndexClient published={[]} />);
  expect(html).toContain("data-error-notice");
  expect(html).toContain("forced failure (pc_shows)");
  expect(html).toContain("Your podcasts");
});

it("a person with no shows and no failure sees no library section", () => {
  mockLibrary = { myShows: [], episodes: [], loading: false, error: null, refresh: async () => {} };
  const html = renderToStaticMarkup(<PodcastIndexClient published={[]} />);
  expect(html).not.toContain("data-error-notice");
  expect(html).not.toContain("Your podcasts");
});
