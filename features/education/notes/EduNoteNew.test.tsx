import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const replace = jest.fn();
const create = jest.fn();
let organizationId: string | null = null;

jest.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => organizationId,
}));
jest.mock("@/features/notes/service/notesApi", () => ({
  NotesAPI: { create },
}));

import { EduNoteNew } from "./EduNoteNew";

describe("EduNoteNew organization hydration", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    organizationId = null;
    replace.mockReset();
    create.mockReset().mockResolvedValue({ id: "note-after-hydration" });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("creates exactly once after a null organization hydrates", async () => {
    await act(async () => {
      root.render(<EduNoteNew />);
    });
    expect(create).not.toHaveBeenCalled();

    organizationId = "66666666-6666-4666-8666-666666666666";
    await act(async () => {
      root.render(<EduNoteNew />);
    });
    await act(async () => undefined);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      label: "Untitled note",
      content: "",
      organization_id: organizationId,
    });
    expect(replace).toHaveBeenCalledWith("/education/notes/note-after-hydration");

    await act(async () => {
      root.render(<EduNoteNew />);
    });
    expect(create).toHaveBeenCalledTimes(1);
  });
});
