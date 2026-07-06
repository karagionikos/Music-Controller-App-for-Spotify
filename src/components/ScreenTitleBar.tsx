import './ScreenTitleBar.css';

interface ScreenTitleBarProps {
  positionLabel: string; // e.g. "001/012"
  volumePercent: number; // 0-100
}

export function ScreenTitleBar({ positionLabel, volumePercent }: ScreenTitleBarProps) {
  return (
    <div className="title-bar">
      <svg className="title-bar__icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="4" width="20" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M2 8h20" stroke="currentColor" strokeWidth="1.6" />
        <path d="M6 20h4M9 18v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>

      <span className="title-bar__position">{positionLabel}</span>

      <div className="title-bar__volume">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 9v6h4l5 5V4L8 9H4z" fill="currentColor" />
          <path d="M16.5 8.5a5 5 0 010 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span>{volumePercent}</span>
      </div>
    </div>
  );
}
