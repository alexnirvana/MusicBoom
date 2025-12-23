import { reactive, computed } from "vue";
import type { NavidromeSong } from "../types/navidrome";
import {
  addSongsToPlaylist as dbAddSongs,
  createPlaylist as dbCreatePlaylist,
  listPlaylists,
  listPlaylistSongs,
  removePlaylist as dbRemovePlaylist,
  renamePlaylist as dbRenamePlaylist,
} from "../services/playlist/storage";

interface PlaylistItem {
  id: number;
  name: string;
  count: number;
  songs: NavidromeSong[];
}

interface PlaylistsState {
  items: PlaylistItem[];
  currentId: number | null;
  ready: boolean;
}

const state = reactive<PlaylistsState>({
  items: [],
  currentId: null,
  ready: false,
});

async function hydrate() {
  const rows = await listPlaylists();
  state.items = rows.map((r) => ({ ...r, songs: [] }));
  state.ready = true;
}

const ready = hydrate();

function nextDefaultName(): string {
  let maxIndex = 0;
  for (const p of state.items) {
    const m = p.name.match(/^新建歌单(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n)) {
        maxIndex = Math.max(maxIndex, n);
      }
    }
  }
  return `新建歌单${maxIndex + 1}`;
}

async function createPlaylist(name?: string) {
  const baseName = (name || "").trim() || nextDefaultName();
  const { id } = await dbCreatePlaylist(baseName);
  const item: PlaylistItem = { id, name: baseName, count: 0, songs: [] };
  state.items.unshift(item);
  state.currentId = id;
  return item;
}

async function renamePlaylist(id: number, name: string) {
  const finalName = name.trim();
  if (!finalName) throw new Error("歌单名称不能为空");
  await dbRenamePlaylist(id, finalName);
  const found = state.items.find((p) => p.id === id);
  if (found) found.name = finalName;
}

async function removePlaylist(id: number) {
  await dbRemovePlaylist(id);
  const index = state.items.findIndex((p) => p.id === id);
  if (index >= 0) state.items.splice(index, 1);
  if (state.currentId === id) {
    state.currentId = state.items[0]?.id || null;
  }
}

async function loadSongsForPlaylist(id: number) {
  const found = state.items.find((p) => p.id === id);
  if (!found) return;
  if (found.songs.length > 0) return;
  const list = await listPlaylistSongs(id);
  found.songs = list;
}

function selectPlaylist(id: number) {
  const pid = typeof id === "string" ? Number(id) : id;
  state.currentId = pid;
  loadSongsForPlaylist(pid).catch(() => {});
}

async function addSongsToPlaylist(id: number, songs: NavidromeSong[]) {
  await dbAddSongs(id.toString(), songs);
  const found = state.items.find((p) => p.id === id);
  if (!found) return;
  const existingIds = new Set(found.songs.map((s) => s.id));
  for (const s of songs) {
    if (!existingIds.has(s.id)) {
      found.songs.push(s);
    }
  }
  found.count = found.songs.length;
}

const current = computed(() => state.items.find((p) => p.id === state.currentId) || null);

export function usePlaylistsStore() {
  return {
    state,
    ready,
    current,
    nextDefaultName,
    createPlaylist,
    renamePlaylist,
    removePlaylist,
    selectPlaylist,
    addSongsToPlaylist,
  };
}
