<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Bell, Check, Refresh, View } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import { fetchMessagePage, markAllMessagesRead, markMessageRead } from '@/api/message'
import { errorMessage } from '@/utils/errors'
import { formatDateTime } from '@/utils/format'
import { MESSAGE_TYPE, messageTypeLabel } from '@/constants'

/**
 * 站内消息中心。
 *
 * 首期消息来源为设备队列插队结果、被顺延通知和设备停机提醒。消息只能由接收
 * 人本人读取和标记已读，不提供删除；点击关联业务会先标记已读再跳转。
 */
const router = useRouter()

const loading = ref(false)
const loadError = ref('')
const unreadOnly = ref(false)
const markingAll = ref(false)
const pageData = ref({
  records: [],
  total: 0,
  pageNumber: 1,
  pageSize: 10,
  unreadCount: 0,
})

const filters = reactive({ page: 1, size: 10 })

const unreadCount = computed(() => Number(pageData.value.unreadCount || 0))

function typeTagType(value) {
  return MESSAGE_TYPE[value]?.type || 'info'
}

function isUnread(row) {
  return row.read !== true
}

async function loadMessages() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await fetchMessagePage({
      page: filters.page,
      size: filters.size,
      unreadOnly: unreadOnly.value,
    })
    pageData.value = {
      records: data.records || [],
      total: Number(data.total || 0),
      pageNumber: Number(data.pageNumber || 1),
      pageSize: Number(data.pageSize || filters.size),
      unreadCount: Number(data.unreadCount || 0),
    }
  } catch (error) {
    loadError.value = errorMessage(error)
    pageData.value = { ...pageData.value, records: [], total: 0 }
  } finally {
    loading.value = false
  }
}

function handleFilterChange() {
  filters.page = 1
  loadMessages()
}

async function markRead(row) {
  if (!isUnread(row)) return
  try {
    await markMessageRead(row.id)
    row.read = true
    pageData.value.unreadCount = Math.max(0, pageData.value.unreadCount - 1)
    if (unreadOnly.value) {
      await loadMessages()
    }
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function openLink(row) {
  if (isUnread(row)) await markRead(row)
  if (row.linkPath) router.push(row.linkPath)
}

async function markAll() {
  if (!unreadCount.value) return
  markingAll.value = true
  try {
    const updated = await markAllMessagesRead()
    ElMessage.success(updated ? `已将 ${updated} 条消息标为已读` : '没有未读消息')
    await loadMessages()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    markingAll.value = false
  }
}

onMounted(loadMessages)
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="MESSAGE CENTER"
      title="消息中心"
      description="查看插队审批结果、排队顺延和设备停机提醒；消息只发送给相关业务员本人。"
    >
      <template #actions>
        <el-button :loading="loading" @click="loadMessages">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button type="primary" :loading="markingAll" :disabled="!unreadCount" @click="markAll">
          <el-icon><Check /></el-icon>全部已读
        </el-button>
      </template>
    </PageHeader>

    <section class="panel filter-panel">
      <el-form class="filter-form" label-position="top">
        <el-form-item label="消息范围">
          <el-radio-group v-model="unreadOnly" @change="handleFilterChange">
            <el-radio-button :value="false">全部消息</el-radio-button>
            <el-radio-button :value="true">仅未读（{{ unreadCount }}）</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item class="filter-form__actions">
          <span class="unread-summary">
            <el-icon><Bell /></el-icon>
            未读 {{ unreadCount }} 条
          </span>
        </el-form-item>
      </el-form>
      <div class="filter-hint">
        <span>点击“查看关联”会先标记已读，再跳转到订单或排产页面。</span>
        <span>消息不提供物理删除，保留业务通知历史。</span>
      </div>
    </section>

    <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />

    <section v-loading="loading" class="message-list">
      <article
        v-for="row in pageData.records"
        :key="row.id"
        class="panel message-card"
        :class="{ 'message-card--unread': isUnread(row) }"
      >
        <div class="message-card__icon" :class="`message-card__icon--${typeTagType(row.messageType)}`">
          <el-icon><Bell /></el-icon>
        </div>
        <div class="message-card__body">
          <div class="message-card__top">
            <el-tag :type="typeTagType(row.messageType)" size="small" effect="plain">
              {{ messageTypeLabel(row.messageType) }}
            </el-tag>
            <span v-if="isUnread(row)" class="unread-dot">未读</span>
            <span class="message-card__time">{{ formatDateTime(row.createdAt) }}</span>
          </div>
          <h3>{{ row.title }}</h3>
          <p>{{ row.content }}</p>
          <div class="message-card__actions">
            <el-button v-if="row.linkPath" link type="primary" @click="openLink(row)">
              <el-icon><View /></el-icon>查看关联
            </el-button>
            <el-button v-if="isUnread(row)" link type="success" @click="markRead(row)">
              <el-icon><Check /></el-icon>标为已读
            </el-button>
            <span v-if="!isUnread(row)" class="muted-text">已读</span>
          </div>
        </div>
      </article>

      <div v-if="!loading && !pageData.records.length" class="panel">
        <EmptyState
          :title="unreadOnly ? '没有未读消息' : '暂无站内消息'"
          description="插队审批、排队顺延和设备停机提醒会出现在这里。"
        />
      </div>
    </section>

    <section v-if="pageData.total > 0" class="panel">
      <div class="pagination-row">
        <el-pagination
          background
          layout="sizes, prev, pager, next, total"
          :total="pageData.total"
          :current-page="pageData.pageNumber"
          :page-size="pageData.pageSize"
          :page-sizes="[10, 20, 50]"
          @size-change="(size) => { filters.size = size; filters.page = 1; loadMessages() }"
          @current-change="(page) => { filters.page = page; loadMessages() }"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.unread-summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #b45309;
  font-size: 12px;
  font-weight: 600;
}

.message-list {
  display: grid;
  gap: 12px;
}

.message-card {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 14px;
  padding: 16px 18px;
}

.message-card--unread {
  border-left: 3px solid #2563eb;
  background: linear-gradient(90deg, #f7faff 0%, #ffffff 48%);
}

.message-card__icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: #eff6ff;
  color: #1d4ed8;
}

.message-card__icon--warning {
  background: #fffbeb;
  color: #b45309;
}

.message-card__icon--danger {
  background: #fef2f2;
  color: #b91c1c;
}

.message-card__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.message-card__time {
  margin-left: auto;
  color: var(--ink-400);
  font-size: 10.5px;
}

.message-card h3 {
  margin: 7px 0 4px;
  color: var(--ink-900);
  font-size: 14px;
}

.message-card p {
  margin: 0;
  color: var(--ink-600);
  font-size: 12px;
  line-height: 1.7;
}

.message-card__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.unread-dot {
  padding: 1px 6px;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 9.5px;
  font-weight: 700;
}
</style>
