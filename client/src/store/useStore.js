import { create } from 'zustand';

const useStore = create((set, get) => ({
  // ── Auth ─────────────────────────────────────────────────────
  auth: { spotify: false, youtube: false },
  setAuth: (auth) => set({ auth }),

  // ── Playlist (source) ────────────────────────────────────────
  playlist: null,
  setPlaylist: (playlist) => set({ playlist }),
  clearPlaylist: () => set({ playlist: null, selectedIds: new Set(), filterQuery: '' }),

  // ── Track selection ──────────────────────────────────────────
  selectedIds: new Set(),
  toggleTrack: (id) => {
    const s = new Set(get().selectedIds);
    if (s.has(id)) s.delete(id); else s.add(id);
    set({ selectedIds: s });
  },
  selectAll: () => {
    const { playlist } = get();
    if (!playlist) return;
    set({ selectedIds: new Set(playlist.tracks.map((t) => t.id)) });
  },
  deselectAll: () => set({ selectedIds: new Set() }),

  // ── Filter ───────────────────────────────────────────────────
  filterQuery: '',
  setFilterQuery: (q) => set({ filterQuery: q }),

  // ── Destination + options ────────────────────────────────────
  dest: 'ytmusic',
  setDest: (dest) => set({ dest }),
  options: {
    exactMatchOnly: true,
    preserveOrder: true,
    skipDuplicates: false,
    makePublic: false,
  },
  toggleOption: (key) =>
    set((s) => ({ options: { ...s.options, [key]: !s.options[key] } })),

  // ── Recipient ────────────────────────────────────────────────
  recipientEmail: '',
  setRecipientEmail: (v) => set({ recipientEmail: v }),

  // ── Transfer ─────────────────────────────────────────────────
  transfer: {
    status: 'idle', // idle | running | done | error
    progress: 0,
    done: 0,
    total: 0,
    currentTrack: '',
    matched: 0,
    missed: 0,
    shareToken: null,
    destPlaylistId: null,
  },
  setTransfer: (patch) =>
    set((s) => ({ transfer: { ...s.transfer, ...patch } })),
  resetTransfer: () =>
    set({
      transfer: {
        status: 'idle', progress: 0, done: 0, total: 0,
        currentTrack: '', matched: 0, missed: 0, shareToken: null, destPlaylistId: null,
      },
    }),

  // ── Toast ────────────────────────────────────────────────────
  toast: { visible: false, message: '' },
  showToast: (message) => {
    set({ toast: { visible: true, message } });
    setTimeout(() => set({ toast: { visible: false, message: '' } }), 2700);
  },
}));

export default useStore;
