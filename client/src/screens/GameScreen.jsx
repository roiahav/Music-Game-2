import { useRef, useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { useSettingsStore } from '../store/settingsStore.js';
import { getPlaylistSongs, spotifyPlay, spotifyPause, spotifyResume, spotifySeek, spotifyVolume, getSpotifyPlayer } from '../api/client.js';
import AlbumArtCard from '../components/AlbumArtCard.jsx';
import RevealField from '../components/RevealField.jsx';
import AudioPlayer from '../components/AudioPlayer.jsx';
import PlayerControls from '../components/PlayerControls.jsx';
import PlaylistSelector from '../components/PlaylistSelector.jsx';
import TimerBar from '../components/TimerBar.jsx';
import FilterPanel from '../components/FilterPanel.jsx';

export default function GameScreen() {
  const audioRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [volume, setVolume] = useState(80);
  const [allSongs, setAllSongs] = useState([]);
  const [excludedGenres, setExcludedGenres] = useState(new Set());
  const [excludedDecades, setExcludedDecades] = useState(new Set());
  const [showFilter, setShowFilter] = useState(false);

  const {
    currentSong, selectedPlaylistId, isPlaying,
    loadPlaylist, nextSong, revealCover, revealField, setSelectedPlaylist,
    coverRevealed, artistRevealed, titleRevealed, yearRevealed,
  } = useGameStore();

  const { playlists, game } = useSettingsStore();
  const isSpotify = currentSong?.source === 'spotify';

  // Auto-load first playlist on mount
  useEffect(() => {
    if (playlists.length && !selectedPlaylistId) {
      handleSelectPlaylist(playlists[0].id);
    }
  }, [playlists]);

  // Sync volume to audio element
  useEffect(() => {
    audioRef.current?.setVolume(volume);
  }, [volume]);

  function applyFilters(songs, exGenres, exDecades, doShuffle) {
    let filtered = songs;
    if (exGenres.size > 0)
      filtered = filtered.filter(s => !exGenres.has(s.genre || ''));
    if (exDecades.size > 0)
      filtered = filtered.filter(s => {
        const d = s.year ? String(Math.floor(Number(s.year) / 10) * 10) : '';
        return !exDecades.has(d);
      });
    if (!filtered.length) filtered = songs; // fallback: never empty
    loadPlaylist(filtered, doShuffle);
  }

  async function handleSelectPlaylist(id) {
    setSelectedPlaylist(id);
    setLoading(true);
    setError('');
    try {
      const songs = await getPlaylistSongs(id);
      if (!songs.length) { setError('לא נמצאו שירים בפלייליסט'); return; }
      setAllSongs(songs);
      applyFilters(songs, excludedGenres, excludedDecades, game.shuffle !== false);
    } catch (e) {
      setError(e.response?.data?.error || 'שגיאה בטעינת הפלייליסט');
    } finally {
      setLoading(false);
    }
  }

  function handleToggleGenre(genre) {
    const next = new Set(excludedGenres);
    next.has(genre) ? next.delete(genre) : next.add(genre);
    setExcludedGenres(next);
    if (allSongs.length) applyFilters(allSongs, next, excludedDecades, game.shuffle !== false);
  }

  function handleToggleDecade(decade) {
    const next = new Set(excludedDecades);
    next.has(decade) ? next.delete(decade) : next.add(decade);
    setExcludedDecades(next);
    if (allSongs.length) applyFilters(allSongs, excludedGenres, next, game.shuffle !== false);
  }

  function handleClearFilters() {
    const emptyG = new Set();
    const emptyD = new Set();
    setExcludedGenres(emptyG);
    setExcludedDecades(emptyD);
    if (allSongs.length) applyFilters(allSongs, emptyG, emptyD, game.shuffle !== false);
  }

  async function handleNext() {
    nextSong();
    const nextSongData = useGameStore.getState().currentSong;
    if (nextSongData?.source === 'spotify') {
      try { await spotifyPlay([nextSongData.spotifyUri]); } catch {}
    }
  }

  async function handleSpotifyPlay() {
    if (!currentSong?.spotifyUri) return;
    try { await spotifyPlay([currentSong.spotifyUri]); } catch {}
  }

  async function handleSpotifyPause() {
    try { await spotifyPause(); } catch {}
  }

  async function handleSpotifyResume() {
    try { await spotifyResume(); } catch {}
  }

  async function handleSpotifySeek() {
    try {
      const state = await getSpotifyPlayer();
      const pos = (state?.progress_ms || 0) + 30000;
      await spotifySeek(pos);
    } catch {}
  }

  // When song changes for Spotify, start playing
  useEffect(() => {
    if (currentSong?.source === 'spotify') {
      handleSpotifyPlay();
    }
  }, [currentSong?.id]);

  return (
    <>
    <div className="flex flex-col h-full">
      {/* Playlist selector + filter button — pinned, never scrolls */}
      <div className="shrink-0 pt-3 pb-1 flex items-center gap-2 pr-2">
        <div className="flex-1 overflow-hidden">
          <PlaylistSelector
            playlists={playlists}
            selectedId={selectedPlaylistId}
            onSelect={handleSelectPlaylist}
            loading={loading}
          />
        </div>
        <button
          onClick={() => setShowFilter(true)}
          className="shrink-0 flex items-center justify-center rounded-full cursor-pointer active:scale-95 transition-all"
          style={{
            width: 36, height: 36,
            background: (excludedGenres.size + excludedDecades.size) > 0 ? '#007ACC' : '#2d2d30',
            border: '1px solid #3a3a3a',
            color: '#fff', fontSize: 16,
            position: 'relative',
          }}
          title="סינון"
        >
          🔍
          {(excludedGenres.size + excludedDecades.size) > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -4,
              background: '#dc3545', color: '#fff',
              borderRadius: '50%', width: 16, height: 16,
              fontSize: 10, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {excludedGenres.size + excludedDecades.size}
            </span>
          )}
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-3" style={{ paddingBottom: 120 }}>

      {loading && (
        <div className="text-center py-4 text-sm" style={{ color: '#888' }}>
          טוען שירים...
        </div>
      )}

      {error && (
        <div className="mx-4 px-4 py-3 rounded-xl text-sm text-center" style={{ background: '#3a1010', color: '#ff6b6b' }}>
          {error}
        </div>
      )}

      {!loading && !error && !currentSong && (
        <div className="flex-1 flex items-center justify-center text-center px-8" style={{ color: '#555' }}>
          <div>
            <div style={{ fontSize: 64 }}>🎵</div>
            <p className="mt-3">בחר פלייליסט למעלה כדי להתחיל</p>
          </div>
        </div>
      )}

      {currentSong && (
        <>
          {/* Timer */}
          <TimerBar
            seconds={game.timerSeconds || 0}
            songId={currentSong.id}
            onExpire={() => useGameStore.getState().revealAll()}
          />

          {/* Album Art */}
          <div className="px-4 flex justify-center">
            <AlbumArtCard
              coverUrl={currentSong.coverUrl}
              isRevealed={coverRevealed}
              onTap={revealCover}
            />
          </div>

          {/* Info fields */}
          <div className="flex flex-col gap-2 px-4">
            <RevealField
              label="שיר"
              value={currentSong.title}
              isRevealed={titleRevealed}
              onReveal={() => revealField('title')}
            />
            <RevealField
              label="זמר"
              value={currentSong.artist}
              isRevealed={artistRevealed}
              onReveal={() => revealField('artist')}
            />
            <RevealField
              label="שנה"
              value={currentSong.year}
              isRevealed={yearRevealed}
              onReveal={() => revealField('year')}
            />
          </div>

          {/* Controls */}
          <PlayerControls
            audioRef={audioRef}
            isSpotify={isSpotify}
            onNext={handleNext}
            onSpotifyPause={handleSpotifyPause}
            onSpotifyResume={handleSpotifyResume}
            onSpotifySeek={handleSpotifySeek}
          />

          {/* Volume (local only) */}
          {!isSpotify && (
            <div className="flex items-center gap-3 px-4">
              <span style={{ color: '#888', fontSize: 18 }}>🔉</span>
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={e => setVolume(Number(e.target.value))}
                className="flex-1"
                style={{ accentColor: '#007ACC' }}
              />
              <span className="text-sm w-8 text-left" style={{ color: '#888' }}>{volume}</span>
            </div>
          )}

          {/* Audio element (local mode) */}
          {!isSpotify && (
            <AudioPlayer ref={audioRef} src={currentSong.audioUrl} onEnded={handleNext} />
          )}
        </>
      )}
      </div>
    </div>

    {showFilter && (
      <FilterPanel
        songs={allSongs}
        excludedGenres={excludedGenres}
        excludedDecades={excludedDecades}
        onToggleGenre={handleToggleGenre}
        onToggleDecade={handleToggleDecade}
        onClear={handleClearFilters}
        onClose={() => setShowFilter(false)}
      />
    )}
    </>
  );
}
