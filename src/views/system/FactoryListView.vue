<script setup>
import { computed, onMounted, ref } from 'vue'
import { OfficeBuilding, Refresh, Search, User } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import { fetchFactories, fetchUsers } from '@/api/system'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatDate } from '@/utils/format'

const auth = useAuthStore()
const loading = ref(false)
const loadError = ref('')
const factories = ref([])
const users = ref([])
const keyword = ref('')

const canListUsers = computed(() => auth.hasPermission('system:user:list'))

const filteredFactories = computed(() => {
  const value = keyword.value.trim().toLowerCase()
  if (!value) return factories.value
  return factories.value.filter((factory) =>
    [factory.name, factory.code, factory.address].filter(Boolean).some((text) =>
      String(text).toLowerCase().includes(value),
    ),
  )
})

function employeeCount(factoryId) {
  return users.value.filter((user) => String(user.factoryId) === String(factoryId)).length
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const tasks = [fetchFactories()]
    if (canListUsers.value) tasks.push(fetchUsers())
    const [factoryData, userData] = await Promise.all(tasks)
    factories.value = factoryData || []
    if (userData) users.value = userData
  } catch (error) {
    loadError.value = errorMessage(error)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="SYSTEM · ORGANIZATION"
      title="工厂组织"
      description="组织规则为“公司 → 工厂”，工厂是叶子节点，工厂内部不再设置部门。每个工厂都有独立仓库。"
    >
      <template #actions>
        <el-button :loading="loading" @click="load"><el-icon><Refresh /></el-icon>刷新</el-button>
      </template>
    </PageHeader>

    <el-alert type="info" :closable="false" show-icon class="section-alert" title="组织与数据范围">
      <template #default>
        订单只能归属一个生产工厂，后续拆单也只能在同一工厂的不同设备之间进行。
        当前基础版已提供工厂查询，组织树维护、岗位与员工档案将在系统管理模块继续建设。
      </template>
    </el-alert>

    <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />

    <section class="panel filter-panel">
      <div class="simple-filter-row">
        <el-input v-model="keyword" placeholder="搜索工厂名称、编码或地址" clearable class="simple-filter-row__search">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <span class="filter-count">共 {{ filteredFactories.length }} 个工厂</span>
      </div>
    </section>

    <el-skeleton v-if="loading" :rows="6" animated class="panel" />

    <section v-else-if="filteredFactories.length" class="factory-grid">
      <article v-for="factory in filteredFactories" :key="factory.id" class="factory-card">
        <div class="factory-card__top">
          <div class="factory-card__icon"><el-icon :size="24"><OfficeBuilding /></el-icon></div>
          <el-tag :type="factory.status === 1 ? 'success' : 'info'" effect="light" round>
            {{ factory.status === 1 ? '启用中' : '已停用' }}
          </el-tag>
        </div>
        <div class="factory-card__title">
          <span>{{ factory.code }}</span>
          <h2>{{ factory.name }}</h2>
        </div>
        <p class="factory-card__address">{{ factory.address || '未填写地址' }}</p>
        <div class="factory-card__meta">
          <div>
            <el-icon><User /></el-icon>
            <span>{{ canListUsers ? `${employeeCount(factory.id)} 名员工` : '员工数不可见' }}</span>
          </div>
          <div>
            <el-icon><OfficeBuilding /></el-icon>
            <span>工厂 ID {{ factory.id }}</span>
          </div>
        </div>
        <div class="factory-card__footer">
          <span>创建于 {{ formatDate(factory.createdAt) }}</span>
          <span class="status-pill status-pill--green">叶子节点</span>
        </div>
      </article>
    </section>

    <EmptyState
      v-else
      title="没有匹配的工厂"
      description="尝试更换关键词，或确认工厂基础数据是否已初始化。"
      icon="Search"
    />
  </div>
</template>
