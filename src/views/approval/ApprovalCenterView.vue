<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheck, Close, Refresh, Search, Tickets, View } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import {
  approveTask,
  cancelApproval,
  fetchApproval,
  fetchApprovalPage,
  fetchApprovalTodoPage,
  rejectTask,
} from '@/api/approval'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatDateTime } from '@/utils/format'
import { formatMoney } from '@/utils/money'
import {
  APPROVAL_BUSINESS_TYPE,
  APPROVAL_BUSINESS_TYPE_OPTIONS,
  APPROVAL_STATUS,
  APPROVAL_STATUS_OPTIONS,
  approvalBusinessTypeLabel,
  approvalStatusLabel,
} from '@/constants'

/**
 * 流程审批中心（V1.4 流程审批）。
 *
 * 页面包含待办与我的申请两个页签：待办按“指定审批人 / 审批角色”命中，同意或
 * 驳回后由审批中心回调业务服务落地实际变更；我的申请可以查看进度并撤销待审批
 * 的申请。审批档位由财务在“审批定义”页面配置。
 */
const auth = useAuthStore()

const activeTab = ref('todo')
const loading = ref(false)
const loadError = ref('')

const todoPage = ref({ records: [], total: 0, pageNumber: 1, pageSize: 10 })
const minePage = ref({ records: [], total: 0, pageNumber: 1, pageSize: 10 })
const filters = reactive({
  businessType: '',
  status: '',
  page: 1,
  size: 10,
})

const detailVisible = ref(false)
const detailTarget = ref(null)
const decisionVisible = ref(false)
const decisionSaving = ref(false)
const decisionError = ref('')
const decisionAction = ref('approve')
const decisionTask = ref(null)
const decisionComment = ref('')

const canApprove = computed(() => auth.hasPermission('approval:approve'))
const canSubmit = computed(() => auth.hasPermission('approval:submit'))

function statusTag(value) {
  return APPROVAL_STATUS[value]?.type || 'info'
}

function businessTypeTag(value) {
  return APPROVAL_BUSINESS_TYPE[value]?.type || 'info'
}

function pendingTask(row) {
  return (row.tasks || []).find((task) => task.status === 'PENDING')
}

function canCancel(row) {
  return canSubmit.value && row.status === 'PENDING'
}

async function loadTodo() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: filters.page, size: filters.size }
    if (filters.businessType) params.businessType = filters.businessType
    const data = await fetchApprovalTodoPage(params)
    todoPage.value = {
      records: data.records || [],
      total: Number(data.total || 0),
      pageNumber: Number(data.pageNumber || 1),
      pageSize: Number(data.pageSize || filters.size),
    }
  } catch (error) {
    loadError.value = errorMessage(error)
    todoPage.value = { ...todoPage.value, records: [], total: 0 }
  } finally {
    loading.value = false
  }
}

async function loadMine() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: filters.page, size: filters.size, mine: true }
    if (filters.businessType) params.businessType = filters.businessType
    if (filters.status) params.status = filters.status
    const data = await fetchApprovalPage(params)
    minePage.value = {
      records: data.records || [],
      total: Number(data.total || 0),
      pageNumber: Number(data.pageNumber || 1),
      pageSize: Number(data.pageSize || filters.size),
    }
  } catch (error) {
    loadError.value = errorMessage(error)
    minePage.value = { ...minePage.value, records: [], total: 0 }
  } finally {
    loading.value = false
  }
}

function refreshCurrent() {
  return activeTab.value === 'todo' ? loadTodo() : loadMine()
}

function handleTabChange() {
  loadError.value = ''
  filters.page = 1
  refreshCurrent()
}

