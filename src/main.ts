import { createApp } from "vue";
import store from "@/core/store";
import MainView from "./MainView.vue";

import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./assets/style/root.css";
import "bootstrap";

const app = createApp(MainView);

app.use(store).mount("#app");
