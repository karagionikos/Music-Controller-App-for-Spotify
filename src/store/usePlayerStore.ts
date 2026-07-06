import { create } from 'zustand';
import { getStoredTokens, isTokenValid, loginWithSpotify, clearStoredTokens } from '../spotify/auth';
import { SpotifyApi, SpotifyApiError, isNoActiveDeviceError } from '../spotify/api';
import type {
  SpotifyPlaylist,
  SpotifyTrack,
  SpotifyUserProfile,
  SpotifyPlayHistoryItem,
  SpotifyImage,
} from '../spotify/api';
import { remoteControl, repeatModeToState } from '../spotify/remote';
import type { PlaybackState, RemoteDevice } from '../spotify/remote';

// Create a Spotify app at https://developer.spotify.com/dashboard,
// redirect URI: http://127.0.0.1:17872/callback
export const SPOTIFY_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '';

export interface RecentContext {
  uri: string;
  type: 'playlist' | 'album';
  id: string;
  name: string;
  images: SpotifyImage[];
  lastPlayedAt: string;
}

export type ListRow =
  | { kind: 'context'; context: RecentContext }
  | { kind: 'playlist'; playlist: SpotifyPlaylist }
  | { kind: 'track'; track: SpotifyTrack; contextUri: string; index: number }
  | { kind: 'device'; device: RemoteDevice };

type ViewMode = 'recent' | 'playlists' | 'devices';

const RECENT_CONTEXTS_TARGET = 8;

interface PlayerStoreState {
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  authError: string | null;
  profile: SpotifyUserProfile | null;

  viewMode: ViewMode;
  playlists: SpotifyPlaylist[];
  recentContexts: RecentContext[];
  activePlaylist: SpotifyPlaylist | null;
  activeContext: RecentContext | null;
  rows: ListRow[];
  selectedIndex: number;
  isLoadingLibrary: boolean;
  libraryMessage: string | null;

  devices: RemoteDevice[];
  playback: PlaybackState | null;
  playbackNotice: string | null;

  login: () => Promise<void>;
  logout: () => void;
  restoreSession: () => Promise<void>;
  loadPlaylists: () => Promise<void>;
  loadRecentlyPlayed: () => Promise<void>;
  loadDevices: () => void;
  toggleViewMode: () => void;
  openPlaylist: (playlist: SpotifyPlaylist) => Promise<void>;
  openContext: (context: RecentContext) => Promise<void>;
  backToLibraryRoot: () => void;
  clearLibraryMessage: () => void;
  clearPlaybackNotice: () => void;
  moveSelection: (delta: number) => void;
  activateSelection: () => Promise<void>;
  selectDevice: (deviceId: string) => Promise<void>;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  toggleShuffle: () => Promise<void>;
  cycleRepeat: () => Promise<void>;
  setVolume: (v: number) => Promise<void>;
}

