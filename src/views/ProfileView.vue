<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { Clock, Key, Lock, SwitchButton, UserFilled } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import { useAuthStore } from '@/stores/auth'
import { ROLE_LABELS, PERMISSION_LABELS, PERMISSION_GROUPS } from '@/constants'
import {
  formatDateTime,
  formatDuration,
  formatUnixSeconds,
  initialsOf,
  maskToken,
} from '@/utils/format'

const auth = useAuthStore()
const router = useRouter()
const now = ref(Date.now())
let timer = null

const remainingSeconds = computed(() => Math.max(0, Math.floor((auth.tokenExpiresAt - now.value) / 1000)))
const remainingText = computed(() => (remainingSeconds.value > 0 ? formatDuration(remainingSeconds.value) : '已过期'))
const sessionHealthy = computed(() => remainingSeconds.value > 0)

const permissionGroups = computed(() =>
  PERMISSION_GROUPS.map((group) => ({
    ...group,
    owned: group.permissions.filter((code) => auth.hasPermission(code)),
  })).filter((group) => group.owned.length),
)

const claims = computed(() => auth.claims || {})

async function logout() {
  try {
    await ElMessageBox.confirm('退出后需要重新通过统一认证登录。', '退出登录', {
      confirmButtonText: '退出登录',
      cancelButtonText: '取消',
      type: 'warning',
    })
    auth.logout()
    router.replace({ name: 'login', query: { reason: 'logout' } })
  } catch {
    // 用户取消。
  }
}

onMounted(() => {
  timer = window.setInterval(() => { now.value = Date.now() }, 30000)
})

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="MY PROFILE"
      title="个人中心"
      description="查看本人档案、角色权限和当前 JWT 会话。密码修改与联系方式维护将在员工档案模块接入。"
    >
      <template #actions>
        <el-button type="danger" plain @click="logout"><el-icon><SwitchButton /></el-icon>退出登录</el-button>
      </template>
    </PageHeader>

    <section class="profile-hero">
      <div class="profile-hero__avatar">{{ initialsOf(auth.displayName) }}</div>
      <div class="profile-hero__identity">
        <span class="profile-hero__kicker">EMPLOYEE PROFILE</span>
        <h1>{{ auth.displayName }}</h1>
        <p>{{ auth.username }} · {{ auth.employeeNo || '员工编号未配置' }}</p>
        <div class="role-strip">
          <el-tag v-for="role in auth.roles" :key="role" effect="plain" round>{{ ROLE_LABELS[role] || role }}</el-tag>
        </div>
      </div>
      <div class="profile-hero__session" :class="{ 'is-expired': !sessionHealthy }">
        <span class="status-pill" :class="sessionHealthy ? 'status-pill--green' : 'status-pill--red'">
          {{ sessionHealthy ? '会话有效' : '会话已过期' }}
        </span>
        <strong>{{ remainingText }}</strong>
        <small>距离访问令牌到期</small>
      </div>
    </section>

    <div class="profile-grid">
      <section class="panel">
        <div class="panel__head">
          <div>
            <span class="panel__eyebrow">ACCOUNT</span>
            <h2>账号信息</h2>
          </div>
          <el-icon class="panel__head-icon"><UserFilled /></el-icon>
        </div>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="用户 ID"><span class="mono-text">{{ auth.userId || '—' }}</span></el-descriptions-item>
          <el-descriptions-item label="用户名">{{ auth.username || '—' }}</el-descriptions-item>
          <el-descriptions-item label="姓名">{{ auth.nickname || '—' }}</el-descriptions-item>
          <el-descriptions-item label="员工编号">{{ auth.employeeNo || '—' }}</el-descriptions-item>
          <el-descriptions-item label="所属工厂">{{ auth.factoryId ? `#${auth.factoryId}` : '总部/未分配' }}</el-descriptions-item>
          <el-descriptions-item label="JWT subject"><span class="mono-text">{{ claims.sub || '—' }}</span></el-descriptions-item>
          <el-descriptions-item label="签发者">{{ claims.iss || '—' }}</el-descriptions-item>
        </el-descriptions>
        <el-button class="wide-button" disabled>
          <el-icon><Lock /></el-icon>修改密码（待接入）
        </el-button>
      </section>

      <section class="panel">
        <div class="panel__head">
          <div>
            <span class="panel__eyebrow">SESSION</span>
            <h2>当前会话</h2>
          </div>
          <el-icon class="panel__head-icon"><Clock /></el-icon>
        </div>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="令牌类型">{{ auth.session?.tokenType || 'Bearer' }}</el-descriptions-item>
          <el-descriptions-item label="签发时间">{{ formatUnixSeconds(claims.iat) }}</el-descriptions-item>
          <el-descriptions-item label="过期时间">{{ formatUnixSeconds(claims.exp) }}</el-descriptions-item>
          <el-descriptions-item label="剩余时间">{{ remainingText }}</el-descriptions-item>
          <el-descriptions-item label="Access Token">
            <span class="mono-text">{{ maskToken(auth.accessToken) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="Scope">
            <span class="mono-text">{{ claims.scope || auth.session?.scope || '—' }}</span>
          </el-descriptions-item>
        </el-descriptions>
        <el-alert
          type="warning"
          :closable="false"
          show-icon
          class="session-alert"
          title="公开客户端不默认签发 refresh_token"
        >
          <template #default>
            访问令牌约 30 分钟有效。到期后接口返回 401，系统会清理会话并引导重新登录。
            生产环境建议通过 BFF + HttpOnly Cookie 改造为无感续期。
          </template>
        </el-alert>
      </section>
    </div>

    <section class="panel">
      <div class="panel__head">
        <div>
          <span class="panel__eyebrow">PERMISSIONS</span>
          <h2>我的权限 · {{ auth.permissions.length }} 项</h2>
        </div>
        <el-button text type="primary" @click="router.push('/system/permissions')">
          <el-icon><Key /></el-icon>权限矩阵
        </el-button>
      </div>
      <div class="owned-permission-groups">
        <div v-for="group in permissionGroups" :key="group.key" class="owned-permission-group">
          <h3>{{ group.title }}</h3>
          <div class="role-strip">
            <el-tag v-for="code in group.owned" :key="code" effect="plain" round>
              {{ PERMISSION_LABELS[code] || code }}
            </el-tag>
          </div>
        </div>
        <p v-if="!permissionGroups.length" class="muted-text">当前账号尚未分配业务权限。</p>
      </div>
    </section>
  </div>
</template>
