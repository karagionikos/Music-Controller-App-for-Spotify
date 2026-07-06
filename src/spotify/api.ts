import { getValidAccessToken } from './auth';

const BASE_URL = 'https://api.spotify.com/v1';

export interface SpotifyImage {
  url: string;
  width: number | null;
  height: number | null;
}

export interface SpotifyArtist {
  id: string;
  name: string;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  images: SpotifyImage[];
}

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
}

export interface SpotifyPlaylistTrackItem {
  track: SpotifyTrack | null;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  uri: string;
  images: SpotifyImage[];
  tracks: { total: number };
}

export interface SpotifyUserProfile {
  id: string;
  display_name: string;
  images: SpotifyImage[];
  product: string; // 'premium' | 'free' | ...
}

export interface SpotifyPlayHistoryContext {
  type: string; // 'playlist' | 'album' | 'artist' | 'show'
  uri: string;
  href: string;
}

export interface SpotifyPlayHistoryItem {
  track: SpotifyTrack;
  played_at: string; // ISO timestamp
  context: SpotifyPlayHistoryContext | null;
}

export interface Paged<T> {
  items: T[];
  next: string | null;
  total: number;
}

export interface SpotifyDevice {
  id: string | null;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string; // 'Computer' | 'Smartphone' | 'Speaker' | ...
  volume_percent: number | null;
}

export interface SpotifyPlaybackStateResponse {
  device: SpotifyDevice;
  progress_ms: number | null;
  is_playing: boolean;
  shuffle_state: boolean;
  repeat_state: 'off' | 'track' | 'context';
  item: SpotifyTrack | null;
}

class SpotifyApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(clientId: string, path: string, init?: RequestInit): Promise<T> {
  const token = await getValidAccessToken(clientId);
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  // 204 = success, nothing to return (e.g. pause, or /me/player when nothing's active).
  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new SpotifyApiError(res.status, `Spotify API ${res.status}: ${text}`);
  }

  const contentType = res.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return res.json();
  }
  return undefined as T;
}

export const SpotifyApi = {
  getMe: (clientId: string) => apiFetch<SpotifyUserProfile>(clientId, '/me'),

  getMyPlaylists: (clientId: string, limit = 50) =>
    apiFetch<Paged<SpotifyPlaylist>>(clientId, `/me/playlists?limit=${limit}`),

  getPlaylistTracks: (clientId: string, playlistId: string, limit = 100) =>
    apiFetch<Paged<SpotifyPlaylistTrackItem>>(
      clientId,
      `/playlists/${playlistId}/tracks?limit=${limit}&fields=items(track(id,name,uri,duration_ms,artists(id,name),album(id,name,images))),next,total`
    ),

  getSavedTracks: (clientId: string, limit = 50) =>
    apiFetch<Paged<{ track: SpotifyTrack }>>(clientId, `/me/tracks?limit=${limit}`),

  // history items only carry a bare context uri/type — no name/images, hence getPlaylist/getAlbum lookups elsewhere.
  getRecentlyPlayed: (clientId: string, limit = 50, before?: number) =>
    apiFetch<{ items: SpotifyPlayHistoryItem[]; cursors: { before: string; after: string } | null }>(
      clientId,
      `/me/player/recently-played?limit=${limit}${before ? `&before=${before}` : ''}`
    ),

  getPlaylist: (clientId: string, playlistId: string) =>
    apiFetch<SpotifyPlaylist>(clientId, `/playlists/${playlistId}?fields=id,name,uri,images,tracks(total)`),

  getAlbum: (clientId: string, albumId: string) =>
    apiFetch<{ id: string; name: string; uri: string; images: SpotifyImage[]; total_tracks: number }>(
      clientId,
      `/albums/${albumId}`
    ),

  getAlbumTracks: (clientId: string, albumId: string, limit = 50) =>
    apiFetch<Paged<Omit<SpotifyTrack, 'album'>>>(clientId, `/albums/${albumId}/tracks?limit=${limit}`),

  search: (clientId: string, query: string, types: string[] = ['track']) =>
    apiFetch<{ tracks?: { items: SpotifyTrack[] } }>(
      clientId,
      `/search?q=${encodeURIComponent(query)}&type=${types.join(',')}&limit=20`
    ),

  getDevices: (clientId: string) => apiFetch<{ devices: SpotifyDevice[] }>(clientId, '/me/player/devices'),

  getPlaybackState: (clientId: string) =>
    apiFetch<SpotifyPlaybackStateResponse | undefined>(clientId, '/me/player'),

  transferPlayback: (clientId: string, deviceId: string, play = true) =>
    apiFetch<void>(clientId, '/me/player', {
      method: 'PUT',
      body: JSON.stringify({ device_ids: [deviceId], play }),
    }),

  playContext: (clientId: string, contextUri: string, offset?: number, deviceId?: string) =>
    apiFetch<void>(clientId, `/me/player/play${deviceId ? `?device_id=${deviceId}` : ''}`, {
      method: 'PUT',
      body: JSON.stringify({
        context_uri: contextUri,
        ...(offset !== undefined ? { offset: { position: offset } } : {}),
      }),
    }),

  playUris: (clientId: string, uris: string[], deviceId?: string) =>
    apiFetch<void>(clientId, `/me/player/play${deviceId ? `?device_id=${deviceId}` : ''}`, {
      method: 'PUT',
      body: JSON.stringify({ uris }),
    }),

  pause: (clientId: string) => apiFetch<void>(clientId, '/me/player/pause', { method: 'PUT' }),

  resume: (clientId: string) => apiFetch<void>(clientId, '/me/player/play', { method: 'PUT' }),

  skipNext: (clientId: string) => apiFetch<void>(clientId, '/me/player/next', { method: 'POST' }),

  skipPrevious: (clientId: string) => apiFetch<void>(clientId, '/me/player/previous', { method: 'POST' }),

  seek: (clientId: string, positionMs: number) =>
    apiFetch<void>(clientId, `/me/player/seek?position_ms=${Math.round(positionMs)}`, { method: 'PUT' }),

  setShuffle: (clientId: string, state: boolean) =>
    apiFetch<void>(clientId, `/me/player/shuffle?state=${state}`, { method: 'PUT' }),

  setRepeat: (clientId: string, state: 'off' | 'track' | 'context') =>
    apiFetch<void>(clientId, `/me/player/repeat?state=${state}`, { method: 'PUT' }),

  setVolume: (clientId: string, volumePercent: number) =>
    apiFetch<void>(clientId, `/me/player/volume?volume_percent=${Math.round(volumePercent)}`, { method: 'PUT' }),
};

// Spotify also returns 404 here when there's simply no active session anywhere, not just for a bad device id.
export function isNoActiveDeviceError(err: unknown): boolean {
  return err instanceof SpotifyApiError && err.status === 404;
}

export { SpotifyApiError };
