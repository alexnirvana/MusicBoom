import { createApp } from "vue";
import naive from "naive-ui";
import App from "./App.vue";
import router from "./router";
import { useAuthStore } from "./stores/auth";
import { usePlayerStore } from "./stores/player";
import "./style.css";
import { RecycleScroller } from "vue-virtual-scroller";
import "vue-virtual-scroller/dist/vue-virtual-scroller.css";

async function bootstrap() {
  const { ready } = useAuthStore();
  const auth = useAuthStore();
  await ready;

  const player = usePlayerStore();

  if (auth.state.baseUrl && auth.state.token && auth.state.salt && auth.state.username) {
    await player.restoreFromSnapshot({
      baseUrl: auth.state.baseUrl,
      bearerToken: null,
      token: auth.state.token,
      salt: auth.state.salt,
      username: auth.state.username,
      password: null,
    });
  }

  const app = createApp(App);
  app.use(naive);
  app.use(router);
  app.component("RecycleScroller", RecycleScroller);
  app.mount("#app");
}

bootstrap();
