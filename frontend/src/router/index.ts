import { createRouter, createWebHistory } from 'vue-router'
import MySentinelsView from '@/views/MySentinelsView.vue'
import AnalyzeView from '@/views/AnalyzeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: MySentinelsView },
    { path: '/analyze/:tokenId', component: AnalyzeView, props: true },
  ],
})

export default router
