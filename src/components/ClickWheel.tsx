import { useCallback, useRef, useState } from 'react';
import './ClickWheel.css';

interface ClickWheelProps {
  onScroll: (delta: number) => void; // positive = forward/down, negative = back/up
  onSelect: () => void;
  onMenu: () => void;
  onMenuLongPress?: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onPlayPause: () => void;
  isPlaying: boolean;
  shuffleOn: boolean;
  repeatOn: boolean;
  onShuffleToggle: () => void;
  onRepeatToggle: () => void;
}

function angleFromCenter(x: number, y: number): number {
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function normalizeAngleDelta(delta: number): number {
  // wrap into [-180, 180] so crossing the 0/360 boundary doesn't jump
  if (delta > 180) return delta - 360;
  if (delta < -180) return delta + 360;
  return delta;
}

export function ClickWheel({
  onScroll,
  onSelect,
  onMenu,
  onMenuLongPress,
  onNext,
  onPrevious,
  onPlayPause,
  isPlaying,
  shuffleOn,
  repeatOn,
  onShuffleToggle,
  onRepeatToggle,
}: ClickWheelProps) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const lastAngleRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const menuLongPressTimerRef = useRef<number | null>(null);
  const menuLongPressFiredRef = useRef(false);
  const [isMenuLongPressing, setIsMenuLongPressing] = useState(false);
  const LONG_PRESS_MS = 700;

  const handleMenuPointerDown = useCallback(() => {
    menuLongPressFiredRef.current = false;
    if (!onMenuLongPress) return;
    setIsMenuLongPressing(true);
    menuLongPressTimerRef.current = window.setTimeout(() => {
      menuLongPressFiredRef.current = true;
      setIsMenuLongPressing(false);
      onMenuLongPress();
    }, LONG_PRESS_MS);
  }, [onMenuLongPress]);

  const handleMenuPointerUp = useCallback(() => {
    setIsMenuLongPressing(false);
    if (menuLongPressTimerRef.current !== null) {
      window.clearTimeout(menuLongPressTimerRef.current);
      menuLongPressTimerRef.current = null;
    }
  }, []);

  const handleMenuClick = useCallback(() => {
    if (menuLongPressFiredRef.current) {
      menuLongPressFiredRef.current = false;
      return;
    }
    onMenu();
  }, [onMenu]);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const wheel = wheelRef.current;
      if (!wheel) return;
      const rect = wheel.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = angleFromCenter(e.clientX - cx, e.clientY - cy);

      if (lastAngleRef.current !== null) {
        const delta = normalizeAngleDelta(angle - lastAngleRef.current);
        accumulatedRef.current += delta;

        // fires a scroll step every ~18 degrees, like a physical click-wheel's detents
        const STEP_DEGREES = 18;
        while (accumulatedRef.current >= STEP_DEGREES) {
          onScroll(1);
          accumulatedRef.current -= STEP_DEGREES;
        }
        while (accumulatedRef.current <= -STEP_DEGREES) {
          onScroll(-1);
          accumulatedRef.current += STEP_DEGREES;
        }
      }
      lastAngleRef.current = angle;
    },
    [onScroll]
  );

  const handlePointerUp = useCallback(() => {
    lastAngleRef.current = null;
    accumulatedRef.current = 0;
    setIsDragging(false);
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  }, [handlePointerMove]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.click-wheel__btn') || target.closest('.click-wheel__center')) return;

      setIsDragging(true);
      lastAngleRef.current = null;
      accumulatedRef.current = 0;
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [handlePointerMove, handlePointerUp]
  );

  return (
    <div className="click-wheel-cluster">
      <button
        className={`click-wheel-cluster__satellite ${shuffleOn ? 'is-active' : ''}`}
        onClick={onShuffleToggle}
        aria-label="Shuffle"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6h3.5l9 12H20M4 18h3.5l1.6-2.1M14.9 8.1L16.5 6H20" />
          <path d="M17.5 4L20 6l-2.5 2M17.5 20l2.5-2-2.5-2" />
        </svg>
      </button>

      <div className={`click-wheel ${isDragging ? 'is-dragging' : ''}`} ref={wheelRef} onPointerDown={handlePointerDown}>
        <button
          className={`click-wheel__btn click-wheel__btn--menu ${isMenuLongPressing ? 'is-longpressing' : ''}`}
          onClick={handleMenuClick}
          onPointerDown={handleMenuPointerDown}
          onPointerUp={handleMenuPointerUp}
          onPointerLeave={handleMenuPointerUp}
          aria-label="Menu"
        >
          MENU
        </button>
        <button className="click-wheel__btn click-wheel__btn--prev" onClick={onPrevious} aria-label="Previous">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zM9 12l9-6v12z" /></svg>
        </button>
        <button className="click-wheel__btn click-wheel__btn--next" onClick={onNext} aria-label="Next">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM6 6l9 6-9 6z" /></svg>
        </button>
        <button className="click-wheel__btn click-wheel__btn--play" onClick={onPlayPause} aria-label="Play/Pause">
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z" /></svg>
          )}
        </button>

        <button className="click-wheel__center" onClick={onSelect} aria-label="Select" />
      </div>

      <button
        className={`click-wheel-cluster__satellite ${repeatOn ? 'is-active' : ''}`}
        onClick={onRepeatToggle}
        aria-label="Repeat"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 2l4 4-4 4" />
          <path d="M3 11V9a4 4 0 014-4h14" />
          <path d="M7 22l-4-4 4-4" />
          <path d="M21 13v2a4 4 0 01-4 4H3" />
        </svg>
      </button>
    </div>
  );
}
