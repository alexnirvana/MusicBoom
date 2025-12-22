<script setup lang="ts">
import MainLayout from "../layouts/MainLayout.vue";

// 推荐内容示例数据
const recommendations = [
  { title: "午夜电音", desc: "电子浪潮与夜色共振的精选曲目" },
  { title: "清晨醒脑", desc: "用轻快旋律开启一天的活力" },
  { title: "吉他私房歌", desc: "木吉他与人声的温柔瞬间" },
  { title: "说唱现场", desc: "感受舞台最直白的能量输出" },
];

// 热门歌单示例数据
const playlists = [
  { name: "City Pop 巡游", count: 24 },
  { name: "独立电子精选", count: 18 },
  { name: "睡前舒缓", count: 16 },
];
</script>

<template>
  <MainLayout>
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
        <div>
          <p class="m-0 text-sm uppercase tracking-[0.08em] text-[#8bb8ff]">推荐页面</p>
          <h1 class="m-0 text-3xl font-semibold text-white">随时发现合你口味的新音乐</h1>
          <p class="m-0 text-[#c6d2e8]">示例内容已为你准备完毕，直接播放或收藏喜欢的声音。</p>
        </div>
        <div class="flex gap-3 text-center">
          <div class="rounded-xl border border-white/10 bg-white/5 px-4 py-2">
            <p class="m-0 text-xs text-[#9ab4d8]">推荐</p>
            <p class="m-0 text-lg font-semibold text-white">4</p>
          </div>
          <div class="rounded-xl border border-white/10 bg-white/5 px-4 py-2">
            <p class="m-0 text-xs text-[#9ab4d8]">歌单</p>
            <p class="m-0 text-lg font-semibold text-white">3</p>
          </div>
          <div class="rounded-xl border border-white/10 bg-white/5 px-4 py-2">
            <p class="m-0 text-xs text-[#9ab4d8]">收藏</p>
            <p class="m-0 text-lg font-semibold text-white">32</p>
          </div>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <n-card
          :bordered="true"
          class="relative overflow-hidden bg-gradient-to-br from-[#4f86ff]/25 via-[#6ec6ff]/15 to-transparent border-white/10"
        >
          <div class="grid items-center gap-4 md:grid-cols-2">
            <div class="space-y-3">
              <p class="m-0 text-sm uppercase tracking-[0.08em] text-[#9ab4d8]">今日推荐</p>
              <h2 class="m-0 text-2xl font-bold text-white">为你随机准备的示例歌单</h2>
              <p class="m-0 text-[#c6d2e8]">暗黑模式下的导航与布局已对齐，你可以直接点击播放或加入收藏。</p>
              <div class="flex flex-wrap gap-3 pt-1">
                <n-button type="primary" strong round>立即播放</n-button>
                <n-button quaternary strong round>加入歌单</n-button>
              </div>
            </div>
            <div class="relative min-h-[180px]">
              <div class="absolute w-36 h-36 bg-white/10 rounded-full blur-sm top-[10%] left-[12%]"></div>
              <div class="absolute w-44 h-44 bg-[#669fff]/40 rounded-full blur-sm bottom-0 right-[12%]"></div>
              <div class="absolute w-24 h-24 bg-[#6fc6ff]/45 rounded-full blur-sm bottom-[18%] left-[20%]"></div>
              <div class="absolute w-32 h-32 bg-white/15 rounded-full blur-sm top-[8%] right-[4%]"></div>
            </div>
          </div>
        </n-card>

        <n-card :bordered="true" class="bg-white/5 border-white/10">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="m-0 text-lg font-semibold text-white">快捷入口</h3>
              <p class="m-0 text-sm text-[#9ab4d8]">常用功能集中在这里</p>
            </div>
          </template>
          <div class="grid gap-3 sm:grid-cols-2">
            <n-button strong secondary class="h-full w-full justify-start bg-white/10" round>
              <div>
                <p class="m-0 text-xs uppercase tracking-[0.08em] text-[#9ab4d8]">历史</p>
                <p class="m-0 text-base text-white">继续播放上次未听完的专辑</p>
              </div>
            </n-button>
            <n-button strong secondary class="h-full w-full justify-start bg-white/10" round>
              <div>
                <p class="m-0 text-xs uppercase tracking-[0.08em] text-[#9ab4d8]">电台</p>
                <p class="m-0 text-base text-white">自动匹配你喜欢的风格</p>
              </div>
            </n-button>
            <n-button strong secondary class="h-full w-full justify-start bg-white/10" round>
              <div>
                <p class="m-0 text-xs uppercase tracking-[0.08em] text-[#9ab4d8]">下载</p>
                <p class="m-0 text-base text-white">查看已缓存内容</p>
              </div>
            </n-button>
            <n-button strong secondary class="h-full w-full justify-start bg-white/10" round>
              <div>
                <p class="m-0 text-xs uppercase tracking-[0.08em] text-[#9ab4d8]">收藏</p>
                <p class="m-0 text-base text-white">跳转到收藏夹</p>
              </div>
            </n-button>
          </div>
        </n-card>
      </div>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <n-card
          v-for="item in recommendations"
          :key="item.title"
          :title="item.title"
          size="medium"
          class="bg-white/5 border-white/10 text-left"
        >
          <p class="m-0 text-sm text-[#9ab4d8]">推荐</p>
          <p class="mt-2 mb-3 min-h-[40px] text-[#c6d2e8]">{{ item.desc }}</p>
          <n-button quaternary strong size="small" round>播放试听</n-button>
        </n-card>
      </div>

      <n-card :bordered="true" class="bg-white/5 border-white/10">
        <template #header>
          <div class="flex flex-wrap items-baseline justify-between gap-3">
            <h2 class="m-0 text-xl font-semibold text-white">热门歌单</h2>
            <p class="m-0 text-sm text-[#9ab4d8]">随机示例歌单，方便体验布局</p>
          </div>
        </template>
        <div class="flex flex-col gap-3">
          <div
            v-for="item in playlists"
            :key="item.name"
            class="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 px-3 py-3"
          >
            <div>
              <p class="m-0 text-base font-semibold text-white">{{ item.name }}</p>
              <p class="m-0 text-sm text-[#9ab4d8]">共 {{ item.count }} 首歌曲</p>
            </div>
            <n-button quaternary strong size="small" round>查看</n-button>
          </div>
        </div>
      </n-card>
    </div>
  </MainLayout>
</template>
