<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowDown,
  Bell,
  Expand,
  Fold,
  FullScreen,
  Key,
  SwitchButton,
  UserFilled,
} from '@element-plus/icons-vue'
import AppSidebar from '@/components/AppSidebar.vue'
import { fetchMessagePage, markMessageRead } from '@/api/message'
import { useAuthStore } from '@/stores/auth'
import { initialsOf } from '@/utils/format'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const collapsed = ref(localStorage.getItem('company.platform.sidebar.collapsed') === '1')
const mobileOpen = ref(false)
const isMobile = ref(false)
const messagePopover = ref(false)
const unreadCount = ref(0)
const recentMessages = ref([])
const messagesLoading = ref(false)
let messageTimer = null

const breadcrumbs = computed(() => {
  const records = route.matched.filter((item) => item.meta?.title)
  if (!records.length) return [{ title: '工作台' }]
  return records.map((item) => ({ title: item.meta.title }))
})

const todayLabel = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
}).format(new Date())

function updateViewport() {
  isMobile.value = window.innerWidth < 960
  if (!isMobile.value) mobileOpen.value = false
}

function toggleSidebar() {
  if (isMobile.value) {
    mobileOpen.value = true
    return
  }
  collapsed.value = !collapsed.value
  localStorage.setItem('company.platform.sidebar.collapsed', collapsed.value ? '1' : '0')
}

function closeMobile() {
  mobileOpen.value = false
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await document.documentElement.requestFullscreen()
    }
  } catch {
    ElMessage.warning('当前浏览器不允许全屏，请使用 F11')
  }
}

function handleUserCommand(command) {
  if (command === 'profile') router.push('/profile')
  if (command === 'permissions') router.push('/system/permissions')
  if (command === 'logout') handleLogout()
}

function handleLogout() {
  ElMessageBox.confirm('退出后需要重新通过统一认证登录，确定退出吗？', '退出登录', {
    confirmButtonText: '退出登录',
    cancelButtonText: '留在此页',
    type: 'warning',
  })
    .then(() => {
      auth.logout()
      router.replace({ name: 'login', query: { reason: 'logout' } })
    })
    .catch(() => {})
}

/**
 * 加载顶部消息角标和最近消息。
 *
 * 轮询间隔 30 秒，避免首期引入 WebSocket；接口失败时静默保留上一次结果，
 * 不打断用户当前操作。退出登录后定时器会被清理。
 */
async function loadMessageSummary() {
  if (!auth.isAuthenticated) return
  messagesLoading.value = true
  try {
    const data = await fetchMessagePage({ page: 1, size: 5 })
    unreadCount.value = Number(data.unreadCount || 0)
    recentMessages.value = data.records || []
  } catch {
    // 消息中心不可用时不影响主业务页面。
  } finally {
    messagesLoading.value = false
  }
}

async function openMessage(row) {
  messagePopover.value = false
  if (row.read !== true) {
    try {
      await markMessageRead(row.id)
      row.read = true
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    } catch {
      // 已读失败仍允许跳转，用户可在消息中心重试。
    }
  }
  if (row.linkPath) router.push(row.linkPath)
}

function goMessageCenter() {
  messagePopover.value = false
  router.push('/messages')
}

watch(
  () => route.fullPath,
  () => {
    // 页面切换后刷新角标，审批/开始工单产生的消息可以及时出现。
    loadMessageSummary()
  },
)

