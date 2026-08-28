import { analyzeInteractiveRootSource } from "@/scripts/check-surface-interactive-roots";

describe("P12 interactive-root classification", () => {
  it("reports a substantial controlled dialog with interaction identity", () => {
    const result = analyzeInteractiveRootSource(
      "features/example/ThingInspectorDialog.tsx",
      `
        import { Dialog } from "@/components/ui/dialog";
        export function ThingInspectorDialog({ open }: { open: boolean }) {
          return <Dialog open={open}><div><header /><main><section /><aside /><article /><footer /><button /></main></div></Dialog>;
        }
      `,
    );

    expect(result).toMatchObject({
      roots: 1,
      statefulRoots: 1,
      subordinateRoots: 0,
    });
    expect(result.candidates).toEqual([
      expect.objectContaining({
        component: "ThingInspectorDialog",
        kind: "dialog",
        stateProp: "open",
        runtimeProvider: false,
      }),
    ]);
  });

  it("recognizes aliased roots and provider evidence in the owning component", () => {
    const result = analyzeInteractiveRootSource(
      "features/example/DetailsPanel.tsx",
      `
        import { Tabs as CanonicalTabs } from "@/components/ui/tabs";
        import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
        export const DetailsPanel = () => (
          <SurfaceRuntimeProvider surfaceName="matrx-user/example" getScope={() => ({})}>
            <CanonicalTabs defaultValue="summary"><div /></CanonicalTabs>
          </SurfaceRuntimeProvider>
        );
      `,
    );

    expect(result.candidates).toEqual([
      expect.objectContaining({
        component: "DetailsPanel",
        kind: "tabs",
        stateProp: "defaultValue",
        runtimeProvider: true,
      }),
    ]);
  });

  it("keeps subordinate and fake roots out of the audit queue", () => {
    const subordinate = analyzeInteractiveRootSource(
      "features/example/SettingsCard.tsx",
      `
        import { AlertDialog } from "@/components/ui/alert-dialog";
        export function SettingsCard({ open }: { open: boolean }) {
          return <AlertDialog open={open}><div /></AlertDialog>;
        }
      `,
    );
    const fake = analyzeInteractiveRootSource(
      "features/example/FakeDialog.tsx",
      `
        import { Dialog } from "./local-dialog";
        export function FakeDialog({ open }: { open: boolean }) {
          return <Dialog open={open}><div /></Dialog>;
        }
      `,
    );

    expect(subordinate).toMatchObject({
      roots: 1,
      statefulRoots: 1,
      subordinateRoots: 1,
      candidates: [],
    });
    expect(fake).toMatchObject({
      roots: 0,
      statefulRoots: 0,
      subordinateRoots: 0,
      candidates: [],
    });
  });

  it("excludes action dialogs even when their body is large", () => {
    const result = analyzeInteractiveRootSource(
      "features/example/CreateThingDialog.tsx",
      `
        import { Dialog } from "@/components/ui/dialog";
        export function CreateThingDialog({ open }: { open: boolean }) {
          return <Dialog open={open}><div><header /><main><section /><aside /><article /><footer /><button /></main></div></Dialog>;
        }
      `,
    );

    expect(result).toMatchObject({
      roots: 1,
      statefulRoots: 1,
      subordinateRoots: 1,
      candidates: [],
    });
  });

  it("requires explicit root state before classifying identity", () => {
    const result = analyzeInteractiveRootSource(
      "features/example/PassiveDrawer.tsx",
      `
        import { Drawer } from "@/components/ui/drawer";
        export function PassiveDrawer() {
          return <Drawer><div /></Drawer>;
        }
      `,
    );

    expect(result).toMatchObject({
      roots: 1,
      statefulRoots: 0,
      subordinateRoots: 0,
      candidates: [],
    });
  });
});
