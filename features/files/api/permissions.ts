// MOVED to @ai-matrx/media/files/engine/api/permissions (P16f — the files engine lives in @ai-matrx/media).
// This path stays so the app's importers keep working; grow it in the package. A jest.mock of
// THIS path reaches only importers of this path — mock the package module to reach the engine/chat.
// Loading this module wires the engine to the app (the host port), wherever it is imported.
import "@/features/files/files-host";
export * from "@ai-matrx/media/files/engine/api/permissions";
