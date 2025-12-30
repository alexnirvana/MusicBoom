import { createApp } from "vue";
import naive from "naive-ui";
import MiniPlayer from "./pages/MiniPlayer.vue";
import "./style.css";
import { RecycleScroller } from "vue-virtual-scroller";
import "vue-virtual-scroller/dist/vue-virtual-scroller.css";

// 精简模式独立入口
const app = createApp(MiniPlayer);
app.use(naive);
app.component("RecycleScroller", RecycleScroller);
app.mount("#mini-app");
