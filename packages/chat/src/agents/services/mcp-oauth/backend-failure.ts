/** Classify a failed aidream response without confusing edge HTML with API JSON. */
export interface McpBackendFailure {
  userMessage: string;
  diagnostic: string;
}

const TRANSIENT_GATEWAY_STATUSES = new Set([502, 503, 504]);

/** Retry the token-persistence handoff across a brief backend deploy/restart window. */
export async function persistMcpOAuthTokens(
  input: string,
  init: RequestInit,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const maxAttempts = 3;
  let response: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      response = await fetcher(input, init);
      if (!TRANSIENT_GATEWAY_STATUSES.has(response.status)) return response;
    } catch (error) {
      if (attempt === maxAttempts) throw error;
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }

  return response as Response;
}

interface ApiErrorBody {
  detail?: string | { message?: string };
  error?: string;
  message?: string;
  request_id?: string;
  user_message?: string;
}

function jsonMessage(body: ApiErrorBody): string | null {
  if (body.user_message) return body.user_message;
  if (body.message) return body.message;
  if (typeof body.detail === "string") return body.detail;
  if (body.detail?.message) return body.detail.message;
  if (body.error) return body.error;
  return null;
}

/**
 * Preserve the service/edge distinction at the Next.js -> aidream boundary.
 * Cloudflare challenge pages are HTML and mean FastAPI/vault never executed.
 */
export async function classifyMcpBackendFailure(
  response: Response,
): Promise<McpBackendFailure> {
  const contentType = response.headers.get("content-type") ?? "";
  const cfRay = response.headers.get("cf-ray");
  const requestId = response.headers.get("x-request-id");
  const body = (await response.text().catch(() => "")).slice(0, 2_000);
  const isHtml =
    contentType.includes("text/html") || /^\s*<!doctype html/i.test(body);
  const isCloudflareChallenge =
    response.status === 403 &&
    isHtml &&
    (cfRay !== null || /cloudflare|just a moment/i.test(body));

  if (isCloudflareChallenge) {
    const raySuffix = cfRay ? `; Cloudflare ray ${cfRay}` : "";
    return {
      userMessage:
        `AI Matrx could not save the connection because its server request was ` +
        `blocked at the Cloudflare edge (${response.status}${raySuffix}). ` +
        `The credential vault did not run.`,
      diagnostic: `cloudflare_edge_challenge status=${response.status} cf_ray=${cfRay ?? "none"}`,
    };
  }

  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(body) as ApiErrorBody;
      const message = jsonMessage(parsed);
      const responseRequestId = parsed.request_id ?? requestId;
      const requestSuffix = responseRequestId
        ? `; request ${responseRequestId}`
        : "";
      return {
        userMessage: message
          ? `AI Matrx could not save the connection: ${message}`
          : `AI Matrx could not save the connection (${response.status}${requestSuffix}).`,
        diagnostic: `aidream_error status=${response.status} request_id=${responseRequestId ?? "none"} body=${body}`,
      };
    } catch {
      // Malformed JSON is classified below with its content type and body.
    }
  }

  return {
    userMessage: `AI Matrx could not save the connection (server response ${response.status}).`,
    diagnostic:
      `unclassified_backend_response status=${response.status} ` +
      `content_type=${contentType || "none"} request_id=${requestId ?? "none"} body=${body}`,
  };
}
