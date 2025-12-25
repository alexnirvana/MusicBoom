// Navidrome 及 Subsonic/OpenSubsonic 相关类型统一放在此处，便于共享复用
export interface NavidromeSong {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverUrl?: string;
  size?: number;
  comment?: string;
  created?: string;
}

export interface SubsonicSong {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  coverArt?: string;
  size?: number;
  comment?: string;
  created?: string;
}

export interface SubsonicArtist {
  id: string;
  name?: string;
  coverArt?: string;
  albumCount?: number;
}

export interface SubsonicAlbum {
  id: string;
  name?: string;
  artist?: string;
  songCount?: number;
  coverArt?: string;
}

export interface SubsonicResponseBody {
  "subsonic-response": {
    status: "ok" | "failed";
    error?: {
      code: number;
      message?: string;
    };
    artists?: {
      index?: { artist?: SubsonicArtist[] }[];
    };
    artist?: {
      album?: SubsonicAlbum[];
    };
    album?: {
      song?: SubsonicSong[] | SubsonicSong;
    };
    song?: SubsonicSong;
    songList?: {
      song?: SubsonicSong[] | SubsonicSong;
    };
  };
}

export interface SubsonicTokenAuth {
  username: string;
  token: string;
  salt: string;
}

export interface FetchSongsOptions {
  baseUrl: string;
  bearerToken?: string | null;
  token?: string | null; // Subsonic/OpenSubsonic 的 token（参数 t）
  salt?: string | null; // Subsonic/OpenSubsonic 的 salt（参数 s）
  username?: string | null;
  password?: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}
