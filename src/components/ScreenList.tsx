import { useEffect, useRef } from 'react';
import type { ListRow } from '../store/usePlayerStore';
import './ScreenList.css';

interface ScreenListProps {
  contextLabel: string; // e.g. "(Recently Played)" or "(My Playlist Name)"
  contextSubLabel: string; // e.g. the signed-in user's display name, or a playlist owner
  rows: ListRow[];
  selectedIndex: number;
  albumArtUrl?: string;
  albumArtCaption?: string;
  message?: string | null;
}

function rowLabel(row: ListRow, index: number): string {
  if (row.kind === 'context') return `${index + 1}. ${row.context.name}`;
  if (row.kind === 'playlist') return `${index + 1}. ${row.playlist.name}`;
  if (row.kind === 'device') return `${row.device.isActive ? '\u266A ' : ''}${row.device.name} (${row.device.type})`;
  return `${index + 1}. ${row.track.name}`;
}

export function ScreenList({
  contextLabel,
  contextSubLabel,
  rows,
  selectedIndex,
  albumArtUrl,
  albumArtCaption,
  message,
}: ScreenListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Sliding window keeps the selection visible, iPod-list style.
  const WINDOW_SIZE = 8;
  const windowStart = Math.max(
    0,
    Math.min(selectedIndex - Math.floor(WINDOW_SIZE / 2), Math.max(0, rows.length - WINDOW_SIZE))
  );
  const visibleRows = rows.slice(windowStart, windowStart + WINDOW_SIZE);

  return (
    <div className="screen-list">
      <div className="screen-list__left">
        <div className="screen-list__context">
          <div className="screen-list__context-title">{contextLabel}</div>
          <div className="screen-list__context-sub">{contextSubLabel}</div>
        </div>

        <div className="screen-list__rows" ref={listRef}>
          {message && <div className="screen-list__notice">{message}</div>}
          {rows.length === 0 && <div className="screen-list__empty">No items</div>}
          {visibleRows.map((row, localIndex) => {
            const absoluteIndex = windowStart + localIndex;
            return (
              <div
                key={absoluteIndex}
                ref={absoluteIndex === selectedIndex ? selectedRef : undefined}
                className={`screen-list__row ${absoluteIndex === selectedIndex ? 'is-selected' : ''}`}
              >
                {rowLabel(row, absoluteIndex)}
              </div>
            );
          })}
        </div>
      </div>

      {albumArtUrl && (
        <div className="screen-list__art">
          <img src={albumArtUrl} alt={albumArtCaption ?? 'Album art'} />
        </div>
      )}
    </div>
  );
}
