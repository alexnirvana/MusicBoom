<template>
  <div class="auth-stage" data-tauri-drag-region>
    <div class="page-content no-drag">
      <slot />
    </div>
  </div>
</template>

<style scoped>
/* 登录页整体可拖拽，表单区域禁止拖拽以免影响输入 */
[data-tauri-drag-region] {
  -webkit-app-region: drag;
}

.no-drag {
  -webkit-app-region: no-drag;
}

.auth-stage {
  @apply flex min-h-screen items-center justify-center bg-gradient-to-b from-[#0b0e17] via-[#0d1020] to-[#0b0e17] px-6 py-10;
}

.page-content {
  @apply w-full max-w-5xl;
}
</style>
