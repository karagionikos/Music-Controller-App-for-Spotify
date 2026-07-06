// Spotify Authorization Code + PKCE flow — no client secret needed.
// https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow

const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

// `streaming` (Web Playback SDK) is deliberately excluded — this app never plays audio itself.
const SCOPES = [
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-top-read',
  'user-read-recently-played',
].join(' ');

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  scope: string;
}

const STORAGE_KEY = 'retro_music_player_spotify_tokens';

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const values = crypto.getRandomValues(new Uint8Array(length));
  for (let i = 0; i < length; i++) result += chars[values[i] % chars.length];
  return result;
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}

async function createCodeChallenge(verifier: string): Promise<string> {
  const hashed = await sha256(verifier);
  return base64UrlEncode(hashed);
}

export function getStoredTokens(): StoredTokens | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }
}

function storeTokens(tokens: StoredTokens) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export function clearStoredTokens() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isTokenValid(tokens: StoredTokens | null): boolean {
  if (!tokens) return false;
  return Date.now() < tokens.expiresAt - 30_000;
}

export async function loginWithSpotify(clientId: string): Promise<StoredTokens> {
  const redirectUri = await window.retroPlayerBridge.getRedirectUri();

  const verifier = generateRandomString(64);
  const challenge = await createCodeChallenge(verifier);
  const state = generateRandomString(16);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });

  const authorizeUrl = `${SPOTIFY_AUTHORIZE_URL}?${params.toString()}`;

  const { code, state: returnedState } = await window.retroPlayerBridge.startOAuth(authorizeUrl);

  if (returnedState !== state) {
    throw new Error('OAuth state mismatch — possible CSRF, aborting.');
  }

  const tokens = await exchangeCodeForTokens(clientId, code, redirectUri, verifier);
  storeTokens(tokens);
  return tokens;
}

async function exchangeCodeForTokens(
  clientId: string,
  code: string,
  redirectUri: string,
  verifier: string
): Promise<StoredTokens> {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  const data: TokenResponse = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? '',
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
}

export async function refreshAccessToken(clientId: string, refreshToken: string): Promise<StoredTokens> {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }

  const data: TokenResponse = await res.json();
  const tokens: StoredTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken, // Spotify may not rotate it
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
  storeTokens(tokens);
  return tokens;
}

export async function getValidAccessToken(clientId: string): Promise<string> {
  const tokens = getStoredTokens();
  if (!tokens) throw new Error('NOT_AUTHENTICATED');

  if (isTokenValid(tokens)) return tokens.accessToken;

  if (!tokens.refreshToken) {
    clearStoredTokens();
    throw new Error('NOT_AUTHENTICATED');
  }

  const refreshed = await refreshAccessToken(clientId, tokens.refreshToken);
  return refreshed.accessToken;
}
