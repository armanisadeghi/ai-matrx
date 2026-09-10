"use client";

/**
 * ListsTab — how every list in the product behaves for THIS user.
 *
 * Today it carries exactly one knob, and it is a platform one:
 * THE ARCHIVED-ITEMS LAW (../../../../common-docs/policies/archived-items.md)
 * fixes the platform default at "hide archived" and puts the reveal one or two
 * clicks away on the surface itself. §6 of that law says the DEFAULT is a knob,
 * not code taste — so a person who lives in their archive can start every list
 * showing everything, without any surface hardcoding an opinion.
 *
 * What this does NOT change: the control still exists on every list, the
 * "Archived (N)" disclosure on card surfaces still starts closed, and an
 * explicit choice on a surface (or one carried in a shared URL) always wins.
 */

import { Archive } from "lucide-react";

import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsRadioGroup } from "@/components/official/settings/primitives/SettingsRadioGroup";
import type { SettingsOption } from "@/components/official/settings/types";

import { useSetting } from "../hooks/useSetting";

type ArchivedDefault = "active" | "all";

const OPTIONS: SettingsOption<ArchivedDefault>[] = [
  {
    value: "active",
    label: "Hidden by default",
    description:
      "Lists open showing active items only. Archived items stay one click away on each list.",
  },
  {
    value: "all",
    label: "Shown by default",
    description:
      "Lists open showing archived items alongside active ones. You can still narrow any list back down.",
  },
];

export default function ListsTab() {
  const [archivedDefault, setArchivedDefault] = useSetting<ArchivedDefault>(
    "userPreferences.lists.archivedDefault",
  );

  return (
    <>
      <SettingsSubHeader
        title="Lists"
        description="How lists across the product start out for you."
        icon={Archive}
      />
      <SettingsSection title="Archived items">
        <SettingsRadioGroup<ArchivedDefault>
          label="Archived items"
          description="Archiving never deletes anything — this only decides what a list shows before you touch it."
          value={archivedDefault ?? "active"}
          onValueChange={setArchivedDefault}
          options={OPTIONS}
          last
        />
      </SettingsSection>
    </>
  );
}
