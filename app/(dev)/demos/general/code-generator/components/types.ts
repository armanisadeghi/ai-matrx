export interface SavedComponent {
  id: string;
  name: string;
  code: string;
}

function isSavedComponent(value: unknown): value is SavedComponent {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "code" in value &&
    typeof value.code === "string"
  );
}

export function parseSavedComponents(raw: string): SavedComponent[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || !value.every(isSavedComponent)) {
    throw new Error("Saved components have an invalid shape");
  }
  return value;
}
