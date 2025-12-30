import { listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow, currentMonitor, LogicalPosition } from "@tauri-apps/api/window";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";

// 启动与精简模式窗口的桥接，监听恢复事件
export async function initMiniPlayerBridge() {
  const unlisten = await listen("mini-player:restore", async () => {
    const main = await WebviewWindow.getByLabel("main");
    const current = getCurrentWindow();
    try {
      if (main) {
        console.log("恢复主窗口");
        await main.show();
        await main.setFocus();
      } else {
        // 如果当前窗口不是主窗口，直接显示自己
        await current.show();
        await current.setFocus();
      }
    } catch (error) {
      console.error("恢复主窗口失败", error);
    }
  });

  // 监听来自精简模式的所有事件，确保即使主窗口隐藏也能接收
  const commandUnlisten = await listen("player:command", async (event) => {
    console.log("initMiniPlayerBridge 收到 player:command:", event.payload);
    // 这个事件会被 PlayerBar 处理，这里只是为了调试
  });

  return () => {
    unlisten();
    commandUnlisten();
  };
}

// 计算右下角定位，供精简模式窗口复用
export async function calcMiniPosition(width: number, height: number) {
  try {
    const monitor = await currentMonitor();
    if (!monitor) return null;
    const logicalWidth = monitor.workArea.size.width / monitor.scaleFactor;
    const logicalHeight = monitor.workArea.size.height / monitor.scaleFactor;
    const x = logicalWidth - width - 16;
    const y = logicalHeight - height - 24;
    return new LogicalPosition(x, y);
  } catch (error) {
    console.warn("计算精简模式位置失败，已回退居中", error);
    return null;
  }
}

// 通知权限处理，供精简模式入口调用
export async function ensureNotifyPermission() {
  let granted = await isPermissionGranted();
  if (granted) return true;
  const permission = await requestPermission();
  return permission === "granted";
}
