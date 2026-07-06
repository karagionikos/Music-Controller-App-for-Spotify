import './NowPlayingBar.css';

interface NowPlayingBarProps {
  trackName: string;
  positionMs: number;
  durationMs: number;
  deviceName?: string | null; // real Spotify Connect device playing, null if none active
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function NowPlayingBar({ trackName, positionMs, durationMs, deviceName }: NowPlayingBarProps) {
  const progress = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

  return (
    <div className="now-playing">
      <div className="now-playing__row">
        <span className="now-playing__title">{trackName || '—'}</span>
        <span className="now-playing__time">{formatTime(positionMs)}</span>
      </div>
      <div className="now-playing__track">
        <div className="now-playing__fill" style={{ width: `${progress * 100}%` }} />
        <div className="now-playing__thumb" style={{ left: `${progress * 100}%` }} />
      </div>
      {deviceName && <div className="now-playing__device">Playing on {deviceName}</div>}
    </div>
  );
}
