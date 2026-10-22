<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Lock } from '@element-plus/icons-vue'
import { PERMISSION_LABELS } from '@/constants'

const route = useRoute()
const router = useRouter()

const permission = computed(() => (typeof route.query.permission === 'string' ? route.query.permission : ''))
const permissionLabel = computed(() => PERMISSION_LABELS[permission.value] || permission.value)
</script>

<template>
  <div class="result-page">
    <div class="result-card">
      <el-result icon="warning" title="没有访问权限">
        <template #sub-title>
          <p>当前账号缺少访问该页面所需的权限。</p>
          <p v-if="permission" class="result-permission">
            <el-icon><Lock /></el-icon>
            <code>{{ permission }}</code>
            <span>{{ permissionLabel }}</span>
          </p>
          <p>请联系系统管理员分配对应角色或权限；权限变更后需要重新登录以获取新的 JWT。</p>
        </template>
        <template #extra>
          <el-button type="primary" @click="router.push('/dashboard')">返回工作台</el-button>
          <el-button @click="router.push('/system/permissions')">查看我的权限</el-button>
        </template>
      </el-result>
    </div>
  </div>
</template>
