// /demos/composer/variables — the Smart Agent Input on a real conversation with any agent,
// so every variable type and variables-panel style can be tried.

import type { Metadata } from "next";
import { readComposerModeCookie } from "@ai-matrx/chat/next/server/composer-mode.server";
import { ComposerVariables } from "./ComposerVariables";

export const metadata: Metadata = {
  title: "Composer Variables",
  description: "The chat input with every agent variable type.",
};

export default async function ComposerVariablesPage() {
  const initialMode = await readComposerModeCookie();
  return <ComposerVariables initialMode={initialMode} />;
}
