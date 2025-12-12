import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/GroupList.vue'),
    },
    // 固定パスのルート（先にマッチさせる）
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
    {
      path: '/settings',
      name: 'user-settings',
      component: () => import('@/views/UserSettings.vue'),
    },
    // 旧URL形式（/groups/UUID）
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
        {
          path: 'job-definitions/:jobId',
          name: 'job-definition-detail',
          component: () => import('@/views/JobDefinitionDetail.vue'),
        },
        {
          path: 'job-instances',
          name: 'job-instances',
          component: () => import('@/views/JobInstanceList.vue'),
        },
        {
          path: 'job-instances/:instanceId',
          name: 'job-instance-detail',
          component: () => import('@/views/JobInstanceDetail.vue'),
        },
        {
          path: 'settings',
          name: 'group-settings',
          component: () => import('@/views/GroupSettings.vue'),
        },
      ],
    },
    // スラッグベースのルート（新URL形式）- 最後に配置
    {
      path: '/:groupSlug',
      name: 'group-by-slug',
      component: () => import('@/views/GroupHome.vue'),
      children: [
        {
          path: '',
          name: 'group-dashboard-slug',
          component: () => import('@/views/GroupDashboard.vue'),
        },
        {
          path: 'tasks',
          name: 'group-tasks-slug',
          component: () => import('@/views/TaskList.vue'),
        },
        {
          path: 'calendar',
          name: 'group-calendar-slug',
          component: () => import('@/views/GroupCalendar.vue'),
        },
        {
          path: 'job-definitions',
          name: 'job-definitions-slug',
          component: () => import('@/views/JobDefinitionList.vue'),
        },
        {
          path: 'job-definitions/:jobId',
          name: 'job-definition-detail-slug',
          component: () => import('@/views/JobDefinitionDetail.vue'),
        },
        {
          path: 'job-instances',
          name: 'job-instances-slug',
          component: () => import('@/views/JobInstanceList.vue'),
        },
        {
          path: 'settings',
          name: 'group-settings-slug',
          component: () => import('@/views/GroupSettings.vue'),
        },
        // 業務インスタンス（PREFIX-NUMBER形式）
        {
          path: ':instanceKey',
          name: 'job-instance-by-key',
          component: () => import('@/views/JobInstanceDetail.vue'),
        },
        // 業務インスタンス内のタスク
        {
          path: ':instanceKey/tasks/:taskNumber',
          name: 'task-by-key',
          component: () => import('@/views/TaskDetail.vue'),
        },
      ],
    },
  ],
})

export default router