export const usePlayerStore = create<PlayerStoreState>((set, get) => ({
  isAuthenticated: false,
  isAuthenticating: false,
  authError: null,
  profile: null,

  viewMode: 'recent',
  playlists: [],
  recentContexts: [],
  activePlaylist: null,
  activeContext: null,
  rows: [],
  selectedIndex: 0,
  isLoadingLibrary: false,
  libraryMessage: null,

  devices: [],
  playback: null,
  playbackNotice: null,

  async login() {
    set({ isAuthenticating: true, authError: null });
    try {
      await loginWithSpotify(SPOTIFY_CLIENT_ID);
      set({ isAuthenticated: true, isAuthenticating: false });
      await get().loadRecentlyPlayed();
      startRemoteControl();
    } catch (err) {
      set({ isAuthenticating: false, authError: (err as Error).message });
    }
  },

  logout() {
    clearStoredTokens();
    remoteControl.stop();
    set({
      isAuthenticated: false,
      profile: null,
      viewMode: 'recent',
      playlists: [],
      recentContexts: [],
      activePlaylist: null,
      activeContext: null,
      rows: [],
      devices: [],
      playback: null,
      playbackNotice: null,
    });
  },

  async restoreSession() {
    const tokens = getStoredTokens();
    if (tokens && (isTokenValid(tokens) || tokens.refreshToken)) {
      set({ isAuthenticated: true });
      try {
        const profile = await SpotifyApi.getMe(SPOTIFY_CLIENT_ID);
        set({ profile });
        await get().loadRecentlyPlayed();
        startRemoteControl();
      } catch {
        get().logout();
      }
    }
  },

  async loadPlaylists() {
    set({ isLoadingLibrary: true, viewMode: 'playlists', activePlaylist: null, activeContext: null });
    try {
      const [profile, playlistsRes] = await Promise.all([
        SpotifyApi.getMe(SPOTIFY_CLIENT_ID),
        SpotifyApi.getMyPlaylists(SPOTIFY_CLIENT_ID),
      ]);
      set({
        profile,
        playlists: playlistsRes.items,
        rows: playlistsRes.items.map((p) => ({ kind: 'playlist' as const, playlist: p })),
        selectedIndex: 0,
        isLoadingLibrary: false,
      });
    } catch (err) {
      console.error('Failed to load playlists', err);
      set({ isLoadingLibrary: false });
    }
  },

  async loadRecentlyPlayed() {
    set({ isLoadingLibrary: true, viewMode: 'recent', activePlaylist: null, activeContext: null });
    try {
      const [profile, historyItems] = await Promise.all([
        SpotifyApi.getMe(SPOTIFY_CLIENT_ID),
        fetchRecentHistoryUntil(RECENT_CONTEXTS_TARGET),
      ]);

      const contexts = await resolveRecentContexts(historyItems, RECENT_CONTEXTS_TARGET);

      set({
        profile,
        recentContexts: contexts,
        rows: contexts.map((c) => ({ kind: 'context' as const, context: c })),
        selectedIndex: 0,
        isLoadingLibrary: false,
        libraryMessage: contexts.length === 0 ? 'No recently played playlists or albums yet.' : null,
      });
    } catch (err) {
      console.error('Failed to load recently played', err);
      set({ isLoadingLibrary: false, libraryMessage: "Couldn't load recently played." });
    }
  },

  async openContext(context) {
    set({ isLoadingLibrary: true, activeContext: context, activePlaylist: null, libraryMessage: null });
    try {
      let rows: ListRow[];

      if (context.type === 'playlist') {
        const res = await SpotifyApi.getPlaylistTracks(SPOTIFY_CLIENT_ID, context.id);
        const tracks = res.items.filter((i) => i.track).map((i) => i.track!) as SpotifyTrack[];
        rows = tracks.map((t, i) => ({ kind: 'track' as const, track: t, index: i, contextUri: context.uri }));
      } else {
        const res = await SpotifyApi.getAlbumTracks(SPOTIFY_CLIENT_ID, context.id);
        rows = res.items.map((t, i) => ({
          kind: 'track' as const,
          track: { ...t, album: { id: context.id, name: context.name, images: context.images } },
          index: i,
          contextUri: context.uri,
        }));
      }

      set({ rows, selectedIndex: 0, isLoadingLibrary: false });
    } catch (err) {
      console.error('Failed to load context tracks', err);

      const isForbidden = err instanceof SpotifyApiError && err.status === 403;
      const { recentContexts } = get();
      set({
        isLoadingLibrary: false,
        activeContext: null,
        rows: recentContexts.map((c) => ({ kind: 'context' as const, context: c })),
        libraryMessage: isForbidden
          ? `"${context.name}" can't be opened here.`
          : `Couldn't load "${context.name}".`,
      });
    }
  },

  loadDevices() {
    const { devices } = get();
    set({
      isLoadingLibrary: false,
      viewMode: 'devices',
      activePlaylist: null,
      activeContext: null,
      rows: devices.map((d) => ({ kind: 'device' as const, device: d })),
      selectedIndex: 0,
      libraryMessage: devices.length === 0 ? 'No Spotify devices found. Open Spotify somewhere first.' : null,
    });
  },

  toggleViewMode() {
    const { viewMode } = get();
    if (viewMode === 'recent') {
      get().loadPlaylists();
    } else if (viewMode === 'playlists') {
      get().loadDevices();
    } else {
      get().loadRecentlyPlayed();
    }
  },

  async openPlaylist(playlist) {
    set({ isLoadingLibrary: true, activePlaylist: playlist, libraryMessage: null });
    try {
      const res = await SpotifyApi.getPlaylistTracks(SPOTIFY_CLIENT_ID, playlist.id);
      const tracks = res.items.filter((i) => i.track).map((i) => i.track!) as SpotifyTrack[];
      const rows: ListRow[] = tracks.map((t, i) => ({ kind: 'track', track: t, index: i, contextUri: playlist.uri }));
      set({ rows, selectedIndex: 0, isLoadingLibrary: false });
    } catch (err) {
      console.error('Failed to load playlist tracks', err);

      // Spotify 403s some algorithmic/curated playlists even though they're visible in the library.
      const isForbidden = err instanceof SpotifyApiError && err.status === 403;
      const { playlists } = get();
      set({
        isLoadingLibrary: false,
        activePlaylist: null,
        rows: playlists.map((p) => ({ kind: 'playlist' as const, playlist: p })),
        libraryMessage: isForbidden
          ? `"${playlist.name}" can't be opened here.`
          : `Couldn't load "${playlist.name}".`,
      });
    }
  },

  backToLibraryRoot() {
    const { viewMode, playlists, recentContexts, devices } = get();
    if (viewMode === 'playlists') {
      set({
        activePlaylist: null,
        rows: playlists.map((p) => ({ kind: 'playlist' as const, playlist: p })),
        selectedIndex: 0,
        libraryMessage: null,
      });
    } else if (viewMode === 'devices') {
      set({
        rows: devices.map((d) => ({ kind: 'device' as const, device: d })),
        selectedIndex: 0,
        libraryMessage: null,
      });
    } else {
      set({
        activeContext: null,
        rows: recentContexts.map((c) => ({ kind: 'context' as const, context: c })),
        selectedIndex: 0,
        libraryMessage: null,
      });
    }
  },

  clearLibraryMessage() {
    set({ libraryMessage: null });
  },

  clearPlaybackNotice() {
    set({ playbackNotice: null });
  },

  moveSelection(delta) {
    const { rows, selectedIndex } = get();
    if (rows.length === 0) return;
    const next = Math.max(0, Math.min(rows.length - 1, selectedIndex + delta));
    set({ selectedIndex: next });
  },

  async activateSelection() {
    const { selectedIndex, rows } = get();
    const row = rows[selectedIndex];
    if (!row) return;

    if (row.kind === 'context') {
      await get().openContext(row.context);
      return;
    }

    if (row.kind === 'playlist') {
      await get().openPlaylist(row.playlist);
      return;
    }

    if (row.kind === 'device') {
      await get().selectDevice(row.device.id);
      return;
    }

    if (row.kind === 'track') {
      // Falls back to the sole visible device if nothing is currently active.
      const { devices, playback } = get();
      const targetDeviceId = playback?.deviceId ?? soleCandidateDevice(devices)?.id;

      if (!targetDeviceId) {
        set({
          playbackNotice: 'No Spotify device found. Open Spotify on your phone or computer, then try again.',
        });
        return;
      }

      try {
        await SpotifyApi.playContext(SPOTIFY_CLIENT_ID, row.contextUri, row.index, targetDeviceId);
        remoteControl.refreshSoon();
      } catch (err) {
        console.error('Failed to start playback', err);
        set({
          playbackNotice: isNoActiveDeviceError(err)
            ? 'No Spotify device found. Open Spotify on your phone or computer, then try again.'
            : "Couldn't start playback.",
        });
      }
    }
  },

  async selectDevice(deviceId) {
    try {
      await SpotifyApi.transferPlayback(SPOTIFY_CLIENT_ID, deviceId, true);
      remoteControl.refreshSoon();
    } catch (err) {
      console.error('Failed to switch device', err);
      set({ playbackNotice: "Couldn't switch to that device." });
    }
  },

  async togglePlay() {
    const { playback } = get();
    try {
      if (playback && !playback.paused) {
        await SpotifyApi.pause(SPOTIFY_CLIENT_ID);
      } else {
        await SpotifyApi.resume(SPOTIFY_CLIENT_ID);
      }
      remoteControl.refreshSoon();
    } catch (err) {
      handlePlaybackActionError(set, err);
    }
  },

  async next() {
    try {
      await SpotifyApi.skipNext(SPOTIFY_CLIENT_ID);
      remoteControl.refreshSoon();
    } catch (err) {
      handlePlaybackActionError(set, err);
    }
  },

  async previous() {
    try {
      await SpotifyApi.skipPrevious(SPOTIFY_CLIENT_ID);
      remoteControl.refreshSoon();
    } catch (err) {
      handlePlaybackActionError(set, err);
    }
  },

  async toggleShuffle() {
    const { playback } = get();
    try {
      await SpotifyApi.setShuffle(SPOTIFY_CLIENT_ID, !playback?.shuffle);
      remoteControl.refreshSoon();
    } catch (err) {
      handlePlaybackActionError(set, err);
    }
  },

  async cycleRepeat() {
    const { playback } = get();
    const nextMode = ((playback?.repeat_mode ?? 0) + 1) % 3;
    try {
      await SpotifyApi.setRepeat(SPOTIFY_CLIENT_ID, repeatModeToState(nextMode));
      remoteControl.refreshSoon();
    } catch (err) {
      handlePlaybackActionError(set, err);
    }
  },

  async setVolume(v) {
    try {
      await SpotifyApi.setVolume(SPOTIFY_CLIENT_ID, v);
      remoteControl.refreshSoon();
    } catch (err) {
      handlePlaybackActionError(set, err);
    }
  },
}));

