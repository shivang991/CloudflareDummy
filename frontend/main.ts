import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import AccountsPage from "./pages/AccountsPage.vue";
import CollectionsPage from "./pages/CollectionsPage.vue";
import CollectionPage from "./pages/CollectionPage.vue";
import NotFoundPage from "./pages/NotFoundPage.vue";
import "./style.css";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/admin/accounts" },
    { path: "/admin", redirect: "/admin/accounts" },
    { path: "/admin/accounts", component: AccountsPage },
    { path: "/admin/accounts/:accountId/collections", component: CollectionsPage },
    { path: "/admin/accounts/:accountId/collections/:collectionId", component: CollectionPage },
    { path: "/:pathMatch(.*)*", component: NotFoundPage },
  ],
});

createApp(App).use(router).mount("#app");
