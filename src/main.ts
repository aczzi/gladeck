import { createApp } from "vue";
import store from "@/core/store";
import MainView from "./MainView.vue";

import UserInfo from "@/components/modals/UserInfo.vue";
import HowToPlay from "@/components/modals/HowToPlay.vue";
import Leaderboard from "@/components/modals/Leaderboard.vue";
import EmailLogin from "@/components/modals/EmailLogin.vue";

import Camp from "@/components/Camp.vue";
import Arena from "@/components/Arena.vue";
import FanDonation from "@/components/buildings/FanDonation.vue";
import Barracks from "@/components/buildings/Barracks.vue";
import TrainingProgram from "@/components/buildings/TrainingProgram.vue";
import Infirmary from "@/components/buildings/Infirmary.vue";
import Market from "@/components/buildings/Market.vue";
import TopInfo from "@/components/subComponents/TopInfo.vue";

import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./assets/style/root.css";
import "bootstrap";

const app = createApp(MainView);

app
  .use(store)
  .component("EmailLogin", EmailLogin)
  .component("UserInfo", UserInfo)
  .component("HowToPlay", HowToPlay)
  .component("Leaderboard", Leaderboard)
  .component("TopInfo", TopInfo)
  .component("Camp", Camp)
  .component("Arena", Arena)
  .component("FanDonation", FanDonation)
  .component("Barracks", Barracks)
  .component("TrainingProgram", TrainingProgram)
  .component("Infirmary", Infirmary)
  .component("Market", Market)
  .mount("#app");
