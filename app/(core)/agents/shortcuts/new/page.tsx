"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { ShortcutForm } from "@/features/agent-shortcuts/components/ShortcutForm";
import { useAgentShortcuts } from "@/features/agent-shortcuts/hooks/useAgentShortcuts";

const SCOPE = "user" as const;

export default function UserNewShortcutPage() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { categories } = useAgentShortcuts({ scope: SCOPE });

  const returnToList = () => {
    startTransition(() => router.push("/agents/shortcuts"));
  };

  const handleSuccess = (id: string | null) => {
    startTransition(() => {
      router.push(id ? `/agents/shortcuts/edit/${id}` : "/agents/shortcuts");
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-textured">
      <PageHeader>
        <h1 className="text-sm font-medium text-foreground">New shortcut</h1>
      </PageHeader>
      <div className="flex-1 min-h-0 pt-[var(--shell-header-h)]" />
      <ShortcutForm
        scope={SCOPE}
        isOpen
        onClose={returnToList}
        onSuccess={handleSuccess}
        shortcut={null}
        categories={categories}
      />
    </div>
  );
}
