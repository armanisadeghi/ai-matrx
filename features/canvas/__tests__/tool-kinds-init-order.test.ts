/**
 * THE RIGHT-CLICK MENU DOES NOT DRAG THE CANVAS KIND LIST IN.
 *
 * `toolKinds` builds `TOOL_CANVAS_KINDS = withOutputDecisions([...every kind])` at module init,
 * and each kind pulls its whole canvas view — and through the views the store and the menu.
 * The menu's `useQuickActions` used to import `toolKinds` just for the launcher hook, so
 * opening the menu loaded every kind and the menu ↔ kind graph became an import cycle: any
 * stand-in or partial module among the kinds became an `undefined` entry, and
 * `withOutputDecisions` threw "Cannot read properties of undefined (reading 'id')" while the
 * NotesWindow right-click menu was loading (it never rendered). The launchers are now a leaf
 * (`quickToolLaunchers`) that imports no kind.
 *
 * Break it names: the menu path importing `toolKinds` again → "toolKinds was loaded by the menu".
 */
describe("the menu path never loads the canvas kind list", () => {
  afterEach(() => { jest.dontMock("@/features/canvas/host/toolKinds"); });

  it("useContextMenuActions + AlchemyMenuContent load without toolKinds", () => {
    jest.isolateModules(() => {
      jest.doMock("@/features/canvas/host/toolKinds", () => {
        throw new Error("toolKinds was loaded by the menu");
      });
      expect(() => require("@/features/context-menu-v3/components/AlchemyMenuContent")).not.toThrow();
    });
  });

  it("the launcher leaf still opens the same tools the kind list registers", () => {
    jest.isolateModules(() => {
      const { TOOL_CANVAS_KINDS } = require("@/features/canvas/host/toolKinds");
      const ids = TOOL_CANVAS_KINDS.map((k: { id: string }) => k.id);
      for (const id of ["quick-chat", "quick-notes", "quick-tasks", "quick-data", "quick-scribe"]) {
        expect(ids).toContain(id);
      }
    });
  });
});