function soleCandidateDevice(devices: RemoteDevice[]): RemoteDevice | undefined {
  return devices.length === 1 ? devices[0] : undefined;
}

function handlePlaybackActionError(set: (partial: Partial<PlayerStoreState>) => void, err: unknown) {
  console.error('Playback control failed', err);
  set({
    playbackNotice: isNoActiveDeviceError(err)
      ? 'No Spotify device found. Open Spotify on your phone or computer, then try again.'
      : "Couldn't reach Spotify.",
  });
}

// Spotify's history endpoint returns individual track plays, capped at 50/request;
// pages backward until enough distinct playlist/album contexts are found.
const MAX_HISTORY_PAGES = 4;

async function fetchRecentHistoryUntil(targetContexts: number): Promise<SpotifyPlayHistoryItem[]> {
  const allItems: SpotifyPlayHistoryItem[] = [];
  let before: number | undefined;

  for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
    const res = await SpotifyApi.getRecentlyPlayed(SPOTIFY_CLIENT_ID, 50, before);
    if (res.items.length === 0) break;

    allItems.push(...res.items);

    const uniqueContextCount = new Set(
      allItems
        .filter((i) => i.context && (i.context.type === 'playlist' || i.context.type === 'album'))
        .map((i) => i.context!.uri)
    ).size;
    if (uniqueContextCount >= targetContexts) break;

    const oldest = allItems[allItems.length - 1];
    const cursor = Date.parse(oldest.played_at);
    if (!cursor || cursor === before) break;
    before = cursor;
  }

  return allItems;
}

