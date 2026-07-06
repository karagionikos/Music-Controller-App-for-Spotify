import type { ReactNode } from 'react';
import './DeviceShell.css';

interface DeviceShellProps {
  children: ReactNode;
  onVolumeUp: () => void;
  onVolumeDown: () => void;
}

export function DeviceShell({ children, onVolumeUp, onVolumeDown }: DeviceShellProps) {
  return (
    <div className="device-shell">
      <div className="device-shell__drag-region" />

      <button className="device-shell__dot device-shell__dot--volume-up" onClick={onVolumeUp} aria-label="Volume up">
        +
      </button>
      <button
        className="device-shell__dot device-shell__dot--volume-down"
        onClick={onVolumeDown}
        aria-label="Volume down"
      >
        −
      </button>

      <button
        className="device-shell__dot device-shell__dot--close"
        onClick={() => window.retroPlayerBridge.closeWindow()}
        aria-label="Close"
      />
      <button
        className="device-shell__dot device-shell__dot--minimize"
        onClick={() => window.retroPlayerBridge.minimizeWindow()}
        aria-label="Minimize"
      />

      <div className="device-shell__body">{children}</div>
    </div>
  );
}
