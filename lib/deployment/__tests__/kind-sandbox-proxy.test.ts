import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("kind-sandbox proxy boundary", () => {
  it("stamps the lane, then returns the exact shell before capture or session work", () => {
    const source = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
    const proxyStart = source.indexOf("export async function proxy(");
    const proxyBody = source.slice(proxyStart);
    const stamp = proxyBody.indexOf("stampAdminLane(request);");
    const shellGuard = proxyBody.indexOf(
      'if (request.nextUrl.pathname === "/kind-sandbox")',
    );
    const shellReturn = proxyBody.indexOf(
      "return NextResponse.next({ request });",
      shellGuard,
    );
    const capture = proxyBody.indexOf("prepareAcquisitionCapture(request, event)");
    const sessionRoute = proxyBody.indexOf("routeRequest(request)");

    expect(proxyStart).toBeGreaterThanOrEqual(0);
    expect(stamp).toBeGreaterThanOrEqual(0);
    expect(shellGuard).toBeGreaterThan(stamp);
    expect(shellReturn).toBeGreaterThan(shellGuard);
    expect(capture).toBeGreaterThan(shellReturn);
    expect(sessionRoute).toBeGreaterThan(shellReturn);
  });
});