onMounted(() => {
  updateViewport()
  window.addEventListener('resize', updateViewport)
  loadMessageSummary()
  messageTimer = window.setInterval(loadMessageSummary, 30000)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewport)
  if (messageTimer) window.clearInterval(messageTimer)
})
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--collapsed': collapsed }">
    <aside v-if="!isMobile" class="app-aside">
      <AppSidebar :collapsed="collapsed" />
    </aside>

    <el-drawer
      v-model="mobileOpen"
      direction="ltr"
      size="272px"
      :with-header="false"
      class="mobile-drawer"
    >
      <AppSidebar :collapsed="false" @navigate="closeMobile" />
    </el-drawer>

    <div class="app-body">
      <header class="app-topbar">
        <div class="app-topbar__left">
          <button class="icon-button" type="button" aria-label="切换导航" @click="toggleSidebar">
            <el-icon :size="20"><Fold v-if="!collapsed && !isMobile" /><Expand v-else /></el-icon>
          </button>
          <div class="app-topbar__breadcrumb">
            <el-breadcrumb separator="/">
              <el-breadcrumb-item :to="{ name: 'dashboard' }">首页</el-breadcrumb-item>
              <el-breadcrumb-item v-for="item in breadcrumbs" :key="item.title">
                {{ item.title }}
              </el-breadcrumb-item>
            </el-breadcrumb>
          </div>
        </div>

        <div class="app-topbar__right">
          <span class="topbar-date">{{ todayLabel }}</span>
          <el-popover
            v-model:visible="messagePopover"
            placement="bottom-end"
            :width="380"
            trigger="click"
            popper-class="message-popover"
          >
            <template #reference>
              <button class="icon-button" type="button" aria-label="消息">
                <el-badge :value="unreadCount" :hidden="!unreadCount" :max="99">
                  <el-icon :size="19"><Bell /></el-icon>
                </el-badge>
              </button>
            </template>
            <div v-loading="messagesLoading" class="message-popover__body">
              <div class="message-popover__head">
                <strong>站内消息</strong>
                <span v-if="unreadCount" class="message-popover__badge">{{ unreadCount }} 条未读</span>
              </div>
              <div v-if="recentMessages.length" class="message-popover__list">
                <button
                  v-for="row in recentMessages"
                  :key="row.id"
                  class="message-popover__item"
                  :class="{ 'is-unread': row.read !== true }"
                  type="button"
                  @click="openMessage(row)"
                >
                  <span class="message-popover__dot"></span>
                  <span class="message-popover__text">
                    <strong>{{ row.title }}</strong>
                    <span>{{ row.content }}</span>
                  </span>
                </button>
              </div>
              <div v-else class="message-popover__empty">暂无未读消息</div>
              <div class="message-popover__footer">
                <el-button link type="primary" @click="goMessageCenter">查看全部消息</el-button>
              </div>
            </div>
          </el-popover>
          <el-tooltip content="全屏展示" placement="bottom">
            <button class="icon-button" type="button" aria-label="全屏" @click="toggleFullscreen">
              <el-icon :size="18"><FullScreen /></el-icon>
            </button>
          </el-tooltip>

          <div class="topbar-divider"></div>

          <el-dropdown trigger="click" @command="handleUserCommand">
            <button class="user-chip" type="button">
              <span class="user-chip__avatar">{{ initialsOf(auth.displayName) }}</span>
              <span class="user-chip__text">
                <strong>{{ auth.displayName }}</strong>
                <small>{{ auth.username || '当前会话' }}</small>
              </span>
              <el-icon class="user-chip__arrow"><ArrowDown /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">
                  <el-icon><UserFilled /></el-icon>个人中心
                </el-dropdown-item>
                <el-dropdown-item command="permissions">
                  <el-icon><Key /></el-icon>我的权限
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="app-main">
        <router-view v-slot="{ Component, route: currentRoute }">
          <transition name="page-fade" mode="out-in">
            <component :is="Component" :key="currentRoute.fullPath" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<style scoped>
.message-popover__body {
  min-height: 80px;
}

.message-popover__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
  color: var(--ink-900);
  font-size: 12px;
}

.message-popover__badge {
  color: #b45309;
  font-size: 10px;
}

.message-popover__list {
  display: grid;
  gap: 2px;
  max-height: 320px;
  overflow-y: auto;
  padding: 6px 0;
}

.message-popover__item {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr);
  gap: 8px;
  padding: 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.message-popover__item:hover {
  background: #f5f8ff;
}

.message-popover__dot {
  width: 7px;
  height: 7px;
  margin-top: 5px;
  border-radius: 50%;
  background: transparent;
}

.message-popover__item.is-unread .message-popover__dot {
  background: #2563eb;
}

.message-popover__text {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.message-popover__text strong {
  overflow: hidden;
  color: var(--ink-800);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-popover__text span {
  display: -webkit-box;
  overflow: hidden;
  color: var(--ink-500);
  font-size: 10.5px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.message-popover__empty {
  padding: 24px 0;
  color: var(--ink-400);
  font-size: 11px;
  text-align: center;
}

.message-popover__footer {
  padding-top: 6px;
  border-top: 1px solid var(--line);
  text-align: right;
}
</style>
