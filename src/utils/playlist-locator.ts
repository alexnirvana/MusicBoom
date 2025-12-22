import type { NavidromeSong } from "../types/navidrome";

// 简单的事件总线：用于播放列表定位请求在不同页面之间传递
const locatorBus = new EventTarget();

export type LocateListener = (song: NavidromeSong) => void;

export function emitLocateRequest(song: NavidromeSong) {
  locatorBus.dispatchEvent(new CustomEvent<NavidromeSong>("locate", { detail: song }));
}

export function listenLocateRequest(handler: LocateListener) {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<NavidromeSong>).detail;
    if (detail) {
      handler(detail);
    }
  };
  locatorBus.addEventListener("locate", listener);
  return () => locatorBus.removeEventListener("locate", listener);
}
