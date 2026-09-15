import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const coexistenceHosts = [
  "features/admin/users/components/OrganizationsAdminClient.tsx",
  "features/agents/components/builder/message-builders/AddBlockButton.tsx",
  "features/agents/components/builder/message-builders/system-instructions/SystemPromptOptimizer.tsx",
  "features/agents/components/messages-display/message-options/EditHistoryDialog.tsx",
  "features/cms/components/CmsPageAiActionDialog.tsx",
  "features/crm/components/SaveContactFromSelectionDialog.tsx",
  "features/marketing/change-tracking/SeoChangeTrackingWorkspace.tsx",
  "features/marketing/components/pages/CaptureObservations.tsx",
  "features/marketing/seo/value-system/dimensions/MatcherEditor.tsx",
  "features/messaging/components/NewConversationDialog.tsx",
  "features/rag/components/documents/DocumentViewer.tsx",
  "features/transcript-studio/components/columns/AudioImportDialog.tsx",
] as const;

describe("dialogs that launch WindowPanels", () => {
  it.each(coexistenceHosts)(
    "%s remains non-modal and open while its child window is used",
    (relativePath) => {
      const source = fs.readFileSync(path.join(root, relativePath), "utf8");

      expect(source).toContain("modal={false}");
      expect(source).toMatch(
        /onInteractOutside=\{\(event\) => event\.preventDefault\(\)\}/,
      );
    },
  );

  it.each([
    {
      file: "features/code-files/actions/QuickSaveCodeCore.tsx",
      close: "setShowOverwrite(false);",
    },
    {
      file: "features/scopes/actions/quick-assign/SetContextValueCore.tsx",
      close: "setShowOverwriteWarning(false);",
    },
  ])(
    "$file closes its blocking confirmation before opening a diff window",
    ({ file, close }) => {
      const source = fs.readFileSync(path.join(root, file), "utf8");
      const handler = source.slice(
        source.indexOf("const handlePreviewOverwrite"),
        source.indexOf("const handlePreviewOverwrite") + 900,
      );

      expect(handler.indexOf(close)).toBeGreaterThanOrEqual(0);
      expect(handler.indexOf(close)).toBeLessThan(handler.indexOf("openDiff({"));
    },
  );
});
