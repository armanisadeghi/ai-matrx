import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URLS, ENDPOINTS } from "@/lib/api/endpoints";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  BACKEND_URLS.production ||
  "https://server.app.matrxserver.com";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const rawLevel = (formData.get("level") as string) || "2";
    // Accept either field name; "maxSizeMB" is the new canonical form,
    // "targetSizeMB" stays accepted while older clients migrate.
    const rawMaxSize =
      (formData.get("maxSizeMB") as string | null) ??
      (formData.get("targetSizeMB") as string | null);

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "File must be a PDF" },
        { status: 400 },
      );
    }

    const backendFormData = new FormData();
    backendFormData.append("file", file);

    const params = new URLSearchParams({ level: rawLevel });
    if (rawMaxSize && Number(rawMaxSize) > 0) {
      params.set("max_size_mb", rawMaxSize);
    }

    const response = await fetch(
      `${BACKEND_URL}${ENDPOINTS.pdf.compress}?${params.toString()}`,
      {
        method: "POST",
        body: backendFormData,
        signal: AbortSignal.timeout(60_000),
      },
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ detail: "Compression failed" }));
      return NextResponse.json(
        { error: error.detail || "Compression failed" },
        { status: response.status },
      );
    }

    const compressedBuffer = await response.arrayBuffer();

    return new Response(compressedBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "X-Original-Size": response.headers.get("X-Original-Size") || "",
        "X-Compressed-Size": response.headers.get("X-Compressed-Size") || "",
        "X-Compression-Ratio":
          response.headers.get("X-Compression-Ratio") || "",
        "X-Compression-Level-Requested":
          response.headers.get("X-Compression-Level-Requested") || "",
        "X-Compression-Level-Used":
          response.headers.get("X-Compression-Level-Used") || "",
        "X-Compression-Cap-Satisfied":
          response.headers.get("X-Compression-Cap-Satisfied") || "",
      },
    });
  } catch (error: any) {
    console.error("PDF compression proxy error:", error);

    if (error?.name === "TimeoutError") {
      return NextResponse.json(
        { error: "Compression timed out" },
        { status: 504 },
      );
    }

    return NextResponse.json({ error: "Compression failed" }, { status: 500 });
  }
}
