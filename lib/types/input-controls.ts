/**
 * InputControlsSettings — neutral shared type.
 *
 * Originally defined in features/chat/components/response/chat-loading/ControlledLoadingIndicator.
 * Relocated here so lib/ code (chatSelectors) does not depend on features/chat/.
 */

export interface InputControlsSettings {
    searchEnabled: boolean;
    toolsEnabled: boolean;
    thinkEnabled: boolean;
    researchEnabled: boolean;
    recipesEnabled: boolean;
    planEnabled: boolean;
    audioEnabled: boolean;
    enableAskQuestions: boolean;
    enableBrokers: boolean;
    hasFiles: boolean;
    generateImages: boolean;
    generateVideos: boolean;
}
