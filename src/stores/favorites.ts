import { reactive } from "vue";
import { addFavorite, listFavorites, removeFavorite } from "../services/favorite";

// 全局收藏状态管理
const state = reactive<{
  favoriteIds: Set<string>;
  ready: Promise<void>;
  refreshCounter: number;
}>({
  favoriteIds: new Set<string>(),
  ready: Promise.resolve(),
  refreshCounter: 0,
});

// 加载收藏列表
async function loadFavorites() {
  try {
    const records = await listFavorites();
    state.favoriteIds = new Set(records.map((item) => item.songId));
  } catch (error) {
    console.error("加载收藏列表失败:", error);
  }
}

// 初始化
state.ready = loadFavorites();

// 检查歌曲是否被收藏
function isFavorite(songId: string): boolean {
  return state.favoriteIds.has(songId);
}

// 添加收藏
async function addFavoriteSong(songId: string, songData: {
  title: string;
  artist: string;
  album: string;
  duration: number;
  created?: string;
}) {
  await addFavorite({
    songId,
    title: songData.title,
    artist: songData.artist,
    album: songData.album,
    duration: songData.duration,
    created: songData.created,
  });
  state.favoriteIds.add(songId);
  state.refreshCounter++;
}

// 移除收藏
async function removeFavoriteSong(songId: string) {
  await removeFavorite(songId);
  state.favoriteIds.delete(songId);
  state.refreshCounter++;
}

// 切换收藏状态
async function toggleFavorite(songId: string, songData: {
  title: string;
  artist: string;
  album: string;
  duration: number;
  created?: string;
}) {
  if (state.favoriteIds.has(songId)) {
    await removeFavoriteSong(songId);
    return false; // 已取消收藏
  } else {
    await addFavoriteSong(songId, songData);
    return true; // 已添加收藏
  }
}

// 重新加载收藏列表
async function reload() {
  await loadFavorites();
  state.refreshCounter++;
}

export function useFavoriteStore() {
  return {
    state,
    ready: state.ready,
    isFavorite,
    addFavoriteSong,
    removeFavoriteSong,
    toggleFavorite,
    reload,
  };
}