// Collapses the play-history stream into unique contexts (most recent play wins),
// then resolves each one's display name/images since history only returns a bare uri.
async function resolveRecentContexts(items: SpotifyPlayHistoryItem[], maxResults: number): Promise<RecentContext[]> {
  const latestByUri = new Map<string, { type: string; id: string; playedAt: string }>();

  for (const item of items) {
    const context = item.context;
    if (!context) continue;
    if (context.type !== 'playlist' && context.type !== 'album') continue;

    const id = context.uri.split(':').pop();
    if (!id) continue;

    const existing = latestByUri.get(context.uri);
    if (!existing || item.played_at > existing.playedAt) {
      latestByUri.set(context.uri, { type: context.type, id, playedAt: item.played_at });
    }
  }

  const ordered = [...latestByUri.entries()]
    .sort((a, b) => (a[1].playedAt < b[1].playedAt ? 1 : -1))
    .slice(0, maxResults);

  const resolved = await Promise.all(
    ordered.map(async ([uri, { type, id, playedAt }]): Promise<RecentContext | null> => {
      try {
        if (type === 'playlist') {
          const playlist = await SpotifyApi.getPlaylist(SPOTIFY_CLIENT_ID, id);
          return {
            uri,
            type: 'playlist' as const,
            id,
            name: playlist.name,
            images: playlist.images,
            lastPlayedAt: playedAt,
          };
        } else {
          const album = await SpotifyApi.getAlbum(SPOTIFY_CLIENT_ID, id);
          return {
            uri,
            type: 'album' as const,
            id,
            name: album.name,
            images: album.images,
            lastPlayedAt: playedAt,
          };
        }
      } catch (err) {
        console.error(`Failed to resolve recent context metadata for ${uri}`, err);
        return null;
      }
    })
  );

  return resolved.filter((c): c is RecentContext => c !== null);
}

let remoteControlWired = false;

function startRemoteControl() {
  if (!remoteControlWired) {
    remoteControlWired = true;
    remoteControl.onStateChanged((state) => {
      usePlayerStore.setState({ playback: state });
    });
    remoteControl.onDevicesChanged((devices) => {
      const { viewMode, activePlaylist, activeContext } = usePlayerStore.getState();
      if (viewMode === 'devices' && !activePlaylist && !activeContext) {
        usePlayerStore.setState({
          devices,
          rows: devices.map((d) => ({ kind: 'device' as const, device: d })),
        });
      } else {
        usePlayerStore.setState({ devices });
      }
    });
  }
  remoteControl.start(SPOTIFY_CLIENT_ID);
}
