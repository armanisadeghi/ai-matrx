import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  getSurfaceRuntimeForName,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";

const listByKind = jest.fn();

jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/components/agent-copy/AlchemySurfaceBridge", () => ({
  AlchemySurfaceBridge: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ userAuth: { authReady: true, id: "admin", accessToken: "token" } }),
}));
jest.mock("@ai-matrx/design-system", () => ({
  Skeleton: () => <div>Loading</div>,
}));
jest.mock("@/features/education/components/EducationToolHeader", () => ({
  EducationToolHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/hooks/auth/useLoginHref", () => ({ useLoginHref: () => "/login" }));
jest.mock("./service", () => ({
  studyMediaService: { listByKind: (...args: unknown[]) => listByKind(...args) },
}));
jest.mock("@/features/surfaces/manifests/education-audio-study.manifest", () => ({
  createEducationAudioStudyScope: (scope: Record<string, unknown>) => scope,
}));
jest.mock("@/features/surfaces/manifests/education-memory.manifest", () => ({
  createEducationMemoryScope: (scope: Record<string, unknown>) => scope,
}));

import { AudioStudyHome } from "./audio/components/AudioStudyHome";
import { MemoryHome } from "../memory/components/MemoryHome";

describe("study-media home error states", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders calm retries and never returns failed-library data through either provider", async () => {
    const rawFailure = "permission denied — hint: GRANT SELECT TO anon (42501)";
    listByKind.mockResolvedValue({ data: null, error: rawFailure });

    await act(async () => {
      root.render(
        <>
          <AudioStudyHome />
          <MemoryHome />
        </>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Could not load audio studies right now.");
    expect(container.textContent).toContain("Could not load memory aids right now.");
    expect(container.textContent).not.toContain(rawFailure);
    expect(container.textContent).not.toContain("GRANT SELECT");
    expect(container.textContent?.match(/Try again/g)).toHaveLength(2);

    expect(
      getSurfaceRuntimeForName("matrx-user/education-audio-study")?.getScope(),
    ).toMatchObject({ view: "list", library_loaded: false });
    expect(
      getSurfaceRuntimeForName("matrx-user/education-memory")?.getScope(),
    ).toMatchObject({ view: "list", library_loaded: false });
    expect(
      getSurfaceRuntimeForName("matrx-user/education-audio-study")?.getScope(),
    ).not.toHaveProperty("audio_library");
    expect(
      getSurfaceRuntimeForName("matrx-user/education-memory")?.getScope(),
    ).not.toHaveProperty("aid_library");
  });
});
