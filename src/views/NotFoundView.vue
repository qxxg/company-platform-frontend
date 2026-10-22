<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="result-page">
    <div class="result-card">
      <el-result icon="info" title="页面不存在" sub-title="地址可能已变更，或者该功能尚未开放。">
        <template #extra>
          <el-button type="primary" @click="router.push('/dashboard')">返回工作台</el-button>
          <el-button @click="router.back()">返回上一页</el-button>
        </template>
      </el-result>
    </div>
  </div>
</template>
