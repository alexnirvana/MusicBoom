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
  id: string;
  name: string;
  count: number;
  songs: NavidromeSong[];
}

interface PlaylistsState {
  items: PlaylistItem[];
  currentId: string | null;
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

async function renamePlaylist(id: string, name: string) {
  const finalName = name.trim();
  if (!finalName) throw new Error("歌单名称不能为空");
  await dbRenamePlaylist(id, finalName);
  const found = state.items.find((p) => p.id === id);
  if (found) found.name = finalName;
}

async function removePlaylist(id: string) {
  try {
    await dbRemovePlaylist(id);
    // 只有数据库删除成功后才更新前端状态
    const index = state.items.findIndex((p) => p.id === id);
    if (index >= 0) state.items.splice(index, 1);
    if (state.currentId === id) {
      state.currentId = state.items[0]?.id || null;
    }
  } catch (error) {
    console.error('删除歌单失败:', error);
    throw error; // 重新抛出错误，让前端处理
  }
}

async function loadSongsForPlaylist(id: string) {
  const found = state.items.find((p) => p.id === id);
  if (!found) return;
  if (found.songs.length > 0) return;
  const list = await listPlaylistSongs(id);
  found.songs = list;
}

function selectPlaylist(id: string) {
  state.currentId = id;
  loadSongsForPlaylist(id).catch(() => {});
}

async function addSongsToPlaylist(id: string, songs: NavidromeSong[]) {
  await dbAddSongs(id, songs);
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
