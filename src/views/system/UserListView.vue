<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Refresh, Search, View } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import { fetchFactories, fetchUsers } from '@/api/system'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatDateTime, initialsOf } from '@/utils/format'

const auth = useAuthStore()

const loading = ref(false)
const loadError = ref('')
const users = ref([])
const factories = ref([])
const selectedUser = ref(null)
const dialogVisible = ref(false)

const filters = reactive({
  keyword: '',
  factoryId: '',
  status: '',
})

const canListFactories = computed(() => auth.hasPermission('system:factory:list'))

const filteredUsers = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()
  return users.value.filter((user) => {
    if (filters.factoryId && String(user.factoryId) !== String(filters.factoryId)) return false
    if (filters.status && String(user.status) !== filters.status) return false
    if (!keyword) return true
    return [user.username, user.nickname, user.employeeNo]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword))
  })
})

const enabledCount = computed(() => users.value.filter((user) => user.status === 1).length)

function factoryName(factoryId) {
  const match = factories.value.find((item) => String(item.id) === String(factoryId))
  return match?.name || (factoryId ? `工厂 #${factoryId}` : '总部/未分配')
}

function resetFilters() {
  filters.keyword = ''
  filters.factoryId = ''
  filters.status = ''
}

function openDetail(user) {
  selectedUser.value = user
  dialogVisible.value = true
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const tasks = [fetchUsers()]
    if (canListFactories.value) tasks.push(fetchFactories())
    const [userData, factoryData] = await Promise.all(tasks)
    users.value = userData || []
    if (factoryData) factories.value = factoryData
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
      eyebrow="SYSTEM · ACCOUNTS"
      title="用户账号"
      description="查看统一认证账号、员工编号与所属工厂。账号的新增、停用、重置密码将在系统管理模块补齐。"
    >
      <template #actions>
        <el-button :loading="loading" @click="load"><el-icon><Refresh /></el-icon>刷新</el-button>
      </template>
    </PageHeader>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      class="section-alert"
      title="当前为只读查询"
    >
      <template #default>
        用户数据来自认证库 sys_user；角色与权限由 sys_role、sys_permission 关联维护。
        本版本尚未开放前端新增账号和改密接口，避免在权限模型未完成前产生不可审计的账号变更。
      </template>
    </el-alert>

    <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />

    <section class="mini-stats">
      <div><span>账号总数</span><strong>{{ users.length }}</strong></div>
      <div><span>启用账号</span><strong>{{ enabledCount }}</strong></div>
      <div><span>停用账号</span><strong>{{ users.length - enabledCount }}</strong></div>
      <div><span>筛选结果</span><strong>{{ filteredUsers.length }}</strong></div>
    </section>

    <section class="panel filter-panel">
      <div class="simple-filter-row">
        <el-input
          v-model="filters.keyword"
          placeholder="搜索用户名、姓名或员工编号"
          clearable
          class="simple-filter-row__search"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-if="canListFactories" v-model="filters.factoryId" placeholder="全部工厂" clearable>
          <el-option
            v-for="factory in factories"
            :key="factory.id"
            :label="factory.name"
            :value="String(factory.id)"
          />
        </el-select>
        <el-select v-model="filters.status" placeholder="全部状态" clearable>
          <el-option label="启用" value="1" />
          <el-option label="停用" value="0" />
        </el-select>
        <el-button @click="resetFilters">重置</el-button>
      </div>
    </section>

    <section class="panel table-panel">
      <div class="panel__head">
        <div>
          <span class="panel__eyebrow">ACCOUNT DIRECTORY</span>
          <h2>账号目录</h2>
        </div>
        <span class="table-panel__meta">共 {{ filteredUsers.length }} 条</span>
      </div>

      <el-table v-loading="loading" :data="filteredUsers" row-key="id" class="data-table">
        <el-table-column label="用户名" min-width="150">
          <template #default="{ row }">
            <div class="user-cell">
              <span class="user-cell__avatar">{{ initialsOf(row.nickname || row.username || '?') }}</span>
              <div>
                <strong>{{ row.username }}</strong>
                <small>{{ row.nickname || '未设置姓名' }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="employeeNo" label="员工编号" width="140">
          <template #default="{ row }">{{ row.employeeNo || '—' }}</template>
        </el-table-column>
        <el-table-column label="所属工厂" min-width="150">
          <template #default="{ row }">{{ factoryName(row.factoryId) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" effect="light" round>
              {{ row.status === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="openDetail(row)">
              <el-icon><View /></el-icon>详情
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="没有匹配的账号" description="调整搜索或筛选条件后再试。" icon="Search" />
        </template>
      </el-table>
    </section>

    <el-dialog v-model="dialogVisible" title="账号详情" width="520px">
      <el-descriptions v-if="selectedUser" :column="1" border>
        <el-descriptions-item label="用户名">{{ selectedUser.username }}</el-descriptions-item>
        <el-descriptions-item label="姓名">{{ selectedUser.nickname || '—' }}</el-descriptions-item>
        <el-descriptions-item label="员工编号">{{ selectedUser.employeeNo || '—' }}</el-descriptions-item>
        <el-descriptions-item label="所属工厂">{{ factoryName(selectedUser.factoryId) }}</el-descriptions-item>
        <el-descriptions-item label="账号状态">{{ selectedUser.status === 1 ? '启用' : '停用' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDateTime(selectedUser.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ formatDateTime(selectedUser.updatedAt) }}</el-descriptions-item>
        <el-descriptions-item label="用户 ID"><span class="mono-text">{{ selectedUser.id }}</span></el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button @click="dialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>
