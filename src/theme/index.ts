// 全局主题封装，统一 Naive UI 配色
import { darkTheme, type GlobalThemeOverrides } from "naive-ui";
import { colorTokens } from "./colors";

// 主题基座使用官方暗色主题
export const appTheme = darkTheme;

// 通过 theme-overrides 覆盖组件的默认色值
export const appThemeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: colorTokens.primary,
    primaryColorHover: colorTokens.primaryHover,
    primaryColorPressed: colorTokens.primaryPressed,
    infoColor: colorTokens.primary,
    successColor: colorTokens.success,
  },
  Notification: {
    color: colorTokens.surfaceMuted,
    textColor: colorTokens.textPrimary,
    boxShadow: colorTokens.notificationShadow,
    borderRadius: "12px",
    closeColor: colorTokens.textSecondary,
    closeColorHover: colorTokens.textPrimary,
  },
};
