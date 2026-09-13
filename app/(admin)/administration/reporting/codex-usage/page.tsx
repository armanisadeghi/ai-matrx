import { CodexUsageDashboard } from "@/features/admin/codex-usage/CodexUsageDashboard";

export const metadata = {
  title: "Codex usage | Reporting | Administration",
  description:
    "Sanitized Codex activity captured by the signed-in user's Matrx Local app.",
};

export default function CodexUsagePage() {
  return <CodexUsageDashboard />;
}
