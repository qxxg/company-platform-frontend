<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Box,
  CircleCheck,
  Cpu,
  DataAnalysis,
  Link,
  Stamp,
  UserFilled,
  Wallet,
  Warning,
} from '@element-plus/icons-vue'
import { ROADMAP_MODULES } from '@/constants'

const route = useRoute()
const router = useRouter()

const icons = { UserFilled, Wallet, Cpu, Box, Stamp, DataAnalysis }
const module = computed(() => ROADMAP_MODULES[route.params.moduleKey] || null)
const icon = computed(() => icons[module.value?.icon] || Box)

const links = [
  { label: '订单列表', path: '/orders' },
  { label: '新建订单', path: '/orders/create' },
  { label: '工厂组织', path: '/system/factories' },
  { label: '角色与权限', path: '/system/permissions' },
]
</script>

<template>
  <div v-if="module" class="roadmap-page" :style="{ '--module-color': module.color }">
    <section class="roadmap-hero">
      <div class="roadmap-hero__icon"><el-icon :size="34"><component :is="icon" /></el-icon></div>
      <div class="roadmap-hero__text">
        <div class="roadmap-hero__eyebrow">
          <span>{{ module.code }}</span>
          <span>{{ module.priority }}</span>
          <span class="roadmap-status">{{ module.status }}</span>
        </div>
        <h1>{{ module.name }}</h1>
        <p>{{ module.summary }}</p>
      </div>
      <div class="roadmap-hero__actions">
        <el-button @click="router.push('/dashboard')">返回工作台</el-button>
      </div>
    </section>

    <div class="roadmap-grid">
      <section class="panel">
        <div class="panel__head">
          <div>
            <span class="panel__eyebrow">SCOPE</span>
            <h2>计划范围</h2>
          </div>
          <el-tag effect="plain" round>V1.4</el-tag>
        </div>
        <ul class="feature-list">
          <li v-for="feature in module.features" :key="feature">
            <span class="feature-list__icon"><el-icon><CircleCheck /></el-icon></span>
            <span>{{ feature }}</span>
          </li>
        </ul>
      </section>

      <section class="panel">
        <div class="panel__head">
          <div>
            <span class="panel__eyebrow">CONSTRAINTS</span>
            <h2>必须遵守的规则</h2>
          </div>
          <el-icon class="panel__head-icon"><Warning /></el-icon>
        </div>
        <ul class="rule-list">
          <li v-for="rule in module.rules" :key="rule">
            <span></span>{{ rule }}
          </li>
        </ul>
        <div class="roadmap-note">
          <el-icon><Link /></el-icon>
          模块设计以 V1.4 主文档和页面权限矩阵为基线，页面入口先保留，避免业务范围在开发中走偏。
        </div>
      </section>
    </div>

    <section class="panel">
      <div class="panel__head">
        <div>
          <span class="panel__eyebrow">AVAILABLE NOW</span>
          <h2>当前可用的基础能力</h2>
        </div>
      </div>
      <div class="quick-link-grid">
        <button v-for="link in links" :key="link.path" class="quick-link" type="button" @click="router.push(link.path)">
          <span>{{ link.label }}</span>
          <el-icon><Link /></el-icon>
        </button>
      </div>
    </section>
  </div>

  <div v-else class="result-page">
    <div class="result-card">
      <el-result icon="info" title="未找到该模块" sub-title="请从侧边栏选择业务模块。">
        <template #extra>
          <el-button type="primary" @click="router.push('/dashboard')">返回工作台</el-button>
        </template>
      </el-result>
    </div>
  </div>
</template>
