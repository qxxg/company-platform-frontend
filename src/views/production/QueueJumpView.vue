<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh, Search, Tickets } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import { fetchJumpRequestPage } from '@/api/production'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatDateTime } from '@/utils/format'
import { QUEUE_JUMP_STATUS, QUEUE_JUMP_STATUS_OPTIONS, queueJumpStatusLabel } from '@/constants'

/**
 * 插队申请记录（V1.4 设备管理）。
 *
 * 插队审批已迁入统一审批中心：销售提交申请后，审批单进入厂长的「我的待办」，
 * 审批通过后订单服务重排设备队列并给被顺延业务员发送站内消息。本页面只读，
 * 用于跟踪申请进度与审批结论。
 */
const auth = useAuthStore()
const router = useRouter()

const loading = ref(false)
const loadError = ref('')
const pageData = ref({ records: [], total: 0, pageNumber: 1, pageSize: 10 })

const filters = reactive({
  keyword: '',
  status: '',
  page: 1,
  size: 10,
})

const canApprove = computed(() => auth.hasPermission('approval:approve'))
const hasFilters = computed(() => Boolean(filters.keyword || filters.status))

function statusTag(value) {
  return QUEUE_JUMP_STATUS[value]?.type || 'info'
}

async function loadRequests() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: filters.page, size: filters.size }
    if (filters.status) params.status = filters.status
    const data = await fetchJumpRequestPage(params)
    pageData.value = {
      records: data.records || [],
      total: Number(data.total || 0),
      pageNumber: Number(data.pageNumber || 1),
      pageSize: Number(data.pageSize || filters.size),
    }
  } catch (error) {
    loadError.value = errorMessage(error)
    pageData.value = { ...pageData.value, records: [], total: 0 }
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  filters.page = 1
  loadRequests()
}

function resetFilters() {
  filters.keyword = ''
  filters.status = ''
  filters.page = 1
  loadRequests()
}

function goApprovalCenter() {
  router.push('/approval')
}

onMounted(loadRequests)
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="PRODUCTION · QUEUE JUMP"
      title="插队申请记录"
      description="插队申请已纳入统一审批中心：销售提交后进入厂长待办，审批通过即重排设备队列并通知被顺延业务员。"
    >
      <template #actions>
        <el-button :loading="loading" @click="loadRequests">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button v-if="canApprove" type="primary" @click="goApprovalCenter">
          <el-icon><Tickets /></el-icon>去审批中心
        </el-button>
      </template>
    </PageHeader>

    <el-alert type="info" :closable="false" show-icon class="section-alert" title="审批口径">
      <template #default>
        申请状态由审批中心回写：待审批 → 已通过 / 已驳回 / 已撤销。审批动作在「审批中心 · 我的待办」完成，
        本页面只读；系统不做经济补偿，被顺延工单的业务员会收到站内消息。
      </template>
    </el-alert>

    <section class="panel filter-panel">
      <el-form :model="filters" class="filter-form" label-position="top" @submit.prevent="handleSearch">
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部状态" clearable>
            <el-option
              v-for="item in QUEUE_JUMP_STATUS_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item class="filter-form__actions">
          <el-button type="primary" native-type="submit" :loading="loading">
            <el-icon><Search /></el-icon>查询
          </el-button>
          <el-button :disabled="!hasFilters" @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
      <div class="filter-hint">
        <span>销售只能看到自己发起的申请，厂长看本厂，管理员看全部。</span>
        <span>审批结论与审批轨迹在审批中心的申请详情中查看。</span>
      </div>
    </section>

    <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />

    <section class="panel table-panel">
      <div class="panel__head">
        <div>
          <span class="panel__eyebrow">QUEUE JUMP REQUESTS</span>
          <h2>共 {{ pageData.total.toLocaleString('zh-CN') }} 条插队申请</h2>
        </div>
        <span class="table-panel__meta">队列位置从 1 开始</span>
      </div>

      <el-table v-loading="loading" :data="pageData.records" class="data-table" row-key="id">
        <el-table-column label="申请单号" min-width="200">
          <template #default="{ row }">
            <div class="cell-primary mono-text">{{ row.requestNo }}</div>
            <div class="cell-secondary">提交 {{ formatDateTime(row.createdAt) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="工单 / 订单" min-width="200">
          <template #default="{ row }">
            <div class="mono-text">{{ row.workOrderNo || `工单 #${row.workOrderId}` }}</div>
            <div v-if="row.orderNo" class="cell-secondary">订单 {{ row.orderNo }}</div>
          </template>
        </el-table-column>
        <el-table-column label="设备" min-width="160">
          <template #default="{ row }">
            <div class="mono-text">{{ row.deviceNo || `设备 #${row.deviceId}` }}</div>
          </template>
        </el-table-column>
        <el-table-column label="位置变化" width="130" align="center">
          <template #default="{ row }">
            <span class="muted-text">第 {{ row.currentPosition ?? '—' }} 位</span>
            <span class="muted-text"> → </span>
            <strong>第 {{ row.targetPosition }} 位</strong>
          </template>
        </el-table-column>
        <el-table-column label="原因" min-width="200">
          <template #default="{ row }">
            <div class="cell-primary">{{ row.reason }}</div>
            <div v-if="row.approvalRemark" class="cell-secondary">审批意见：{{ row.approvalRemark }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" effect="light">{{ queueJumpStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="审批信息" min-width="170">
          <template #default="{ row }">
            <template v-if="row.approvedAt">
              <div>{{ formatDateTime(row.approvedAt) }}</div>
              <div class="cell-secondary">操作人 #{{ row.approvedBy }} · 顺延 {{ row.displacedCount }} 单</div>
            </template>
            <span v-else class="muted-text">待审批</span>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无插队申请" description="销售可在排产队列页面对排队中的工单发起插队申请。" />
        </template>
      </el-table>

      <div class="pagination-row">
        <el-pagination
          background
          layout="sizes, prev, pager, next, total"
          :total="pageData.total"
          :current-page="pageData.pageNumber"
          :page-size="pageData.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          @size-change="(size) => { filters.size = size; filters.page = 1; loadRequests() }"
          @current-change="(page) => { filters.page = page; loadRequests() }"
        />
      </div>
    </section>
  </div>
</template>
