"use client";

// Settings › AI & Models › Models — which current catalog models appear in
// the person's model pickers.
//
// WHAT THE SWITCHES DO (page-pass 2026-09-27): a model is SHOWN unless the
// person switched it off, which puts its id in
// `userPreferences.aiModels.inactiveModels`. Every user-variant model picker
// (`ModelListDropdown`, `SettingsModelPicker` scope "active") leaves those
// models out — except a model that is already someone's chosen value, which
// always stays visible in its own picker. The old screen read an
// `activeModels` allow-list that no picker consulted: it said "0 active" with
// every switch off while every model was, in fact, offered everywhere.
//
// The list is the CURRENT catalog (retired models never appear in a
// person's pickers), which is why it is smaller than a picker's count used to
// be when that count included retired models.

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SegmentedControl,
} from "@ai-matrx/design-system";
import { SearchInput } from "@/components/official/SearchInput";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { ReadFailure } from "@/components/read-state/ReadFailure";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsButton } from "@/components/official/settings/primitives/SettingsButton";
import { idMatchesQuery } from "@ai-matrx/kit/search-scoring";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import { useModels } from "@/features/ai-models/hooks/useModels";

type ShowFilter = "all" | "shown" | "hidden";
const ALL_MAKERS = "__all__";

const AiModelsPreferences = () => {
  const dispatch = useAppDispatch();
  const hiddenIds = useAppSelector(
    (state) => state.userPreferences.aiModels.inactiveModels,
  );
  const { models, isLoading, error } = useModels();

  const [query, setQuery] = useState("");
  const [show, setShow] = useState<ShowFilter>("all");
  const [maker, setMaker] = useState<string>(ALL_MAKERS);

  const hidden = new Set(hiddenIds);
  const makers = [
    ...new Set(
      models.map((m) => m.maker).filter((m): m is string => Boolean(m)),
    ),
  ].sort();

  const setHidden = (next: string[]) =>
    dispatch(
      setPreference({
        module: "aiModels",
        preference: "inactiveModels",
        value: next,
      }),
    );

  const toggle = (modelId: string, shown: boolean) =>
    setHidden(
      shown
        ? hiddenIds.filter((id) => id !== modelId)
        : [...new Set([...hiddenIds, modelId])],
    );

  const q = query.trim().toLowerCase();
  const rows = models.filter((m) => {
    if (show === "shown" && hidden.has(m.id)) return false;
    if (show === "hidden" && !hidden.has(m.id)) return false;
    if (maker !== ALL_MAKERS && m.maker !== maker) return false;
    if (!q) return true;
    return (
      m.common_name?.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      m.maker?.toLowerCase().includes(q) ||
      idMatchesQuery(m, q)
    );
  });

  if (isLoading && models.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <SuspenseLoader size="sm" message="Loading the model catalog…" />
      </div>
    );
  }

  // A failed catalog read says so and never renders "0 models".
  if (error && models.length === 0) {
    return <ReadFailure error={error} what="the model catalog" />;
  }

  const hiddenCount = models.filter((m) => hidden.has(m.id)).length;
  const shownCount = models.length - hiddenCount;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search models"
          aria-label="Search models"
          debounceTime={0}
          className="min-w-48 flex-1"
        />
        <SegmentedControl
          value={show}
          onValueChange={(v) => setShow(v as ShowFilter)}
          data={[
            { value: "all", label: `All ${models.length}` },
            { value: "shown", label: `Shown ${shownCount}` },
            { value: "hidden", label: `Hidden ${hiddenCount}` },
          ]}
        />
        <Select value={maker} onValueChange={setMaker}>
          <SelectTrigger className="w-44" aria-label="Maker">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_MAKERS}>All makers</SelectItem>
            {makers.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>



      <SettingsSection
        title={
          show === "hidden"
            ? "Hidden from your pickers"
            : "Offered in your model pickers"
        }
      >
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No models match.
          </p>
        ) : (
          rows.map((model, index) => {
            const shown = !hidden.has(model.id);
            const label = model.common_name || model.name;
            return (
              <SettingsSwitch
                key={model.id}
                id={`model-${model.id}`}
                label={label}
                description={[
                  model.maker,
                  model.common_name && model.name !== model.common_name
                    ? model.name
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                checked={shown}
                onCheckedChange={(next: boolean) => toggle(model.id, next)}
                last={index === rows.length - 1 && hiddenCount === 0}
              />
            );
          })
        )}
        {hiddenCount > 0 ? (
          <SettingsButton
            label={`${hiddenCount} hidden`}
            actionLabel="Show all again"
            kind="outline"
            size="sm"
            onClick={() => setHidden([])}
            last
          />
        ) : null}
      </SettingsSection>
    </div>
  );
};

export default AiModelsPreferences;
