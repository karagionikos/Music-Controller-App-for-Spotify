import './LoginScreen.css';

interface LoginScreenProps {
  onLogin: () => void;
  isAuthenticating: boolean;
  error: string | null;
}

export function LoginScreen({ onLogin, isAuthenticating, error }: LoginScreenProps) {
  return (
    <div className="login-screen">
      <div className="login-screen__mark">Retro Music Player</div>
      {/* Free accounts work too, though Spotify's own Free-tier restrictions still apply */}
      <p className="login-screen__hint">Connect your Spotify account to load your library and start playback.</p>
      <button className="login-screen__btn" onClick={onLogin} disabled={isAuthenticating}>
        {isAuthenticating ? 'Waiting for browser…' : 'Connect Spotify'}
      </button>
      {error && <p className="login-screen__error">{error}</p>}
    </div>
  );
}
