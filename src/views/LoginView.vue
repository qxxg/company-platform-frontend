<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowRight, Connection, Key, Lock, Monitor } from '@element-plus/icons-vue'
import BrandMark from '@/components/BrandMark.vue'
import { useAuthStore } from '@/stores/auth'
import { getAuthBaseUrl } from '@/utils/oauth'

const auth = useAuthStore()
const route = useRoute()
const loading = ref(false)
const loginError = ref('')

const redirectTarget = computed(() => {
  const value = route.query.redirect
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/dashboard'
})

const notice = computed(() => {
  if (route.query.error) return { type: 'error', text: String(route.query.error) }
  if (route.query.reason === 'expired') return { type: 'warning', text: '登录会话已过期，请重新通过统一认证登录。' }
  if (route.query.reason === 'logout') return { type: 'success', text: '已安全退出当前会话。' }
  if (route.query.reason === 'login-required') return { type: 'info', text: '该页面需要登录后访问，请先完成统一认证。' }
  return null
})

const features = [
  { icon: Lock, title: '统一身份认证', text: 'OAuth2 授权码 + PKCE，令牌由认证中心统一签发' },
  { icon: Connection, title: '微服务网关', text: '网关统一验签、路由与 CORS，业务服务专注领域逻辑' },
  { icon: Monitor, title: '订单分片', text: '双库八表，订单号精确路由，查询自动聚合' },
  { icon: Key, title: '权限到按钮', text: 'JWT 权限声明 + 服务端注解双重校验' },
]

async function startLogin() {
  loginError.value = ''
  loading.value = true
  try {
    await auth.login(redirectTarget.value)
  } catch (error) {
    loginError.value = error?.message || '无法启动登录流程，请检查认证中心是否已启动'
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-atmosphere" aria-hidden="true">
      <span class="login-orb login-orb--one"></span>
      <span class="login-orb login-orb--two"></span>
      <span class="login-grid"></span>
    </div>

    <section class="login-brand">
      <div class="login-brand__top">
        <BrandMark :size="46" />
        <div>
          <strong>公司管理系统</strong>
          <span>COMPANY OPERATIONS PLATFORM</span>
        </div>
      </div>

      <div class="login-brand__hero">
        <span class="login-kicker">V1.4 · PC Web</span>
        <h1>让订单、生产与财务<br /><em>在同一条数据链上运转。</em></h1>
        <p>
          以工厂为交付单元，统一管理客户、合同、订单、设备、仓储与审批。
          所有金额按分截断，所有关键操作留痕，所有权限由认证中心签发。
        </p>
      </div>

      <div class="login-feature-grid">
        <article v-for="feature in features" :key="feature.title" class="login-feature">
          <span class="login-feature__icon"><el-icon :size="18"><component :is="feature.icon" /></el-icon></span>
          <div>
            <strong>{{ feature.title }}</strong>
            <p>{{ feature.text }}</p>
          </div>
        </article>
      </div>

      <div class="login-brand__quote">
        <span>“</span>
        <p>先保证每一笔订单可追溯，再让每一次交付更高效。</p>
      </div>
    </section>

    <section class="login-panel">
      <div class="login-card">
        <div class="login-card__head">
          <span class="login-card__badge">SECURE SIGN IN</span>
          <h2>登录工作台</h2>
          <p>使用公司统一身份认证账号进入系统，登录成功后自动返回当前页面。</p>
        </div>

        <el-alert
          v-if="notice"
          :type="notice.type"
          :title="notice.text"
          :closable="false"
          show-icon
          class="login-notice"
        />
        <el-alert
          v-if="loginError"
          type="error"
          :title="loginError"
          :closable="false"
          show-icon
          class="login-notice"
        />

        <el-button class="login-button" type="primary" size="large" :loading="loading" @click="startLogin">
          <span>{{ loading ? '正在前往认证中心…' : '使用统一身份认证登录' }}</span>
          <el-icon v-if="!loading"><ArrowRight /></el-icon>
        </el-button>

        <div class="login-card__tips">
          <p><el-icon><Lock /></el-icon> 密码仅提交给认证中心，业务页面不接触用户密码。</p>
          <p><el-icon><Key /></el-icon> 公开客户端，不保存 client_secret，使用 PKCE 防止授权码拦截。</p>
        </div>

        <div class="login-card__meta">
          <span>OAuth2 Authorization Code</span>
          <span>PKCE S256</span>
          <span>JWT RS256</span>
        </div>
      </div>

      <div class="login-panel__footer">
        <span>认证中心：{{ getAuthBaseUrl() }}</span>
        <span>开发环境 · 生产部署前请更换默认密码与密钥</span>
      </div>
    </section>
  </div>
</template>
