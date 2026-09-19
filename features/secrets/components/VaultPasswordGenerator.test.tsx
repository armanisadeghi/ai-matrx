import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { VaultPasswordGenerator } from "./VaultPasswordGenerator";
import { fetchVaultGeneratorLimits } from "../generator-limits";

let actor = { userId: "user-1", organizationId: "org-1" };
const writeText = jest.fn();

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: { name: string }) =>
    selector.name === "selectUserId" ? actor.userId : actor.organizationId,
}));
jest.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => false }));
jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({ organizations: [] }),
}));
jest.mock("../generator-limits", () => ({
  fetchVaultGeneratorLimits: jest.fn(),
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn() },
}));

const limits = jest.mocked(fetchVaultGeneratorLimits);

function deferred<T>() {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((done) => {
      resolve = done;
    }),
    resolve,
  };
}

function buttons(text: string): HTMLButtonElement[] {
  return [...document.querySelectorAll("button")].filter(
    (node): node is HTMLButtonElement =>
      node instanceof HTMLButtonElement && node.textContent?.trim() === text,
  );
}

async function setInputValue(node: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function revealedCandidate(): string {
  const candidate = [...document.querySelectorAll("p")]
    .map((node) => node.textContent ?? "")
    .find((text) => text.length > 16 && !text.includes("•"));
  if (!candidate) throw new Error("Missing revealed generated candidate");
  return candidate;
}

describe("VaultPasswordGenerator", () => {
  let host: HTMLDivElement;
  let root: Root;
  let used: string[];
  let props = { targetKey: "create:website_login:password", eligible: true };

  const render = async () => {
    await act(async () => {
      root.render(
        <VaultPasswordGenerator
          {...props}
          onUse={(value) => used.push(value)}
        />,
      );
    });
  };
  const openAndGenerate = async () => {
    await act(async () => buttons("Generate")[0]?.click());
    await act(async () => buttons("Generate").at(-1)?.click());
  };

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    used = [];
    actor = { userId: "user-1", organizationId: "org-1" };
    props = { targetKey: "create:website_login:password", eligible: true };
    limits.mockReset();
    limits.mockResolvedValue({
      maxPasswordLength: 1024,
      maxPassphraseWords: 64,
    });
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    jest.useRealTimers();
  });

  test("uses the published engine for masked password generation, explicit reveal, copy, and use", async () => {
    await render();
    await openAndGenerate();
    expect(document.body.textContent).toContain("••••••••••••••••");
    await act(async () => buttons("Reveal")[0]?.click());
    const revealed = [...document.querySelectorAll("p")]
      .map((node) => node.textContent ?? "")
      .find((text) => /^[^•]{24}$/.test(text));
    expect(revealed).toBeDefined();
    expect(revealed).toMatch(/[a-z]/);
    expect(revealed).toMatch(/[A-Z]/);
    expect(revealed).toMatch(/[2-9]/);
    await act(async () => buttons("Copy")[0]?.click());
    expect(writeText).toHaveBeenCalledWith(revealed);
    await openAndGenerate();
    await act(async () => buttons("Use")[0]?.click());
    expect(used).toHaveLength(1);
    expect(used[0]).toHaveLength(24);
  });

  test("uses passphrase controls through the real engine and expires an unused candidate", async () => {
    jest.useFakeTimers();
    await render();
    await act(async () => buttons("Generate")[0]?.click());
    await act(async () => buttons("Passphrase")[0]?.click());
    await act(async () => buttons("Generate").at(-1)?.click());
    await act(async () => buttons("Reveal")[0]?.click());
    const phrase = [...document.querySelectorAll("p")]
      .map((node) => node.textContent ?? "")
      .find((text) => text.split("-").length === 6);
    expect(phrase).toBeDefined();
    await act(async () => {
      jest.advanceTimersByTime(30_001);
    });
    expect(buttons("Use")).toHaveLength(0);
  });

  test("refuses missing limits and drops stale settings responses after actor, target, or capability changes", async () => {
    const pending = deferred<{
      maxPasswordLength: number;
      maxPassphraseWords: number;
    }>();
    limits.mockReturnValueOnce(pending.promise);
    await render();
    await openAndGenerate();
    actor = { userId: "user-2", organizationId: "org-2" };
    props = { ...props, targetKey: "edit:item-2:field-2", eligible: false };
    await render();
    await act(async () =>
      pending.resolve({ maxPasswordLength: 1024, maxPassphraseWords: 64 }),
    );
    expect(buttons("Use")).toHaveLength(0);
    props = { ...props, eligible: true };
    limits.mockRejectedValueOnce(
      new Error(
        "Password generation is not configured for this organization yet.",
      ),
    );
    await render();
    await openAndGenerate();
    expect(buttons("Use")).toHaveLength(0);
  });

  test("keeps a manual parent draft when a stale generated result arrives and warns after copy invalidation", async () => {
    const pending = deferred<{
      maxPasswordLength: number;
      maxPassphraseWords: number;
    }>();
    limits.mockReturnValueOnce(pending.promise);
    await render();
    await openAndGenerate();
    props = {
      ...props,
      targetKey: "create:website_login:password:manual-change",
    };
    await render();
    await act(async () =>
      pending.resolve({ maxPasswordLength: 1024, maxPassphraseWords: 64 }),
    );
    expect(used).toEqual([]);

    await openAndGenerate();
    const copyPending = deferred<void>();
    writeText.mockReturnValueOnce(copyPending.promise);
    await act(async () => buttons("Copy")[0]?.click());
    actor = { userId: "user-3", organizationId: "org-3" };
    await render();
    await act(async () => copyPending.resolve());
    expect(buttons("Use")).toHaveLength(0);
  });

  test("clears a candidate when adjusted password or passphrase controls change", async () => {
    await render();
    await openAndGenerate();
    expect(buttons("Use")).toHaveLength(1);
    const length = document.querySelector('input[type="number"]');
    if (!(length instanceof HTMLInputElement))
      throw new Error("Missing length");
    await setInputValue(length, "32");
    expect(buttons("Use")).toHaveLength(0);
    await act(async () => buttons("Generate").at(-1)?.click());
    await act(async () => buttons("Reveal")[0]?.click());
    expect(
      [...document.querySelectorAll("p")]
        .map((node) => node.textContent ?? "")
        .find((text) => /^[^•]{32}$/.test(text)),
    ).toBeDefined();
    await act(async () => buttons("Passphrase")[0]?.click());
    const words = document.querySelector('input[type="number"]');
    if (!(words instanceof HTMLInputElement)) throw new Error("Missing words");
    await setInputValue(words, "7");
    await act(async () => buttons("Generate").at(-1)?.click());
    expect(buttons("Use")).toHaveLength(1);
    await act(async () => buttons("Reveal")[0]?.click());
    expect(
      [...document.querySelectorAll("p")]
        .map((node) => node.textContent ?? "")
        .find((text) => text.split("-").length === 7),
    ).toBeDefined();
    const separator = document.querySelector("select");
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )?.set?.call(separator, ".");
      separator?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(buttons("Use")).toHaveLength(0);
  });

  test("wires category, ambiguity, capitalization, trailing digit, and separator options into the published engine", async () => {
    await render();
    await act(async () => buttons("Generate")[0]?.click());
    const length = document.querySelector('input[type="number"]');
    if (!(length instanceof HTMLInputElement))
      throw new Error("Missing length");
    await setInputValue(length, "1024");
    const categories = [...document.querySelectorAll('[role="checkbox"]')];
    await act(async () => {
      (categories[1] as HTMLButtonElement).click();
    });
    await act(async () => {
      (categories[2] as HTMLButtonElement).click();
    });
    await act(async () => {
      (categories[3] as HTMLButtonElement).click();
    });
    await act(async () => buttons("Generate").at(-1)?.click());
    await act(async () => buttons("Reveal")[0]?.click());
    const unambiguousCandidate = revealedCandidate();
    expect(unambiguousCandidate).toMatch(/^[a-z]{1024}$/);
    expect(unambiguousCandidate).not.toContain("l");

    const ambiguous = document.querySelector('[role="switch"]');
    if (!(ambiguous instanceof HTMLButtonElement))
      throw new Error("Missing ambiguity switch");
    await act(async () => ambiguous.click());
    await act(async () => buttons("Generate").at(-1)?.click());
    await act(async () => buttons("Reveal")[0]?.click());
    expect(revealedCandidate()).toContain("l");

    await act(async () => buttons("Passphrase")[0]?.click());
    const passphraseSwitches = [
      ...document.querySelectorAll('[role="switch"]'),
    ];
    await act(async () => {
      (passphraseSwitches[0] as HTMLButtonElement).click();
    });
    await act(async () => {
      (passphraseSwitches[1] as HTMLButtonElement).click();
    });
    const separator = document.querySelector("select");
    if (!(separator instanceof HTMLSelectElement))
      throw new Error("Missing separator");
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )?.set?.call(separator, ".");
      separator.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => buttons("Generate").at(-1)?.click());
    await act(async () => buttons("Reveal")[0]?.click());
    const phrase = revealedCandidate();
    expect(phrase).toMatch(
      /^[A-Z][a-z]+\.[A-Z][a-z]+\.[A-Z][a-z]+\.[A-Z][a-z]+\.[A-Z][a-z]+\.[A-Z][a-z]+\d$/,
    );
  });

  test("refuses unavailable Web Crypto without staging a candidate", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: undefined,
    });
    try {
      await render();
      await openAndGenerate();
      expect(buttons("Use")).toHaveLength(0);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
    }
  });
});
