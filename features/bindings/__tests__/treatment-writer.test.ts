import { writePresentation } from "../treatment-writer";
import { defaultPresentation } from "../treatment-shape";

const maybeSingle = jest.fn();
const update = jest.fn();
const eq = jest.fn();
const invalidate = jest.fn();

jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@/features/mandates/service", () => ({
  invalidateMandateCache: () => invalidate(),
}));
jest.mock("@/lib/supabase/mandateStorage", () => ({
  mandateTreatments: () => {
    const query = {
      update: (value: unknown) => {
        update(value);
        return query;
      },
      select: () => query,
      eq: (key: string, value: unknown) => {
        eq(key, value);
        return query;
      },
      is: () => query,
      maybeSingle: () => maybeSingle(),
    };
    return query;
  },
}));

const save = () =>
  writePresentation({
    owner: {
      mandateId: "mandate",
      organizationId: "org",
      label: "Test",
      visibility: "personal",
    },
    presentation: { ...defaultPresentation(), hideReasoning: true },
    treatmentId: "treatment",
    expectedVersion: 7,
    enabled: true,
  });

beforeEach(() => jest.clearAllMocks());

test("saves only the read revision and returns the new token", async () => {
  maybeSingle.mockResolvedValueOnce({
    data: { id: "treatment", version: 8 },
    error: null,
  });
  await expect(save()).resolves.toEqual({
    treatmentId: "treatment",
    version: 8,
  });
  expect(eq).toHaveBeenCalledWith("version", 7);
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({ version: 8, organization_id: "org" }),
  );
  expect(invalidate).toHaveBeenCalledTimes(1);
});

test("refuses a stale save instead of reporting zero updated rows as success", async () => {
  maybeSingle.mockResolvedValueOnce({ data: null, error: null });
  maybeSingle.mockResolvedValueOnce({
    data: { id: "treatment", version: 9 },
    error: null,
  });
  await expect(save()).rejects.toThrow("Changed elsewhere");
  expect(update).toHaveBeenCalledTimes(1);
  expect(invalidate).not.toHaveBeenCalled();
});

test("reports an unavailable row without claiming save success", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(save()).rejects.toThrow("Preferences unavailable");
  expect(invalidate).not.toHaveBeenCalled();
});
