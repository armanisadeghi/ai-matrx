"use client";

import { toast } from "@/lib/toast";
import { useThemeMode } from "@/styles/themes/useThemeMode";

export default function Page() {
  const theme = useThemeMode();
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-5 p-8 text-foreground">
      <h1 className="text-xl font-semibold">Error notification review</h1>
      <p className="text-sm text-muted-foreground">
        Preview only. These examples do not change conversations.
      </p>
      <label>
        Appearance{" "}
        <select
          aria-label="Appearance"
          value={theme}
          onChange={(event) =>
            document.documentElement.classList.toggle(
              "dark",
              event.target.value === "dark",
            )
          }
          className="ml-3 rounded border bg-background p-2"
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <button
        className="rounded border px-4 py-2 text-left"
        onClick={() =>
          toast.error("Couldn't mark messages as read", {
            description: "Try again.",
          })
        }
      >
        Show read error
      </button>
      <button
        className="rounded border px-4 py-2 text-left"
        onClick={() =>
          toast.error(
            "A longer error message that needs room to wrap without covering the copy control",
            {
              description:
                "The notification should keep its text and actions inside the card.",
              action: {
                label: "Retry",
                onClick: () => toast.success("Retry preview"),
              },
            },
          )
        }
      >
        Show long error with action
      </button>
      <label className="flex flex-col gap-2">
        Paste copied error
        <textarea
          aria-label="Paste copied error"
          className="min-h-28 rounded border bg-background p-3"
          placeholder="Paste here to check the copied text"
        />
      </label>
    </main>
  );
}
