import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import App from './App.vue';
import HomeView from './views/HomeView.vue';
import './style.css';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: HomeView, meta: { title: '城市灵感现场' } },
    {
      path: '/session/:id',
      component: () => import('./views/SessionView.vue'),
      meta: { title: '体验详情' },
    },
    {
      path: '/book',
      component: () => import('./views/BookingView.vue'),
      meta: { title: '预约我的灵感日' },
    },
    {
      path: '/records',
      component: () => import('./views/RecordsView.vue'),
      meta: { title: '我的行程' },
    },
    {
      path: '/success/:id',
      component: () => import('./views/SuccessView.vue'),
      meta: { title: '预约回执' },
    },
    {
      path: '/:pathMatch(.*)*',
      component: () => import('./views/NotFoundView.vue'),
      meta: { title: '未找到页面' },
    },
  ],
  scrollBehavior(to) {
    return to.hash ? { el: to.hash, top: 110, behavior: 'smooth' } : { top: 0 };
  },
});
router.afterEach((to) => {
  document.title = `${String(to.meta.title)} · Pulse`;
});
createApp(App).use(createPinia()).use(router).mount('#app');
