import { createApp } from "vue";
import naive from "naive-ui";
import MiniPlayer from "./pages/MiniPlayer.vue";
import "./style.css";

// 精简模式独立入口
const app = createApp(MiniPlayer);
app.use(naive);
app.mount("#mini-app");
