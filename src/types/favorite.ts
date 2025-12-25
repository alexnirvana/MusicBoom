// 收藏表对应的行类型，便于跨页面调用
export interface FavoriteRow {
  songId: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  created?: string;
}
