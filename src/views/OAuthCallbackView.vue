<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { CircleCheck, Lock, Loading, Warning } from '@element-plus/icons-vue'
import BrandMark from '@/components/BrandMark.vue'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const step = ref(1)
const error = ref('')
const errorDetail = ref('')

function queryValue(key) {
  const value = route.query[key]
  return Array.isArray(value) ? value[0] : value
}

async function complete() {
  const oauthError = queryValue('error')
  if (oauthError) {
    error.value = '认证中心返回了错误'
    errorDetail.value = queryValue('error_description') || oauthError
    return
  }

  const code = queryValue('code')
  const state = queryValue('state')
  if (!code || !state) {
    error.value = '登录回调参数不完整'
    errorDetail.value = '未找到授权码或 state，请返回登录页重新发起登录。'
    return
  }

  step.value = 2
  try {
    const redirect = await auth.completeLogin(code, state)
    step.value = 3
    ElMessage.success({ message: `欢迎回来，${auth.displayName}`, duration: 1200 })
    window.setTimeout(() => {
      router.replace(redirect === '/login' ? '/dashboard' : redirect)
    }, 220)
  } catch (exception) {
    step.value = 1
    error.value = '登录未完成'
    errorDetail.value = exception?.message || '令牌交换失败，请检查认证中心与浏览器网络。'
    auth.clearSession()
  }
}

function backToLogin() {
  router.replace({ name: 'login', query: { reason: 'login-required' } })
}

onMounted(complete)
</script>

<template>
  <div class="callback-page">
    <div class="callback-card">
      <BrandMark :size="48" />
      <template v-if="!error">
        <div class="callback-card__head">
          <span class="login-kicker">SECURE CALLBACK</span>
          <h1>{{ step === 3 ? '登录成功，正在进入工作台' : '正在完成统一认证' }}</h1>
          <p>认证中心已返回授权码，本页面正在使用 PKCE verifier 交换访问令牌。</p>
        </div>

        <div class="callback-steps">
          <div class="callback-step" :class="{ 'is-done': step >= 1 }">
            <span class="callback-step__icon">
              <el-icon><CircleCheck v-if="step > 1" /><Lock v-else /></el-icon>
            </span>
            <div><strong>获取授权码</strong><small>redirect_uri 与 state 已校验</small></div>
          </div>
          <div class="callback-step" :class="{ 'is-done': step >= 2, 'is-active': step === 2 }">
            <span class="callback-step__icon">
              <el-icon class="is-spinning" v-if="step === 2"><Loading /></el-icon>
              <el-icon v-else><CircleCheck /></el-icon>
            </span>
            <div><strong>交换访问令牌</strong><small>code + code_verifier → access_token</small></div>
          </div>
          <div class="callback-step" :class="{ 'is-done': step >= 3 }">
            <span class="callback-step__icon">
              <el-icon><CircleCheck /></el-icon>
            </span>
            <div><strong>建立本地会话</strong><small>写入 JWT 并加载权限声明</small></div>
          </div>
        </div>

        <div class="callback-progress">
          <span :style="{ width: `${(step / 3) * 100}%` }"></span>
        </div>
      </template>

      <template v-else>
        <el-result icon="error" :title="error" :sub-title="errorDetail">
          <template #extra>
            <el-button type="primary" @click="backToLogin">返回登录页</el-button>
          </template>
        </el-result>
        <div class="callback-error-tip">
          <el-icon><Warning /></el-icon>
          <span>若问题持续出现，请检查认证中心 9000 端口、OAuth2 回调地址和浏览器控制台中的 CORS 信息。</span>
        </div>
      </template>
    </div>
  </div>
</template>