async function openDetail(row) {
  try {
    detailTarget.value = await fetchApproval(row.id)
    detailVisible.value = true
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

function openDecision(row, action) {
  const task = pendingTask(row)
  if (!task) {
    ElMessage.warning('该审批单没有待处理任务')
    return
  }
  decisionTask.value = { task, instance: row }
  decisionAction.value = action
  decisionComment.value = ''
  decisionError.value = ''
  decisionVisible.value = true
}

async function submitDecision() {
  if (decisionAction.value === 'reject' && !decisionComment.value.trim()) {
    decisionError.value = '驳回时必须填写审批意见'
    return
  }
  decisionSaving.value = true
  decisionError.value = ''
  try {
    const taskId = decisionTask.value.task.id
    if (decisionAction.value === 'approve') {
      await approveTask(taskId, decisionComment.value.trim() || null)
      ElMessage.success('审批已通过，业务变更已落地')
    } else {
      await rejectTask(taskId, decisionComment.value.trim())
      ElMessage.success('已驳回该申请')
    }
    decisionVisible.value = false
    await refreshCurrent()
  } catch (error) {
    decisionError.value = errorMessage(error)
  } finally {
    decisionSaving.value = false
  }
}

async function handleCancel(row) {
  try {
    await ElMessageBox.confirm(`确认撤销申请 ${row.instanceNo}？撤销后需重新提交。`, '撤销申请', {
      confirmButtonText: '撤销',
      cancelButtonText: '返回',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await cancelApproval(row.id)
    ElMessage.success('申请已撤销')
    await refreshCurrent()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

onMounted(async () => {
  if (canApprove.value) {
    await loadTodo()
  } else {
    activeTab.value = 'mine'
    await loadMine()
  }
})
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="APPROVAL · WORKFLOW"
      title="审批中心"
      description="按业务类型与金额档位匹配审批流程；审批通过后由审批中心回调业务服务落地实际变更。"
    >
      <template #actions>
        <el-button :loading="loading" @click="refreshCurrent">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </template>
    </PageHeader>

    <el-alert type="info" :closable="false" show-icon class="section-alert" title="审批口径">
      <template #default>
        金额一律以分存储，档位按“下限含、上限不含”匹配，优先级数字小的先命中；未配置审批流程的业务类型不允许提交申请。
        驳回必须填写意见，申请人可撤销待审批的申请。
      </template>
    </el-alert>

    <el-tabs v-model="activeTab" class="approval-tabs" @tab-change="handleTabChange">
      <el-tab-pane v-if="canApprove" label="我的待办" name="todo">
        <section class="panel filter-panel">
          <el-form :model="filters" class="filter-form" label-position="top" @submit.prevent="loadTodo">
            <el-form-item label="业务类型">
              <el-select v-model="filters.businessType" placeholder="全部类型" clearable>
                <el-option
                  v-for="item in APPROVAL_BUSINESS_TYPE_OPTIONS"
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
            </el-form-item>
          </el-form>
        </section>

        <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />

        <section class="panel table-panel">
          <div class="panel__head">
            <div>
              <span class="panel__eyebrow">MY TODOS</span>
              <h2>共 {{ todoPage.total.toLocaleString('zh-CN') }} 条待办</h2>
            </div>
          </div>

          <el-table v-loading="loading" :data="todoPage.records" class="data-table" row-key="id">
            <el-table-column label="审批单号" min-width="200">
              <template #default="{ row }">
                <div class="cell-primary mono-text">{{ row.instanceNo }}</div>
                <div class="cell-secondary">{{ formatDateTime(row.createdAt) }}</div>
              </template>
            </el-table-column>
            <el-table-column label="业务类型" width="140">
              <template #default="{ row }">
                <el-tag :type="businessTypeTag(row.businessType)" size="small" effect="plain">
                  {{ approvalBusinessTypeLabel(row.businessType) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="申请标题" min-width="240">
              <template #default="{ row }">
                <div class="cell-primary">{{ row.title }}</div>
                <div class="cell-secondary">申请人 {{ row.applicantName || '—' }} · 业务 #{{ row.businessId }}</div>
              </template>
            </el-table-column>
            <el-table-column label="金额" width="130" align="right">
              <template #default="{ row }">
                {{ row.amount == null ? '—' : formatMoney(row.amount) }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="statusTag(row.status)" effect="light">{{ approvalStatusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="190" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openDetail(row)">
                  <el-icon><View /></el-icon>详情
                </el-button>
                <el-button v-if="pendingTask(row)" link type="success" @click="openDecision(row, 'approve')">
                  <el-icon><CircleCheck /></el-icon>同意
                </el-button>
                <el-button v-if="pendingTask(row)" link type="danger" @click="openDecision(row, 'reject')">
                  <el-icon><Close /></el-icon>驳回
                </el-button>
              </template>
            </el-table-column>
            <template #empty>
              <EmptyState title="暂无待办" description="审批任务按指定审批人或审批角色分配到人。" />
            </template>
          </el-table>

          <div class="pagination-row">
            <el-pagination
              background
              layout="sizes, prev, pager, next, total"
              :total="todoPage.total"
              :current-page="todoPage.pageNumber"
              :page-size="todoPage.pageSize"
              :page-sizes="[10, 20, 50, 100]"
              @size-change="(size) => { filters.size = size; filters.page = 1; loadTodo() }"
              @current-change="(page) => { filters.page = page; loadTodo() }"
            />
          </div>
        </section>
      </el-tab-pane>

      <el-tab-pane label="我的申请" name="mine">
        <section class="panel filter-panel">
          <el-form :model="filters" class="filter-form" label-position="top" @submit.prevent="loadMine">
            <el-form-item label="业务类型">
              <el-select v-model="filters.businessType" placeholder="全部类型" clearable>
                <el-option
                  v-for="item in APPROVAL_BUSINESS_TYPE_OPTIONS"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="filters.status" placeholder="全部状态" clearable>
                <el-option
                  v-for="item in APPROVAL_STATUS_OPTIONS"
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
            </el-form-item>
          </el-form>
        </section>

        <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />

        <section class="panel table-panel">
          <div class="panel__head">
            <div>
              <span class="panel__eyebrow">MY REQUESTS</span>
              <h2>共 {{ minePage.total.toLocaleString('zh-CN') }} 条申请</h2>
            </div>
          </div>

          <el-table v-loading="loading" :data="minePage.records" class="data-table" row-key="id">
            <el-table-column label="审批单号" min-width="200">
              <template #default="{ row }">
                <div class="cell-primary mono-text">{{ row.instanceNo }}</div>
                <div class="cell-secondary">{{ formatDateTime(row.createdAt) }}</div>
              </template>
            </el-table-column>
            <el-table-column label="业务类型" width="140">
              <template #default="{ row }">
                <el-tag :type="businessTypeTag(row.businessType)" size="small" effect="plain">
                  {{ approvalBusinessTypeLabel(row.businessType) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="申请标题" min-width="240">
              <template #default="{ row }">
                <div class="cell-primary">{{ row.title }}</div>
                <div class="cell-secondary">业务 #{{ row.businessId }}</div>
              </template>
            </el-table-column>
            <el-table-column label="金额" width="130" align="right">
              <template #default="{ row }">
                {{ row.amount == null ? '—' : formatMoney(row.amount) }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag :type="statusTag(row.status)" effect="light">{{ approvalStatusLabel(row.status) }}</el-tag>
                <div v-if="row.resultNote" class="cell-secondary">{{ row.resultNote }}</div>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="170" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openDetail(row)">
                  <el-icon><View /></el-icon>详情
                </el-button>
                <el-button v-if="canCancel(row)" link type="danger" @click="handleCancel(row)">撤销</el-button>
              </template>
            </el-table-column>
            <template #empty>
              <EmptyState title="暂无申请" description="需要审批的变更（如信用额度调整）会在这里显示进度。" />
            </template>
          </el-table>

          <div class="pagination-row">
            <el-pagination
              background
              layout="sizes, prev, pager, next, total"
              :total="minePage.total"
              :current-page="minePage.pageNumber"
              :page-size="minePage.pageSize"
              :page-sizes="[10, 20, 50, 100]"
              @size-change="(size) => { filters.size = size; filters.page = 1; loadMine() }"
              @current-change="(page) => { filters.page = page; loadMine() }"
            />
          </div>
        </section>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="decisionVisible" :title="decisionAction === 'approve' ? '审批同意' : '审批驳回'" width="560px" destroy-on-close>
      <el-alert v-if="decisionError" type="error" :title="decisionError" :closable="false" show-icon class="section-alert" />
      <p v-if="decisionTask" class="dialog-lead">
        {{ decisionTask.instance.instanceNo }} · {{ decisionTask.instance.title }}
      </p>
      <el-form label-position="top">
        <el-form-item :label="decisionAction === 'approve' ? '审批意见（可选）' : '驳回原因（必填）'">
          <el-input
            v-model="decisionComment"
            type="textarea"
            :rows="3"
            maxlength="500"
            :placeholder="decisionAction === 'approve' ? '可补充说明' : '请说明驳回原因，申请人会看到'"
          />
        </el-form-item>
      </el-form>
      <el-alert v-if="decisionAction === 'approve'" type="warning" :closable="false" show-icon title="同意后立即生效">
        <template #default>
          业务动作在结论落库前执行：落地失败时整笔审批回滚，不会出现“审批通过但业务未变更”。
        </template>
      </el-alert>
      <div class="form-actions">
        <el-button
          :type="decisionAction === 'approve' ? 'success' : 'danger'"
          :loading="decisionSaving"
          @click="submitDecision"
        >
          {{ decisionAction === 'approve' ? '确认同意' : '确认驳回' }}
        </el-button>
        <el-button @click="decisionVisible = false">取消</el-button>
      </div>
    </el-dialog>

    <el-dialog v-model="detailVisible" title="审批详情" width="720px" destroy-on-close>
      <template v-if="detailTarget">
        <p class="dialog-lead">
          {{ detailTarget.instanceNo }} · {{ approvalBusinessTypeLabel(detailTarget.businessType) }} ·
          {{ detailTarget.title }} · {{ detailTarget.status === 'APPROVED' ? '已通过' : detailTarget.status === 'REJECTED' ? '已驳回' : detailTarget.status === 'CANCELLED' ? '已撤销' : '待审批' }}
        </p>
        <div class="form-section-title">审批任务</div>
        <el-table :data="detailTarget.tasks || []" class="data-table" size="small">
          <el-table-column label="步骤" width="80">
            <template #default="{ row }">第 {{ row.stepNo }} 步</template>
          </el-table-column>
          <el-table-column label="审批人" min-width="140">
            <template #default="{ row }">{{ row.approverRole || `用户 #${row.approverUserId}` }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              {{ row.status === 'PENDING' ? '待审批' : row.status === 'APPROVED' ? '已同意' : row.status === 'REJECTED' ? '已驳回' : '已跳过' }}
            </template>
          </el-table-column>
          <el-table-column label="意见" min-width="160">
            <template #default="{ row }">{{ row.comment || '—' }}</template>
          </el-table-column>
        </el-table>
        <div class="form-section-title">审批轨迹</div>
        <el-table :data="detailTarget.records || []" class="data-table" size="small">
          <el-table-column label="时间" min-width="170">
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="动作" width="120">
            <template #default="{ row }">
              {{ row.action === 'SUBMIT' ? '提交' : row.action === 'APPROVE' ? '同意' : row.action === 'REJECT' ? '驳回' : '撤销' }}
            </template>
          </el-table-column>
          <el-table-column label="操作人" width="120">
            <template #default="{ row }">{{ row.operatorName || '—' }}</template>
          </el-table-column>
          <el-table-column label="说明" min-width="160">
            <template #default="{ row }">{{ row.comment || '—' }}</template>
          </el-table-column>
        </el-table>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.approval-tabs :deep(.el-tabs__header) {
  margin-bottom: 14px;
}

.dialog-lead {
  margin: 0 0 14px;
  color: var(--ink-600);
  font-size: 12px;
}
</style>
