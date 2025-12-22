import { createApp } from "vue";
import naive from "naive-ui";
import App from "./App.vue";
import router from "./router";
import { useAuthStore } from "./stores/auth";
import "./style.css";

async function bootstrap() {
  const { ready } = useAuthStore();
  await ready;

  const app = createApp(App);
  app.use(naive);
  app.use(router);
  app.mount("#app");
}

bootstrap();
