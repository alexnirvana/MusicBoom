import { reactive } from "vue";
import { readSetting, writeSetting } from "../services/settings-table";
import { SETTING_KEYS } from "../constants/setting-keys";
import type {
  DownloadSettings,
  GeneralSettings,
  NavidromeConfig,
  OpenlistConfig,
  PlaybackSettings,
  SettingsState,
} from "../types/settings";

// 默认值保持在一个对象中，方便在本地存储为空时还原
const defaultState: SettingsState = {
  navidrome: {
    baseUrl: "http://",
    username: "",
    password: "",
    remember: false,
  },
  openlist: {
    baseUrl: "http://",
    username: "",
    password: "",
    remember: false,
  },
  download: {
    musicDir: "",
    organizeByAlbum: true,
    downloadLyrics: true,
    overwriteExisting: false,
    sourcePreference: "latest",
    cacheDir: "",
    speedLimitMode: "auto",
    speedLimit: 3072,
    tags: {
      enableApev2: false,
      enableId3v1: false,
      enableId3v2: true,
      id3v2Version: "2.4",
      charset: "utf8",
    },
  },
  general: {
    closeAction: "minimize",
    enableNotifications: true,
    setDefaultPlayer: false,
  },
  playback: {
    enableCrossfade: true,
    crossfadeDuration: 4,
  },
};

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const state = reactive<SettingsState>(cloneState(defaultState));

function deepAssign<T extends Record<string, any>>(target: T, source: Partial<T>) {
  Object.entries(source).forEach(([key, value]) => {
    if (value === undefined) return;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      deepAssign((target as Record<string, any>)[key], value as Record<string, any>);
    } else {
      (target as Record<string, any>)[key] = value as any;
    }
  });
}

async function hydrateSettings() {
  try {
    const [navidrome, openlist, download, general, playback] = await Promise.all([
      readSetting<Partial<NavidromeConfig>>(SETTING_KEYS.NAVIDROME),
      readSetting<Partial<OpenlistConfig>>(SETTING_KEYS.OPENLIST),
      readSetting<Partial<DownloadSettings>>(SETTING_KEYS.DOWNLOAD),
      readSetting<Partial<GeneralSettings>>(SETTING_KEYS.GENERAL),
      readSetting<Partial<PlaybackSettings>>(SETTING_KEYS.PLAYBACK),
    ]);
    if (navidrome) deepAssign(state.navidrome, navidrome);
    if (openlist) deepAssign(state.openlist, openlist);
    if (download) deepAssign(state.download, download);
    if (general) deepAssign(state.general, general);
    if (playback) deepAssign(state.playback, playback);
  } catch (error) {
    console.warn("读取设置失败，已回退为默认值", error);
  }
}

const ready = hydrateSettings();

async function updateNavidrome(payload: Partial<NavidromeConfig>) {
  deepAssign(state.navidrome, payload);
  await writeSetting(SETTING_KEYS.NAVIDROME, state.navidrome);
}

async function updateOpenlist(payload: Partial<OpenlistConfig>) {
  deepAssign(state.openlist, payload);
  await writeSetting(SETTING_KEYS.OPENLIST, state.openlist);
}

async function updateDownload(payload: Partial<DownloadSettings>) {
  deepAssign(state.download, payload);
  await writeSetting(SETTING_KEYS.DOWNLOAD, state.download);
}

async function updateGeneral(payload: Partial<GeneralSettings>) {
  deepAssign(state.general, payload);
  await writeSetting(SETTING_KEYS.GENERAL, state.general);
}

async function updatePlayback(payload: Partial<PlaybackSettings>) {
  deepAssign(state.playback, payload);
  await writeSetting(SETTING_KEYS.PLAYBACK, state.playback);
}

async function resetSettings() {
  deepAssign(state, cloneState(defaultState));
  await Promise.all([
    writeSetting(SETTING_KEYS.NAVIDROME, state.navidrome),
    writeSetting(SETTING_KEYS.OPENLIST, state.openlist),
    writeSetting(SETTING_KEYS.DOWNLOAD, state.download),
    writeSetting(SETTING_KEYS.GENERAL, state.general),
    writeSetting(SETTING_KEYS.PLAYBACK, state.playback),
  ]);
}

export function useSettingsStore() {
  return {
    state,
    ready,
    updateNavidrome,
    updateOpenlist,
    updateDownload,
    updateGeneral,
    updatePlayback,
    resetSettings,
  };
}
