import { useEffect, useMemo, useState } from 'react';
import { DeviceShell } from './components/DeviceShell';
import { Screen } from './components/Screen';
import { ScreenTitleBar } from './components/ScreenTitleBar';
import { ScreenList } from './components/ScreenList';
import { NowPlayingBar } from './components/NowPlayingBar';
import { ClickWheel } from './components/ClickWheel';
import { LoginScreen } from './components/LoginScreen';
import { usePlayerStore } from './store/usePlayerStore';

function App() {
  const {
    isAuthenticated,
    isAuthenticating,
    authError,
    login,
    restoreSession,
    rows,
    selectedIndex,
    viewMode,
    activePlaylist,
    activeContext,
    profile,
    playback,
    libraryMessage,
    playbackNotice,
    moveSelection,
    activateSelection,
    backToLibraryRoot,
    toggleViewMode,
    clearLibraryMessage,
    clearPlaybackNotice,
    logout,
    togglePlay,
    next,
    previous,
    toggleShuffle,
    cycleRepeat,
    setVolume,
  } = usePlayerStore();

  const [localPosition, setLocalPosition] = useState(0);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (!libraryMessage) return;
    const timeout = window.setTimeout(() => clearLibraryMessage(), 3500);
    return () => window.clearTimeout(timeout);
  }, [libraryMessage, clearLibraryMessage]);

  useEffect(() => {
    if (!playbackNotice) return;
    const timeout = window.setTimeout(() => clearPlaybackNotice(), 3500);
    return () => window.clearTimeout(timeout);
  }, [playbackNotice, clearPlaybackNotice]);

  // Interpolates position locally between polls so the progress bar moves smoothly.
  useEffect(() => {
    if (!playback) return;
    setLocalPosition(playback.position);
    if (playback.paused) return;

    const start = Date.now();
    const basePosition = playback.position;
    const interval = window.setInterval(() => {
      setLocalPosition(Math.min(basePosition + (Date.now() - start), playback.duration));
    }, 250);
    return () => window.clearInterval(interval);
  }, [playback?.position, playback?.paused, playback?.duration]);

  const positionLabel = useMemo(() => {
    const total = rows.length;
    const current = total === 0 ? 0 : selectedIndex + 1;
    return `${current.toString().padStart(3, '0')}/${total.toString().padStart(3, '0')}`;
  }, [rows.length, selectedIndex]);

  const isDrilledIn = !!activePlaylist || !!activeContext;
  const contextLabel = activePlaylist
    ? `(${activePlaylist.name})`
    : activeContext
      ? `(${activeContext.name})`
      : viewMode === 'recent'
        ? '(Recently Played)'
        : viewMode === 'playlists'
          ? '(Playlists)'
          : '(Devices)';
  const contextSubLabel = profile?.display_name ?? 'Library';

  const nowPlayingTrackName = playback?.track?.name ?? 'Nothing playing';
  const albumArtUrl = playback?.track?.album.images[0]?.url;
  const volumePercent = playback?.volumePercent ?? 0;
  const screenMessage = libraryMessage ?? playbackNotice;

  const handleWheelScroll = (delta: number) => moveSelection(delta);
  const handleWheelSelect = () => activateSelection();
  const handleWheelMenu = () => {
    if (isDrilledIn) {
      backToLibraryRoot();
    } else {
      toggleViewMode();
    }
  };
  const handleWheelMenuLongPress = () => {
    if (!isDrilledIn) logout();
  };

  const VOLUME_STEP = 5;
  const handleVolumeUp = () => setVolume(Math.min(100, volumePercent + VOLUME_STEP));
  const handleVolumeDown = () => setVolume(Math.max(0, volumePercent - VOLUME_STEP));

  return (
    <DeviceShell onVolumeUp={handleVolumeUp} onVolumeDown={handleVolumeDown}>
      <Screen>
        <ScreenTitleBar positionLabel={positionLabel} volumePercent={volumePercent} />
        {isAuthenticated ? (
          <>
            <ScreenList
              contextLabel={contextLabel}
              contextSubLabel={contextSubLabel}
              rows={rows}
              selectedIndex={selectedIndex}
              albumArtUrl={albumArtUrl}
              albumArtCaption={playback?.track?.name}
              message={screenMessage}
            />
            <NowPlayingBar
              trackName={nowPlayingTrackName}
              positionMs={localPosition}
              durationMs={playback?.duration ?? 0}
              deviceName={playback?.deviceName ?? null}
            />
          </>
        ) : (
          <LoginScreen onLogin={login} isAuthenticating={isAuthenticating} error={authError} />
        )}
      </Screen>

      <ClickWheel
        onScroll={handleWheelScroll}
        onSelect={handleWheelSelect}
        onMenu={handleWheelMenu}
        onMenuLongPress={handleWheelMenuLongPress}
        onNext={next}
        onPrevious={previous}
        onPlayPause={togglePlay}
        isPlaying={!!playback && !playback.paused}
        shuffleOn={playback?.shuffle ?? false}
        repeatOn={(playback?.repeat_mode ?? 0) !== 0}
        onShuffleToggle={toggleShuffle}
        onRepeatToggle={cycleRepeat}
      />
    </DeviceShell>
  );
}

export default App;
