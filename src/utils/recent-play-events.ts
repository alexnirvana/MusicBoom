// 最近播放变更事件总线，便于不同页面之间同步刷新
const recentPlayBus = new EventTarget();

export type RecentPlayListener = () => void;

export const RECENT_PLAY_EVENT = "recent-play-updated";

export function emitRecentPlayUpdated() {
  recentPlayBus.dispatchEvent(new Event(RECENT_PLAY_EVENT));
}

export function listenRecentPlayUpdated(handler: RecentPlayListener) {
  const listener = () => handler();
  recentPlayBus.addEventListener(RECENT_PLAY_EVENT, listener);
  return () => recentPlayBus.removeEventListener(RECENT_PLAY_EVENT, listener);
}
