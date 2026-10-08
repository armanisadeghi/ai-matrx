import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MeetingsHome } from "./MeetingsHome";

const mockRpc = jest.fn();
const mockSetKnobOverride = jest.fn();
const mockEnsureOrganizationContext = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: jest.fn(() => ({ rpc: mockRpc })) },
}));

jest.mock("@/lib/scoped-config/service", () => ({
  knobRefusalSentence: () => "The setting could not be saved.",
  setKnobOverride: (...args: unknown[]) => mockSetKnobOverride(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams("tab=upcoming"),
}));

jest.mock("@ai-matrx/meet/react", () => ({ useMeetHost: () => null }));
jest.mock("@ai-matrx/tap-target", () => ({
  TapTargetButton: () => null,
  TapTargetButtonSolid: () => null,
}));
jest.mock("@ai-matrx/design-system", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
  Skeleton: () => null,
}));
jest.mock("@/features/shell/components/header/RouteHeader", () => () => null);
jest.mock("@/features/shell/components/header/RouteModeNav", () => ({
  RouteModeNav: () => null,
}));
jest.mock("@/features/mandates/feature-intelligence/IntelligenceIndicator", () => ({
  IntelligenceIndicator: () => null,
}));
jest.mock("@/components/ui/button", () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  ),
}));
jest.mock("@/components/ui/switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
    ...props
  }: {
    checked: boolean;
    onCheckedChange: (value: boolean) => void;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} onClick={() => onCheckedChange(!checked)} />
  ),
}));
jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuSeparator: () => null,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/features/item-presentation/useOpenItemPresentation", () => ({
  useOpenItemPresentation: () => jest.fn(),
}));
jest.mock("@/features/meet/hooks/useExternalEvents", () => ({
  useExternalEvents: () => ({
    events: [],
    loading: false,
    failure: null,
    retry: jest.fn(),
  }),
}));
jest.mock("@/features/meet/lib/external-events", () => ({
  PROVIDER_LABELS: {},
  agendaExternalEvents: () => [],
  noteTakerLine: () => "",
  prefillGuests: () => [],
}));
jest.mock("@/features/meet/lib/zoned-time", () => ({
  utcToZoned: () => ({ date: "", time: "" }),
  browserTimeZone: "America/Los_Angeles",
  formatClock: () => "",
  formatLongDate: () => "",
  formatTimeRange: () => "",
  zoneAbbreviation: () => "",
  zoneLabel: () => "Pacific Time",
}));
jest.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: () => mockEnsureOrganizationContext(),
}));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn() } }));
jest.mock("@/features/meet/hooks/useMeetingsDirectory", () => ({
  isLiveInstant: () => false,
  isPast: () => false,
  useMeetingsDirectory: () => ({
    userId: "member-73",
    meetings: [],
    occurrences: [],
    roles: new Map(),
    reload: jest.fn(),
    loading: false,
    failure: null,
  }),
}));
jest.mock("@/features/meet/hooks/useMeetingActions", () => ({
  errorSentence: (error: unknown) => String(error),
  useMeetingActions: () => ({
    organizationId: null,
    ready: false,
    startInstant: jest.fn(),
  }),
}));
jest.mock("@/features/meet/lib/agenda", () => ({
  groupByDay: () => [],
  isLive: () => false,
  matchesQuery: () => true,
  startsSoon: () => false,
  upcomingRows: () => [],
}));
jest.mock("@/features/meet/lib/recurrence", () => ({
  describeRecurrence: () => "",
}));
jest.mock("@/features/meet/components/manage/MeetingRowMenu", () => ({
  MeetingRowMenu: () => null,
}));
jest.mock("@/features/meet/components/record/RecordingsLibrary", () => ({
  RecordingsLibrary: () => null,
}));
jest.mock("@/features/meet/components/record/MeetingContentSearch", () => ({
  MeetingContentSearch: () => null,
}));
jest.mock("@/features/meet/components/manage/MeetingFormDialog", () => ({
  MeetingFormDialog: () => null,
}));
jest.mock("@/features/meet/components/manage/RsvpControl", () => ({
  RsvpBadge: () => null,
}));
jest.mock("@/features/meet/components/manage/useMeetingActionHost", () => ({
  meetingHref: () => "/meet/example",
  useMeetingActionHost: () => ({ run: jest.fn(), dialogs: null }),
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({
  ErrorAlchemyMenu: () => null,
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("MeetingsHome calendar events toggle", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockSetKnobOverride.mockResolvedValue({ ok: true });
    mockEnsureOrganizationContext.mockResolvedValue("org-picked-in-dialog");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<MeetingsHome />);
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("writes the picked organization through the mounted MeetingsHome toggle", async () => {
    await waitFor(() =>
      container.querySelector<HTMLButtonElement>(
        '[aria-label="Show calendar events"]',
      ),
    );
    const toggle = container.querySelector<HTMLButtonElement>(
      '[aria-label="Show calendar events"]',
    );
    if (toggle === null) {
      throw new Error("MeetingsHome did not render the calendar toggle.");
    }

    await act(async () => {
      toggle.click();
    });

    expect(mockEnsureOrganizationContext).toHaveBeenCalledTimes(1);
    expect(mockSetKnobOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-picked-in-dialog",
        scopeId: "member-73",
        value: false,
      }),
    );
  });
});

async function waitFor<T>(read: () => T | null): Promise<T> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const value = read();
    if (value !== null) return value;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  throw new Error("Timed out waiting for MeetingsHome to render its calendar toggle.");
}
