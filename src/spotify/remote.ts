import { SpotifyApi } from './api';

export interface PlaybackTrack {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
}

export interface PlaybackState {
  paused: boolean;
  position: number;
  duration: number;
  track: PlaybackTrack | null;
  shuffle: boolean;
  repeat_mode: number; // 0 off, 1 context, 2 track
  deviceId: string | null;
  deviceName: string | null;
  volumePercent: number | null;
}

export interface RemoteDevice {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  volumePercent: number | null;
}

type StateListener = (state: PlaybackState | null) => void;
type DevicesListener = (devices: RemoteDevice[]) => void;

// Poll faster right after a local action, slower once idle, slower still in background.
const POLL_RATE_ACTIVE_MS = 800;
const POLL_RATE_IDLE_MS = 3000;
const POLL_RATE_BACKGROUND_MS = 8000;
const ACTIVE_BURST_MS = 4000;

const REPEAT_STATE_TO_MODE: Record<'off' | 'track' | 'context', number> = { off: 0, context: 1, track: 2 };
const REPEAT_MODE_TO_STATE: Record<number, 'off' | 'track' | 'context'> = { 0: 'off', 1: 'context', 2: 'track' };

export class RemoteControl {
  private clientId = '';
  private pollTimer: number | null = null;
  private stateListeners = new Set<StateListener>();
  private devicesListeners = new Set<DevicesListener>();
  private lastState: PlaybackState | null = null;
  private lastDevicesKey = '';
  private inFlight = false;
  private activeUntil = 0;
  private visibilityHandler: (() => void) | null = null;
  private started = false;

  start(clientId: string) {
    this.clientId = clientId;
    if (this.started) return;
    this.started = true;

    this.visibilityHandler = () => this.reschedule();
    document.addEventListener('visibilitychange', this.visibilityHandler);

    void this.poll();
  }

  stop() {
    this.started = false;
    if (this.pollTimer !== null) {
      window.clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.lastState = null;
    this.lastDevicesKey = '';
    this.activeUntil = 0;
  }

  /** Forces an immediate re-fetch, e.g. right after issuing a control action. */
  async refreshSoon() {
    this.activeUntil = Date.now() + ACTIVE_BURST_MS;

    if (this.pollTimer !== null) {
      window.clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    // Delay lets Spotify's own state catch up to the action that triggered it.
    this.pollTimer = window.setTimeout(() => void this.poll(), 350);
  }

  onStateChanged(fn: StateListener) {
    this.stateListeners.add(fn);
    fn(this.lastState);
    return () => this.stateListeners.delete(fn);
  }

  onDevicesChanged(fn: DevicesListener) {
    this.devicesListeners.add(fn);
    return () => this.devicesListeners.delete(fn);
  }

  private currentPollDelay(): number {
    if (document.hidden) return POLL_RATE_BACKGROUND_MS;
    if (Date.now() < this.activeUntil) return POLL_RATE_ACTIVE_MS;
    return POLL_RATE_IDLE_MS;
  }

  private reschedule() {
    if (this.pollTimer !== null) {
      window.clearTimeout(this.pollTimer);
    }
    this.pollTimer = window.setTimeout(() => void this.poll(), this.currentPollDelay());
  }

  private async poll() {
    if (this.inFlight) {
      if (this.started) this.reschedule();
      return;
    }
    this.inFlight = true;
    try {
      const [state, devicesRes] = await Promise.all([
        SpotifyApi.getPlaybackState(this.clientId),
        SpotifyApi.getDevices(this.clientId).catch(() => ({ devices: [] })),
      ]);

      const mapped = mapPlaybackState(state);
      this.lastState = mapped;
      this.stateListeners.forEach((fn) => fn(mapped));

      const devices: RemoteDevice[] = devicesRes.devices.flatMap((d) =>
        d.id ? [{ id: d.id, name: d.name, type: d.type, isActive: d.is_active, volumePercent: d.volume_percent }] : []
      );
      const devicesKey = JSON.stringify(devices);
      if (devicesKey !== this.lastDevicesKey) {
        this.lastDevicesKey = devicesKey;
        this.devicesListeners.forEach((fn) => fn(devices));
      }
    } catch (err) {
      console.error('Failed to poll playback state', err);
    } finally {
      this.inFlight = false;
      // Guards against stop() having fired while this request was in flight.
      if (this.started) this.reschedule();
    }
  }
}

function mapPlaybackState(state: Awaited<ReturnType<typeof SpotifyApi.getPlaybackState>>): PlaybackState | null {
  if (!state) return null;
  const track = state.item;
  return {
    paused: !state.is_playing,
    position: state.progress_ms ?? 0,
    duration: track?.duration_ms ?? 0,
    shuffle: state.shuffle_state,
    repeat_mode: REPEAT_STATE_TO_MODE[state.repeat_state],
    deviceId: state.device.id,
    deviceName: state.device.name,
    volumePercent: state.device.volume_percent,
    track: track
      ? {
          id: track.id,
          uri: track.uri,
          name: track.name,
          duration_ms: track.duration_ms,
          artists: track.artists.map((a) => ({ name: a.name })),
          album: { name: track.album.name, images: track.album.images },
        }
      : null,
  };
}

export function repeatModeToState(mode: number): 'off' | 'track' | 'context' {
  return REPEAT_MODE_TO_STATE[mode] ?? 'off';
}

export const remoteControl = new RemoteControl();
