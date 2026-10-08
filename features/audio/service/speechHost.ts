/**
 * The website's ports into THE one speech engine (`@ai-matrx/media/speech`).
 *
 * The engine — queue, lock, Cartesia lane, sink-aware player, iOS unlock — lives in the package;
 * this file only says where the website gets each answer: the brokered Cartesia token, the tiered
 * listening settings, Custom Dictionary pronunciations, the provider-failure report + toast, the
 * organization start gate, the lazy audio-system mount, the server catalog engine and its saved
 * voice preference. Every port loads its module on first use so the app shell stays light.
 * Installed once from `AppProviders` (module scope, before any speak).
 */

import { organizationRefusalMessage } from "@ai-matrx/chat/host/org";
import { configureSpeech, type PlaybackRequest } from "@ai-matrx/media/speech";
import { engineAcceptsVoice } from "@/features/audio/service/engines";
import { isOrganizationRequiredError } from "@/lib/organizations/organizationRequiredError";
import { selectTextToSpeechPreferences } from "@/lib/redux/preferences/userPreferenceSelectors";
import { getStoreSingleton } from "@/lib/redux/store-singleton";

let installed = false;

export function installSpeechHost(): void {
  if (installed) return;
  installed = true;
  configureSpeech({
    getCartesiaToken: async (opts) =>
      (await import("@/lib/cartesia/accessToken")).getCartesiaAccessToken(opts),
    invalidateCartesiaToken: (token) => {
      void import("@/lib/cartesia/accessToken").then((m) => m.invalidateCartesiaAccessToken(token));
    },
    resolveVoiceSettings: async () =>
      (await import("@/features/audio/service/listeningConfig")).resolveListeningSettings(),
    resolvePronunciations: async (item) => {
      // Dictionary follows the ONE global active context by default; a caller may scope it to a
      // surface's selection with `dictionarySurfaceKey`.
      if (item.dictionarySurfaceKey) {
        const { resolveDictionaryTtsAliases } = await import("@/features/dictionary/ttsBridge");
        return resolveDictionaryTtsAliases(item.dictionarySurfaceKey);
      }
      const { resolveActiveContextTtsAliases } = await import("@/features/dictionary/activeContextBridge");
      return resolveActiveContextTtsAliases();
    },
    reportProviderFailure: async (failure) =>
      (await import("@/lib/api/provider-session-failure")).reportBrowserProviderFailureFromStore(failure),
    notifyError: (title, description) => {
      void import("@/lib/toast").then(({ toast }) => toast.error(title, { description }));
    },
    // HELD AND SET (lib/organization/organization-gate.ts): speaking mints a provider credential
    // and reads the organization's listening knobs, so it happens IN an organization.
    beforeStart: async () => {
      const { ensureOrgId } = await import("@/lib/organizations/ensureOrgId");
      await ensureOrgId(null);
    },
    // Declining the picker is an answer, not a failure: the item says why, nothing raw.
    describeStartRefusal: (err) =>
      isOrganizationRequiredError(err)
        ? organizationRefusalMessage({ act: "played", subject: "This item" })
        : null,
    onEngage: () => {
      void import("@/features/audio/activation").then((m) => m.activateAudio());
    },
    adapters: {
      catalog: async () => (await import("@/features/audio/playback/adapters/catalogAdapter")).catalogAdapter,
    },
    completeRequest: (request: PlaybackRequest) => completeCatalogVoice(request),
  });
}

/**
 * The catalog engine keeps its own Text-to-speech preference (a named voice) — never crossed
 * with Cartesia voice ids. An unknown voice is dropped so the backend's current default wins.
 */
function completeCatalogVoice(request: PlaybackRequest): PlaybackRequest {
  if (request.provider !== "catalog" || request.catalog?.sample) return request;
  const state = getStoreSingleton()?.getState() as Parameters<typeof selectTextToSpeechPreferences>[0] | undefined;
  const saved = state?.userPreferences ? selectTextToSpeechPreferences(state)?.preferredVoice : undefined;
  const voice = request.catalog?.voice ?? saved;
  return {
    ...request,
    catalog: {
      ...request.catalog,
      voice: voice && engineAcceptsVoice("catalog", voice) ? voice.toLowerCase() : undefined,
    },
  };
}
