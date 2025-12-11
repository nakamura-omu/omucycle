import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/GroupList.vue'),
    },
    {
      path: '/groups/:groupId',
      name: 'group',
      component: () => import('@/views/GroupHome.vue'),
      children: [
        {
          path: '',
          name: 'group-dashboard',
          component: () => import('@/views/GroupDashboard.vue'),
        },
        {
          path: 'tasks',
          name: 'group-tasks',
          component: () => import('@/views/TaskList.vue'),
        },
        {
          path: 'tasks/:taskId',
          name: 'task-detail',
          component: () => import('@/views/TaskDetail.vue'),
        },
        {
          path: 'calendar',
          name: 'group-calendar',
          component: () => import('@/views/GroupCalendar.vue'),
        },
        {
          path: 'job-definitions',
          name: 'job-definitions',
          component: () => import('@/views/JobDefinitionList.vue'),
        },
      ],
    },
    {
      path: '/my/tasks',
      name: 'my-tasks',
      component: () => import('@/views/MyTasks.vue'),
    },
    {
      path: '/my/calendar',
      name: 'my-calendar',
      component: () => import('@/views/MyCalendar.vue'),
    },
    {
      path: '/inbox',
      name: 'inbox',
      component: () => import('@/views/Inbox.vue'),
    },
    {
      path: '/flashcard',
      name: 'flashcard',
      component: () => import('@/views/FlashCard.vue'),
    },
  ],
})

export default router
