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
import { useLang } from '../i18n/useLang.js';
import { useFavorites } from '../hooks/useFavorites.js';
import { useBlacklist } from '../hooks/useBlacklist.js';

export default function GameScreen() {
  const audioRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { t } = useLang();
  const { favoriteIds, toggle: toggleFavorite } = useFavorites();
  const { blacklistIds, toggleBlacklist, isAdmin } = useBlacklist();
  const [volume, setVolume] = useState(80);
  const [allSongs, setAllSongs] = useState([]);
  const [excludedGenres, setExcludedGenres] = useState(new Set());
  const [excludedDecades, setExcludedDecades] = useState(new Set());
  const [showFilter, setShowFilter] = useState(false);

  const {
    currentSong, isPlaying,
    loadPlaylist, nextSong, revealCover, revealField,
    coverRevealed, artistRevealed, titleRevealed, yearRevealed,
  } = useGameStore();

  const { playlists, game } = useSettingsStore();
  const isSpotify = currentSong?.source === 'spotify';

  // Multi-select playlist state
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState(new Set());

  // Auto-load first playlist on mount
  useEffect(() => {
    if (playlists.length && selectedPlaylistIds.size === 0) {
      handleTogglePlaylist(playlists[0].id);
    }
  }, [playlists]); // eslint-disable-line

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

  async function loadFromIds(ids) {
    if (ids.size === 0) {
      setAllSongs([]);
      loadPlaylist([], false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const results = await Promise.all([...ids].map(id => getPlaylistSongs(id)));
      // Deduplicate by song id
      const seen = new Set();
      const combined = results.flat().filter(s => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });
      if (!combined.length) { setError(t('no_songs_in_pl')); return; }
      setAllSongs(combined);
      applyFilters(combined, excludedGenres, excludedDecades, game.shuffle !== false);
    } catch (e) {
      setError(e.response?.data?.error || t('error_loading_pl'));
    } finally {
      setLoading(false);
    }
  }

  async function handleTogglePlaylist(id) {
    const next = new Set(selectedPlaylistIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedPlaylistIds(next);
    await loadFromIds(next);
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

  // Auto-reveal cover when both artist and title are revealed
  useEffect(() => {
    if (artistRevealed && titleRevealed && !coverRevealed) {
      revealCover();
    }
  }, [artistRevealed, titleRevealed]); // eslint-disable-line

  return (
    <>
    <div className="flex flex-col h-full">
      {/* Playlist selector + filter button — pinned, never scrolls */}
      <div className="shrink-0 pt-3 pb-1 flex items-center gap-2 pr-2">
        <div className="flex-1 overflow-hidden">
          <PlaylistSelector
            playlists={playlists}
            selectedIds={selectedPlaylistIds}
            onToggle={handleTogglePlaylist}
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
          {t('loading_songs')}
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
            <p className="mt-3">{t('select_pl_hint')}</p>
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

          {/* Album Art + Favorite button side by side */}
          <div className="px-4" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => toggleFavorite(currentSong)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                background: favoriteIds.has(currentSong.id) ? '#dc354522' : '#2d2d30',
                border: `1px solid ${favoriteIds.has(currentSong.id) ? '#dc3545' : '#3a3a3a'}`,
                borderRadius: 10, padding: '7px 10px', cursor: 'pointer', transition: 'all 0.15s',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 20 }}>{favoriteIds.has(currentSong.id) ? '💔' : '❤️'}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: favoriteIds.has(currentSong.id) ? '#ff6b6b' : '#888' }}>
                {favoriteIds.has(currentSong.id) ? t('remove_fav') : t('add_fav')}
              </span>
            </button>
            <AlbumArtCard
              coverUrl={currentSong.coverUrl}
              isRevealed={coverRevealed}
              onTap={revealCover}
            />
          </div>

          {/* Info fields */}
          <div className="flex flex-col gap-2 px-4">
            <RevealField
              label={t('song')}
              value={currentSong.title}
              isRevealed={titleRevealed}
              onReveal={() => revealField('title')}
            />
            <RevealField
              label={t('artist')}
              value={currentSong.artist}
              isRevealed={artistRevealed}
              onReveal={() => revealField('artist')}
            />
            <RevealField
              label={t('year')}
              value={currentSong.year}
              isRevealed={yearRevealed}
              onReveal={() => revealField('year')}
            />
          </div>

          {/* Blacklist button — admin only */}
          {isAdmin && (
            <div className="px-4">
              <button
                onClick={() => toggleBlacklist(currentSong.id)}
                style={{
                  width: '100%', padding: '6px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                  background: blacklistIds.has(currentSong.id) ? '#1a1a1a' : '#1e1e1e',
                  border: `1px solid ${blacklistIds.has(currentSong.id) ? '#dc3545' : '#3a3a3a'}`,
                  color: blacklistIds.has(currentSong.id) ? '#ff6b6b' : '#555',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {blacklistIds.has(currentSong.id) ? `✓ ${t('unblock_song')}` : `🚫 ${t('block_song')}`}
              </button>
            </div>
          )}

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
