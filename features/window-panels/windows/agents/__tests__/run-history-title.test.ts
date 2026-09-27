/**
 * THE RUN HISTORY WINDOW NAMES WHAT IT IS THE HISTORY OF (page-pass 2026-09-27,
 * /agent-apps/[id]/run). It read "Run History — Agent": an app's agent often has
 * no name of its own. The app passes its name as the subject.
 */
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => jest.fn(), useAppSelector: jest.fn(), useAppStore: jest.fn() }));
import { runHistoryWindowTitle } from "../AgentRunHistoryWindow";

describe("runHistoryWindowTitle", () => {
  const base = { agentId: "a-1", initialAgentId: "a-1", agentName: null };
  it("names the app the person opened it from", () => {
    expect(runHistoryWindowTitle({ ...base, subject: "Recipe Scaler" })).toBe("Run History — Recipe Scaler");
  });
  it("falls back to the agent's name, then to 'Agent'", () => {
    expect(runHistoryWindowTitle({ ...base, subject: null, agentName: "Grant Writer" })).toBe("Run History — Grant Writer");
    expect(runHistoryWindowTitle({ ...base, subject: null })).toBe("Run History — Agent");
  });
  it("drops the subject once the person switches to another agent", () => {
    expect(runHistoryWindowTitle({ agentId: "a-2", initialAgentId: "a-1", subject: "Recipe Scaler", agentName: "Grant Writer" })).toBe("Run History — Grant Writer");
  });
});
