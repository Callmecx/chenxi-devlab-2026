import { createApp } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHashHistory } from "vue-router";
import App from "./App.vue";
import Home from "./pages/Home.vue";
import "./style.css";
const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: "/", component: Home, meta: { title: "从业务需求到工程交付" } },
    {
      path: "/projects",
      component: () => import("./pages/Projects.vue"),
      meta: { title: "项目索引" },
    },
    {
      path: "/projects/:slug",
      component: () => import("./pages/ProjectDetail.vue"),
      meta: { title: "项目档案" },
    },
    {
      path: "/capabilities",
      component: () => import("./pages/Capabilities.vue"),
      meta: { title: "技术与方法" },
    },
    {
      path: "/contact",
      component: () => import("./pages/Contact.vue"),
      meta: { title: "联系我" },
    },
    {
      path: "/:pathMatch(.*)*",
      component: () => import("./pages/NotFound.vue"),
      meta: { title: "页面未找到" },
    },
  ],
});
router.afterEach((to) => {
  document.title = `${to.meta.title} · Chenxi DevLab`;
});
createApp(App).use(createPinia()).use(router).mount("#app");
