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
      path: "/intelligence",
      component: () => import("./pages/OrbitLab.vue"),
      meta: { title: "星域智航 · 智能演化实验室" },
    },
    {
      path: "/intelligence/tasks",
      component: () => import("./pages/IntelligenceLab.vue"),
      meta: { title: "实用任务库 · 智能演化实验室" },
    },
    {
      path: "/labs/market-replay",
      component: () => import("./pages/MarketReplay.vue"),
      meta: { title: "金融事件回放" },
    },
    {
      path: "/labs/enterprise-flow",
      component: () => import("./pages/EnterpriseFlowLab.vue"),
      meta: { title: "企业业务闭环" },
    },
    {
      path: "/writing",
      component: () => import("./pages/Writing.vue"),
      meta: { title: "工程笔记" },
    },
    {
      path: "/labs/engineering",
      component: () => import("./pages/EngineeringExperiments.vue"),
      meta: { title: "三个工程实验" },
    },
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
