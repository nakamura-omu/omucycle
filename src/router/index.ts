import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory('/cycle/'),
  routes: [
    // ホーム = インボックス（Todoist流: 開いたら自分のタスク）
    { path: '/', name: 'home', redirect: '/my' },

    // === マイ ===
    { path: '/my', name: 'my-home', component: () => import('@/views/Inbox2.vue') },
    { path: '/my/inbox', name: 'my-inbox', component: () => import('@/views/Inbox2.vue') },
    { path: '/my/today', name: 'my-today', component: () => import('@/views/TodayView.vue') },
    { path: '/my/upcoming', name: 'my-upcoming', component: () => import('@/views/UpcomingView.vue') },
    { path: '/my/filters', name: 'my-filters', component: () => import('@/views/FiltersView.vue') },
    { path: '/my/tasks', name: 'my-tasks', component: () => import('@/views/MyTasks.vue') },
    { path: '/my/calendar', name: 'my-calendar', component: () => import('@/views/MyCalendar.vue') },

    // === グローバル ===
    { path: '/notifications', name: 'notifications', component: () => import('@/views/Inbox.vue') },
    { path: '/inbox', name: 'inbox', component: () => import('@/views/Inbox.vue') },
    { path: '/flashcard', name: 'flashcard', component: () => import('@/views/FlashCard.vue') },
    { path: '/settings', name: 'user-settings', component: () => import('@/views/UserSettings.vue') },

    // === グループ ===
    {
      path: '/:groupSlug',
      name: 'group',
      component: () => import('@/views/GroupHome.vue'),
      children: [
        // グループはタスク中心: ランディング=タスク一覧（ダッシュボード/アトラス廃止 2026-07-10）
        { path: '', name: 'group-home', redirect: (to) => `/${to.params.groupSlug}/tasks` },
        { path: 'projects', name: 'project-list', component: () => import('@/views/ProjectList.vue') },
        { path: 'calendar', name: 'group-calendar', component: () => import('@/views/GroupCalendar.vue') },
        { path: 'wiki', name: 'wiki-home', component: () => import('@/views/WikiHome.vue') },
        { path: 'wiki/:pageSlug', name: 'wiki-page', component: () => import('@/views/WikiPage.vue') },
        { path: 'settings', name: 'group-settings', component: () => import('@/views/GroupSettings.vue') },
        { path: 'tasks', name: 'group-tasks', component: () => import('@/views/TaskList.vue') },
        { path: 'cycles', name: 'group-cycles', component: () => import('@/views/GroupCycleList.vue') },

        // プロジェクト配下
        { path: ':projectSlug', name: 'project-home', component: () => import('@/views/ProjectHome.vue') },
        { path: ':projectSlug/cycles', name: 'cycle-list', component: () => import('@/views/CycleList.vue') },
        { path: ':projectSlug/cycles/:cycleNumber', name: 'cycle-detail', component: () => import('@/views/CycleDetail.vue') },
        // T-N 形式のタスク詳細 (URL: /:groupSlug/:projectSlug/tasks/3)
        { path: ':projectSlug/tasks/:taskNumber(\\d+)', name: 'task-by-number', component: () => import('@/views/TaskDetail.vue') },
      ],
    },
  ],
})

export default router
