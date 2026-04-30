import { create } from 'zustand';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const useGameStore = create((set, get) => ({
  playlist: [],
  currentIndex: -1,
  currentSong: null,
  isPlaying: false,
  coverRevealed: false,
  artistRevealed: false,
  titleRevealed: false,
  yearRevealed: false,
  selectedPlaylistId: null,

  loadPlaylist(songs, doShuffle = true) {
    const ordered = doShuffle ? shuffle(songs) : songs;
    set({ playlist: ordered, currentIndex: 0, currentSong: ordered[0] || null, isPlaying: false });
    get().resetReveals();
  },

  nextSong() {
    const { playlist, currentIndex } = get();
    if (!playlist.length) return;
    const next = (currentIndex + 1) % playlist.length;
    set({ currentIndex: next, currentSong: playlist[next], isPlaying: false });
    get().resetReveals();
  },

  setPlaying(v) { set({ isPlaying: v }); },

  revealCover() {
    set({ coverRevealed: true });
  },

  revealField(field) {
    if (field === 'artist') set({ artistRevealed: true });
    else if (field === 'title') set({ titleRevealed: true });
    else if (field === 'year') set({ yearRevealed: true });
  },

  revealAll() {
    set({ coverRevealed: true, artistRevealed: true, titleRevealed: true, yearRevealed: true });
  },

  resetReveals() {
    set({ coverRevealed: false, artistRevealed: false, titleRevealed: false, yearRevealed: false });
  },

  setSelectedPlaylist(id) { set({ selectedPlaylistId: id }); },
}));
