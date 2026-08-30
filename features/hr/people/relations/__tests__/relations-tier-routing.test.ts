const fetchHrConfidential = jest.fn();
const fetchHrRelationsList = jest.fn();
const fetchHrRestricted = jest.fn();
const fetchHrRestrictedList = jest.fn();

jest.mock("@/features/hr/service", () => ({
  fetchHrConfidential,
  fetchHrRelationsList,
  fetchHrRestricted,
  fetchHrRestrictedList,
}));

import {
  fetchHrRelationsCase,
  fetchHrRelationsCases,
} from "@/features/hr/people/relations/service";

describe("employee-relations audited-door routing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads the mixed queue through the purpose-built union door", async () => {
    fetchHrRelationsList.mockResolvedValue({
      ok: true,
      data: {
        rows: [],
        total: 0,
        correctiveActionsGranted: true,
        incidentsGranted: true,
      },
    });

    await fetchHrRelationsCases("2643e470-b275-47f3-95f3-ae275ad3ca47");

    expect(fetchHrRelationsList).toHaveBeenCalledWith({
      organizationId: "2643e470-b275-47f3-95f3-ae275ad3ca47",
      filter: {},
      limit: 5_000,
    });
    expect(fetchHrRestrictedList).not.toHaveBeenCalled();
  });

  it("opens corrective actions through the confidential door", async () => {
    fetchHrConfidential.mockResolvedValue({ ok: false, kind: "denied" });

    await fetchHrRelationsCase({
      caseKind: "corrective_action",
      caseId: "083bfb17-a446-4ec4-a9f9-4296a3cbe7a1",
      justification: "Review this case",
    });

    expect(fetchHrConfidential).toHaveBeenCalledWith({
      token: "hr_corrective_action",
      id: "083bfb17-a446-4ec4-a9f9-4296a3cbe7a1",
      purpose: "relations_case_open",
    });
    expect(fetchHrRestricted).not.toHaveBeenCalled();
  });

  it("keeps incidents on the restricted door with justification", async () => {
    fetchHrRestricted.mockResolvedValue({ ok: false, kind: "denied" });

    await fetchHrRelationsCase({
      caseKind: "incident",
      caseId: "dd2bc99a-f96c-4b93-90c8-901e99790dae",
      justification: "Review this case",
    });

    expect(fetchHrRestricted).toHaveBeenCalledWith({
      token: "hr_incident",
      id: "dd2bc99a-f96c-4b93-90c8-901e99790dae",
      purpose: "relations_case_open",
      justification: "Review this case",
    });
    expect(fetchHrConfidential).not.toHaveBeenCalled();
  });
});
