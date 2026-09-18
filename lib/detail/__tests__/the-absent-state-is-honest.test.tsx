// 🚨 NEW-9 (VERIFY-U-P1-R3) — A TYPE WITH NO SOURCE IS NOT A NAMED DEAD END.
//
// Reproduced at `e64a912f`: a registered type with no `detailSource` put the
// sentence "No detail is registered for session records" in the header AS THE
// RECORD'S NAME, printed `features/item-presentation/registry.tsx` at the
// person in the body, and dropped the record's doors — so a session, or any
// note reached by `/detail/note/<id>`, was a record you could see the name of
// nothing about and could not open anywhere else.
//
// The rule: name the record from what is certain (its type and its id), say in
// one plain sentence that nothing more is stored about it here, KEEP the doors
// it can offer, and put the developer's remedy in the console where the
// developer is — never on the screen of a non-technical expert (law 4: a
// stand-in announces itself with a remedy, in the person's language).

import * as React from "react";

import { DetailBody } from "../core/DetailBody";
import { DetailActions, DetailTitle } from "../core/DetailHeader";
import { useDetailCore } from "../core/useDetailCore";
import type { DetailRecordType } from "../types";
import { FILE_TYPE, instance, makePorts, mount } from "./harness";

const SOURCELESS: DetailRecordType = { ...FILE_TYPE, load: null };

function Detail({ type = "file" }: { type?: string }) {
  const core = useDetailCore(instance({ type }), "window", { onClose: () => {} });
  return (
    <div>
      <DetailTitle core={core} />
      <DetailActions core={core} />
      <DetailBody core={core} />
    </div>
  );
}

function mountSourceless(type = "file") {
  // The console remedy is announced ONCE PER TYPE PER TAB, so a test that wants
  // to see it uses a type token of its own rather than a type an earlier test
  // has already announced.
  return mount(
    <Detail type={type} />,
    makePorts({ resolveType: () => ({ ...SOURCELESS, type }) }),
  );
}

describe("a record whose type has no detail source", () => {
  it("never puts a sentence where the record's name goes", () => {
    const m = mountSourceless();
    const title = m.container.querySelector("[data-detail-title]")?.textContent ?? "";
    expect(title.toLowerCase()).not.toContain("no detail is registered");
    expect(title.toLowerCase()).not.toContain("registered");
    // A name from what is certain: the type, and the record's own id.
    expect(title).toContain("File");
    expect(title).toContain(instance().id.slice(0, 8));
    m.unmount();
  });

  it("never prints a repo file path at the person", () => {
    const m = mountSourceless();
    const screen = m.container.textContent ?? "";
    expect(screen).not.toContain("registry.tsx");
    expect(screen).not.toContain("features/");
    expect(screen).not.toContain("detailSource");
    m.unmount();
  });

  it("says in plain words that nothing more is stored here", () => {
    const m = mountSourceless();
    const screen = (m.container.textContent ?? "").toLowerCase();
    expect(screen).toContain("nothing more");
    m.unmount();
  });

  it("keeps the doors it can offer — the record still opens in its home, and its id still copies", () => {
    const m = mountSourceless();
    expect(m.container.querySelector("[data-doors]")).not.toBeNull();
    expect(m.container.querySelector("[data-detail-copy-id]")).not.toBeNull();
    m.unmount();
  });

  it("puts the developer's remedy in the console, once, naming the registry", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const m = mountSourceless("session");
    const said = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(said).toContain("has no `load`");
    expect(said).toContain("features/item-presentation/registry.tsx");
    m.unmount();
    warn.mockRestore();
  });
});

describe("a type nothing is registered for at all", () => {
  it("says so in the person's language and keeps the console for the remedy", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const m = mount(<Detail type="grenade" />, makePorts({ resolveType: () => null }));
    const screen = m.container.textContent ?? "";
    expect(screen).not.toContain("registry.tsx");
    expect(warn.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("registry.tsx");
    m.unmount();
    warn.mockRestore();
  });
});
