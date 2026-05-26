import { Metadata } from "next";
import { RunsManagementView } from "@/features/ai-runs/components/RunsManagementView";


export const metadata: Metadata = {
  title: "AI Runs | AI Matrx",
  description: "View and manage your AI conversation history",
};

export default function RunsPage() {
  return <RunsManagementView />;
}

