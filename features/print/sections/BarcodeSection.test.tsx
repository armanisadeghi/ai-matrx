import { act, type ChangeEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BarcodeSection } from "./BarcodeSection";

type Deferred = {
    resolve: (svg: string) => void;
    reject: (error: Error) => void;
};

const mockRequests = new Map<string, Deferred[]>();
let mockInputOnChange: ((event: ChangeEvent<HTMLInputElement>) => void) | undefined;
const mockGenerateBarcodeSvg = jest.fn((value: string, symbology: string) => {
    const key = `${symbology}:${value}`;
    return new Promise<string>((resolve, reject) => {
        const requests = mockRequests.get(key) ?? [];
        requests.push({ resolve, reject });
        mockRequests.set(key, requests);
    });
});

jest.mock("@ai-matrx/print/barcode", () => ({
    DEFAULT_BARCODE_HEIGHT: { code128: 10, ean13: 10, upca: 10 },
    DEFAULT_BARCODE_SCALE: 2,
    generateBarcodeSvg: (value: string, symbology: string) => mockGenerateBarcodeSvg(value, symbology),
    normalizeBarcodeValue: (value: string) => value || null,
}));

jest.mock("@/components/official/ProInput", () => {
    const React = jest.requireActual<typeof import("react")>("react");
    return {
        ProInput: React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
            function MockProInput(props, ref) {
                mockInputOnChange = props.onChange;
                const { enableCleanup: _enableCleanup, enableVoice: _enableVoice, ...domProps } = props as React.InputHTMLAttributes<HTMLInputElement> & {
                    enableCleanup?: boolean;
                    enableVoice?: boolean;
                };
                return React.createElement("input", { ...domProps, ref });
            },
        ),
    };
});

jest.mock("@/features/context-menu-v3/EditableContextMenu", () => ({
    EditableContextMenu: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
    NonEditableContextMenu: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
    SurfaceRuntimeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

describe("BarcodeSection async preview identity", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        mockRequests.clear();
        mockGenerateBarcodeSvg.mockClear();
        mockInputOnChange = undefined;
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    function request(key: string, index = 0): Deferred {
        const pending = mockRequests.get(key)?.[index];
        if (!pending) throw new Error(`Missing pending barcode request: ${key}[${index}]`);
        return pending;
    }

    function changeValue(value: string): void {
        if (!mockInputOnChange) throw new Error("Barcode value callback was not registered.");
        act(() => {
            mockInputOnChange?.({ target: { value } } as ChangeEvent<HTMLInputElement>);
        });
    }

    it("does not expose a previous SVG or ready state while a new identity renders", async () => {
        await act(async () => root.render(<BarcodeSection />));
        const first = request("code128:MATRX-SN-88213");

        await act(async () => {
            first.resolve("<svg>old-result</svg>");
            await Promise.resolve();
        });
        expect(container.querySelector("img")).not.toBeNull();

        changeValue("NEW-VALUE");
        const second = request("code128:NEW-VALUE");
        expect(container.querySelector("[data-preview-status]")?.getAttribute("data-preview-status")).toBe("rendering");
        expect(container.querySelector("img")).toBeNull();

        await act(async () => {
            second.resolve("<svg>new-result</svg>");
            await Promise.resolve();
        });

        expect(container.querySelector("[data-preview-status]")?.getAttribute("data-preview-status")).toBe("ready");
        expect(container.querySelector("img")?.getAttribute("alt")).toBe("Preview SVG");
    });

    it("ignores a stale error and exposes only the matching failure", async () => {
        await act(async () => root.render(<BarcodeSection />));
        const first = request("code128:MATRX-SN-88213");

        changeValue("NEW-VALUE");
        const second = request("code128:NEW-VALUE");

        await act(async () => {
            first.reject(new Error("stale generation failed"));
            await Promise.resolve();
        });
        expect(container.querySelector("[data-preview-status]")?.getAttribute("data-preview-status")).toBe("rendering");
        expect(container.textContent).not.toContain("stale generation failed");

        await act(async () => {
            second.reject(new Error("current generation failed"));
            await Promise.resolve();
        });
        expect(container.querySelector("[data-preview-status]")?.getAttribute("data-preview-status")).toBe("failed");
        expect(container.textContent).toContain("current generation failed");
    });
});
