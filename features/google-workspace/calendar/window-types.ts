/** Serializable selection shared by Calendar window launchers and its body. */
export interface GoogleAgendaWindowLaunchData {
  initialView?: "calendar" | "agenda" | "selected" | "meet";
}

/** Overlay state can be restored from storage, so narrow it at the consumer. */
export function readGoogleAgendaWindowLaunchData(value: unknown): GoogleAgendaWindowLaunchData {
  if (!value || typeof value !== "object" || !("initialView" in value)) return {};
  const view = value.initialView;
  return view === "calendar" || view === "agenda" || view === "selected" || view === "meet"
    ? { initialView: view }
    : {};
}
