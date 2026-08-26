import type { ErrorInfo, ReactNode } from "react";
import { captureReactRenderError } from "@/lib/diagnostics/captureReactError";
import { notifyChunkLoadError } from "@/components/errors/chunk-load-recovery";
import { MarkdownErrorBoundary } from "./MarkdownErrorBoundary";

jest.mock("@/lib/diagnostics/captureReactError", () => ({
  captureReactRenderError: jest.fn(),
}));

jest.mock("@/components/errors/chunk-load-recovery", () => {
  const actual = jest.requireActual(
    "@/components/errors/chunk-load-recovery",
  ) as object;
  return { ...actual, notifyChunkLoadError: jest.fn() };
});

const errorInfo = { componentStack: "\n    at Lazy" } as ErrorInfo;

function createBoundary(onError?: (error: Error, info: ErrorInfo) => void) {
  return new MarkdownErrorBoundary({
    children: null as ReactNode,
    fallback: null,
    onError,
  });
}

describe("MarkdownErrorBoundary chunk recovery", () => {
  beforeEach(() => jest.clearAllMocks());

  it("routes a nested chunk failure to canonical recovery without recording a render defect", () => {
    const error = new Error("Failed to load chunk /_next/static/chunks/a.js");
    error.name = "ChunkLoadError";

    createBoundary().componentDidCatch(error, errorInfo);

    expect(notifyChunkLoadError).toHaveBeenCalledWith(error);
    expect(captureReactRenderError).not.toHaveBeenCalled();
  });

  it("still captures genuine Markdown render failures and invokes the caller hook", () => {
    const onError = jest.fn();
    const error = new Error("renderer failed");

    createBoundary(onError).componentDidCatch(error, errorInfo);

    expect(captureReactRenderError).toHaveBeenCalledWith(error, {
      boundary: "MarkdownErrorBoundary",
      componentStack: errorInfo.componentStack,
    });
    expect(notifyChunkLoadError).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(error, errorInfo);
  });
});
