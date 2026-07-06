export interface OAuthResult {
  code: string;
  state: string;
}

export interface RetroPlayerBridge {
  startOAuth: (authorizeUrl: string) => Promise<OAuthResult>;
  getRedirectUri: () => Promise<string>;
  minimizeWindow: () => void;
  closeWindow: () => void;
}

declare global {
  interface Window {
    retroPlayerBridge: RetroPlayerBridge;
  }
}
