import type { ReactNode } from 'react';
import './Screen.css';

interface ScreenProps {
  children: ReactNode;
}

export function Screen({ children }: ScreenProps) {
  return (
    <div className="screen">
      <div className="screen__glass">{children}</div>
      <div className="screen__gloss" />
    </div>
  );
}
