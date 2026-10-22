<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Bell, Connection, Refresh, Search, Warning } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import {
  fetchDeviceAccessLogs,
  fetchDeviceCredentials,
  fetchDeviceImages,
  fetchDeviceOrderReports,
  fetchDeviceReportConfig,
  fetchDeviceReportStaging,
  fetchDeviceTimeSeries,
} from '@/api/production'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatDateTime } from '@/utils/format'
import { formatMoney } from '@/utils/money'

/**
 * 设备数据上报（V1.4 设备上报模块）。
 *
 * 页面展示四类数据：订单作业数据（按订单号唯一，后到覆盖）、订单图片（一条
 * 订单仅一次）、未匹配暂存（订单号精确匹配成功后自动归位）与接入审计；另可按
 * 设备查询 IoTDB 中的自检/心跳时序数据，并查看接入配置概览。
 */
const auth = useAuthStore()

/**
 * 设备测量值按设备口径展示：长度/耗墨 3 位小数，完成率 2 位小数。
 * 后端返回的是截断后的定点值，这里只做等宽展示，不再二次舍入。
 */
function formatMetric(value, digits) {
  if (value === null || value === undefined || value === '') return '—'
  const num = Number(value)
  return Number.isFinite(num) ? num.toFixed(digits) : String(value)
}

const activeTab = ref('reports')
const loading = ref(false)
const loadError = ref('')

const reportRows = ref([])
const reportTotal = ref(0)
const reportFilters = reactive({ deviceNo: '', orderNo: '', page: 1, size: 10 })

const imageRows = ref([])
const imageTotal = ref(0)
const stagingRows = ref([])
const stagingTotal = ref(0)
const logRows = ref([])
const logTotal = ref(0)
const logFilters = reactive({ deviceNo: '', page: 1, size: 10 })
const credentialRows = ref([])
const timeSeries = ref([])
const timeSeriesDevice = ref('')
const timeSeriesMeasurement = ref('temperature')
const config = ref(null)

const canRead = computed(() => auth.hasPermission('production:report:read'))

function loadErrorText(error) {
  return errorMessage(error)
}

async function loadReports() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: reportFilters.page, size: reportFilters.size }
    if (reportFilters.deviceNo.trim()) params.deviceNo = reportFilters.deviceNo.trim()
    if (reportFilters.orderNo.trim()) params.orderNo = reportFilters.orderNo.trim()
    const data = await fetchDeviceOrderReports(params)
    reportRows.value = data.records || []
    reportTotal.value = Number(data.total || 0)
  } catch (error) {
    loadError.value = loadErrorText(error)
    reportRows.value = []
  } finally {
    loading.value = false
  }
}

async function loadImages() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await fetchDeviceImages({ page: 1, size: 20 })
    imageRows.value = data.records || []
    imageTotal.value = Number(data.total || 0)
  } catch (error) {
    loadError.value = loadErrorText(error)
    imageRows.value = []
  } finally {
    loading.value = false
  }
}

async function loadStaging() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await fetchDeviceReportStaging({ page: 1, size: 20 })
    stagingRows.value = data.records || []
    stagingTotal.value = Number(data.total || 0)
  } catch (error) {
    loadError.value = loadErrorText(error)
    stagingRows.value = []
  } finally {
    loading.value = false
  }
}

async function loadLogs() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: logFilters.page, size: logFilters.size }
    if (logFilters.deviceNo.trim()) params.deviceNo = logFilters.deviceNo.trim()
    const data = await fetchDeviceAccessLogs(params)
    logRows.value = data.records || []
    logTotal.value = Number(data.total || 0)
  } catch (error) {
    loadError.value = loadErrorText(error)
    logRows.value = []
  } finally {
    loading.value = false
  }
}

async function loadCredentials() {
  try {
    const data = await fetchDeviceCredentials({ page: 1, size: 20 })
    credentialRows.value = data.records || []
  } catch {
    credentialRows.value = []
  }
}

async function loadConfig() {
  try {
    config.value = await fetchDeviceReportConfig()
  } catch {
    config.value = null
  }
}

async function loadTimeSeries() {
  if (!timeSeriesDevice.value.trim()) {
    ElMessage.warning('请先填写设备编号')
    return
  }
  try {
    timeSeries.value = await fetchDeviceTimeSeries(
      timeSeriesDevice.value.trim(),
      timeSeriesMeasurement.value.trim() || 'temperature',
      20,
    )
  } catch (error) {
    ElMessage.error(loadErrorText(error))
    timeSeries.value = []
  }
}

function handleTabChange(name) {
  loadError.value = ''
  if (name === 'reports') loadReports()
  else if (name === 'images') loadImages()
  else if (name === 'staging') loadStaging()
  else if (name === 'logs') loadLogs()
  else if (name === 'timeseries') loadTimeSeries()
  else if (name === 'config') {
    loadConfig()
    loadCredentials()
  }
}

onMounted(async () => {
  if (!canRead.value) return
  await Promise.all([loadReports(), loadConfig(), loadCredentials()])
})
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="IOT · DEVICE REPORT"
      title="设备数据上报"
      description="设备通过 MQTT 或 CoAP 上报：订单作业数据按订单覆盖，自检/异常落 IoTDB，订单图片一条订单仅一次。"
    >
      <template #actions>
        <el-button :loading="loading" @click="handleTabChange(activeTab)">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </template>
    </PageHeader>

    <el-alert type="info" :closable="false" show-icon class="section-alert" title="上报口径">
      <template #default>
        报文按一机一密做 HMAC-SHA256 验签，时间戳偏差与重复序号都会被拒绝；订单号必须与真实订单精确匹配，
        未匹配的数据先进入暂存等待人工处理。设备上报频率默认 10 秒一次，可在配置文件中调整。
      </template>
    </el-alert>

    <el-tabs v-model="activeTab" class="report-tabs" @tab-change="handleTabChange">
      <el-tab-pane label="订单作业数据" name="reports">
        <section class="panel filter-panel">
          <el-form :model="reportFilters" class="filter-form" label-position="top" @submit.prevent="loadReports">
            <el-form-item label="设备编号">
              <el-input v-model="reportFilters.deviceNo" placeholder="例如 EQ-F001-01" clearable @keyup.enter="loadReports" />
            </el-form-item>
            <el-form-item label="订单号">
              <el-input v-model="reportFilters.orderNo" placeholder="精确订单号" clearable @keyup.enter="loadReports" />
            </el-form-item>
            <el-form-item class="filter-form__actions">
              <el-button type="primary" native-type="submit" :loading="loading">
                <el-icon><Search /></el-icon>查询
              </el-button>
            </el-form-item>
          </el-form>
          <div class="filter-hint">
            <span>同一订单只保留最新一次上报，历史快照不保留。</span>
            <span>长度类字段按设备口径保留 3 位小数，业务单据按 2 位小数截取。</span>
          </div>
        </section>

        <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />

        <section class="panel table-panel">
          <div class="panel__head">
            <div>
              <span class="panel__eyebrow">ORDER REPORTS</span>
              <h2>共 {{ reportTotal.toLocaleString('zh-CN') }} 个订单有设备上报</h2>
            </div>
            <span class="table-panel__meta">覆盖式存储：后到覆盖前到</span>
          </div>

          <el-table v-loading="loading" :data="reportRows" class="data-table" row-key="id">
            <el-table-column label="订单 / 设备" min-width="200">
              <template #default="{ row }">
                <div class="cell-primary mono-text">{{ row.orderNo }}</div>
                <div class="cell-secondary">{{ row.deviceNo }} · 工单 {{ row.workOrderNo || '—' }}</div>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag :type="row.reportStatus === 'finished' ? 'success' : 'primary'" size="small" effect="plain">
                  {{ row.reportStatus || '—' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="进度" min-width="170">
              <template #default="{ row }">
                <div>{{ formatMetric(row.progressMeter, 3) }} 米</div>
                <div class="cell-secondary">已打印 {{ formatMetric(row.printedLengthMeter, 3) }} 米</div>
              </template>
            </el-table-column>
            <el-table-column label="完成率" width="100" align="right">
              <template #default="{ row }">{{ formatMetric(row.progressPercent, 2) }}%</template>
            </el-table-column>
            <el-table-column label="耗墨" width="120" align="right">
              <template #default="{ row }">
                <div>{{ formatMetric(row.inkUsageMl, 3) }} ml</div>
                <div class="cell-secondary">增量 {{ formatMetric(row.inkDeltaMl, 3) }} ml</div>
              </template>
            </el-table-column>
            <el-table-column label="速度 / 剩余" width="130" align="right">
              <template #default="{ row }">
                <div>{{ formatMetric(row.speedMeterPerHour, 3) }} 米/时</div>
                <div class="cell-secondary">剩 {{ row.remainingMinutes ?? '—' }} 分钟</div>
              </template>
            </el-table-column>
            <el-table-column label="图片" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="row.imageUploaded ? 'success' : 'info'" size="small" effect="plain">
                  {{ row.imageUploaded ? '已上传' : '未上传' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="上报时间" min-width="170">
              <template #default="{ row }">
                <div>{{ formatDateTime(row.reportedAt) }}</div>
                <div class="cell-secondary">seq {{ row.deviceSeq ?? '—' }}</div>
              </template>
            </el-table-column>
            <template #empty>
              <EmptyState title="暂无设备上报" description="设备接入 MQTT 或 CoAP 后，订单作业数据会实时出现在这里。" />
            </template>
          </el-table>

          <div class="pagination-row">
            <el-pagination
              background
              layout="sizes, prev, pager, next, total"
              :total="reportTotal"
              :current-page="reportFilters.page"
              :page-size="reportFilters.size"
              :page-sizes="[10, 20, 50, 100]"
              @size-change="(size) => { reportFilters.size = size; reportFilters.page = 1; loadReports() }"
              @current-change="(page) => { reportFilters.page = page; loadReports() }"
            />
          </div>
        </section>
      </el-tab-pane>

      <el-tab-pane label="订单图片" name="images">
        <section class="panel table-panel">
          <div class="panel__head">
            <div>
              <span class="panel__eyebrow">ORDER IMAGES</span>
              <h2>共 {{ imageTotal.toLocaleString('zh-CN') }} 张订单图片</h2>
            </div>
            <span class="table-panel__meta">一条订单仅接受一次图片</span>
          </div>
          <el-table v-loading="loading" :data="imageRows" class="data-table" row-key="id">
            <el-table-column label="图片编号" min-width="180">
              <template #default="{ row }">
                <div class="cell-primary mono-text">{{ row.imageId }}</div>
                <div class="cell-secondary">{{ row.fileName || '—' }}</div>
              </template>
            </el-table-column>
            <el-table-column label="订单" min-width="170">
              <template #default="{ row }">
                <div class="mono-text">{{ row.orderNo }}</div>
                <div class="cell-secondary">{{ row.deviceNo }}</div>
              </template>
            </el-table-column>
            <el-table-column label="OCR 结果" min-width="180">
              <template #default="{ row }">
                <div>{{ row.ocrText || '—' }}</div>
                <div class="cell-secondary">
                  <el-tag :type="row.matched ? 'success' : 'warning'" size="small" effect="plain">
                    {{ row.matched ? '已匹配' : row.ocrStatus }}
                  </el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="大小" width="110" align="right">
              <template #default="{ row }">
                {{ row.sizeBytes ? `${(row.sizeBytes / 1024).toFixed(1)} KB` : '—' }}
              </template>
            </el-table-column>
            <el-table-column label="接收时间" min-width="170">
              <template #default="{ row }">{{ formatDateTime(row.uploadedAt) }}</template>
            </el-table-column>
            <template #empty>
              <EmptyState title="暂无订单图片" description="设备按订单推送一次图片后，这里会出现记录。" />
            </template>
          </el-table>
        </section>
      </el-tab-pane>

      <el-tab-pane label="未匹配暂存" name="staging">
        <section class="panel table-panel">
          <div class="panel__head">
            <div>
              <span class="panel__eyebrow">STAGING</span>
              <h2>共 {{ stagingTotal.toLocaleString('zh-CN') }} 条待处理数据</h2>
            </div>
            <span class="table-panel__meta">订单号精确匹配成功后自动归位</span>
          </div>
          <el-table v-loading="loading" :data="stagingRows" class="data-table" row-key="id">
            <el-table-column label="设备" min-width="160">
              <template #default="{ row }">
                <div class="mono-text">{{ row.deviceNo }}</div>
                <div class="cell-secondary">{{ row.msgType }}</div>
              </template>
            </el-table-column>
            <el-table-column label="原始订单号" min-width="200">
              <template #default="{ row }">
                <el-tag type="warning" size="small" effect="plain">{{ row.rawOrderNo || '（缺失）' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="接收时间" min-width="170">
              <template #default="{ row }">{{ formatDateTime(row.receivedAt) }}</template>
            </el-table-column>
            <template #empty>
              <EmptyState title="没有待处理数据" description="所有上报数据的订单号都已精确匹配。" />
            </template>
          </el-table>
        </section>
      </el-tab-pane>

      <el-tab-pane label="接入审计" name="logs">
        <section class="panel filter-panel">
          <el-form :model="logFilters" class="filter-form" label-position="top" @submit.prevent="loadLogs">
            <el-form-item label="设备编号">
              <el-input v-model="logFilters.deviceNo" placeholder="例如 EQ-F001-01" clearable @keyup.enter="loadLogs" />
            </el-form-item>
            <el-form-item class="filter-form__actions">
              <el-button type="primary" native-type="submit" :loading="loading">
                <el-icon><Search /></el-icon>查询
              </el-button>
            </el-form-item>
          </el-form>
        </section>

        <section class="panel table-panel">
          <div class="panel__head">
            <div>
              <span class="panel__eyebrow">ACCESS LOG</span>
              <h2>共 {{ logTotal.toLocaleString('zh-CN') }} 条接入记录</h2>
            </div>
            <span class="table-panel__meta">回执码 0 表示成功</span>
          </div>
          <el-table v-loading="loading" :data="logRows" class="data-table" row-key="id">
            <el-table-column label="设备 / 类型" min-width="180">
              <template #default="{ row }">
                <div class="cell-primary mono-text">{{ row.deviceNo || '—' }}</div>
                <div class="cell-secondary">{{ row.msgType }} · {{ row.transport }} · seq {{ row.deviceSeq ?? '—' }}</div>
              </template>
            </el-table-column>
            <el-table-column label="结果" width="120">
              <template #default="{ row }">
                <el-tag :type="row.resultCode === 0 ? 'success' : 'warning'" size="small" effect="plain">
                  {{ row.resultCode }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="说明" min-width="220">
              <template #default="{ row }">{{ row.resultMessage || '—' }}</template>
            </el-table-column>
            <el-table-column label="订单匹配" width="110" align="center">
              <template #default="{ row }">
                <el-tag :type="row.matched ? 'success' : 'info'" size="small" effect="plain">
                  {{ row.matched ? '已匹配' : '未匹配' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="时间" min-width="170">
              <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
            </el-table-column>
            <template #empty>
              <EmptyState title="暂无接入记录" description="设备上报后会在这里留下验签与处理结果。" />
            </template>
          </el-table>
        </section>
      </el-tab-pane>

      <el-tab-pane label="时序数据" name="timeseries">
        <section class="panel filter-panel">
          <el-form class="filter-form" label-position="top" @submit.prevent="loadTimeSeries">
            <el-form-item label="设备编号">
              <el-input v-model="timeSeriesDevice" placeholder="例如 EQ-F001-01" clearable />
            </el-form-item>
            <el-form-item label="测点">
              <el-input v-model="timeSeriesMeasurement" placeholder="temperature" clearable />
            </el-form-item>
            <el-form-item class="filter-form__actions">
              <el-button type="primary" native-type="submit" :loading="loading">
                <el-icon><Search /></el-icon>查询 IoTDB
              </el-button>
            </el-form-item>
          </el-form>
          <div class="filter-hint">
            <span>自检、异常/故障与心跳写入 Apache IoTDB，测点按设备建 schema。</span>
            <span>常用测点：temperature、ink_level_percent、work_state、fault_code。</span>
          </div>
        </section>

        <section class="panel table-panel">
          <div class="panel__head">
            <div>
              <span class="panel__eyebrow">TIME SERIES</span>
              <h2>共 {{ timeSeries.length }} 条时序记录</h2>
            </div>
            <span class="table-panel__meta">数据源：Apache IoTDB</span>
          </div>
          <el-table :data="timeSeries" class="data-table" row-key="timestamp">
            <el-table-column label="时间" min-width="190">
              <template #default="{ row }">{{ formatDateTime(new Date(Number(row.timestamp))) }}</template>
            </el-table-column>
            <el-table-column label="测点值" min-width="160">
              <template #default="{ row }">{{ row.value }}</template>
            </el-table-column>
            <template #empty>
              <EmptyState title="暂无时序数据" description="设备上报自检、异常或心跳后，这里会显示 IoTDB 中的测点。" />
            </template>
          </el-table>
        </section>
      </el-tab-pane>

      <el-tab-pane label="接入配置" name="config">
        <section class="panel table-panel">
          <div class="panel__head">
            <div>
              <span class="panel__eyebrow">ACCESS CONFIG</span>
              <h2>设备接入凭据与配置</h2>
            </div>
            <span class="table-panel__meta">配置模板：config/application-iot.yml</span>
          </div>

          <div v-if="config" class="config-grid">
            <div class="config-card">
              <div class="config-card__title"><el-icon><Connection /></el-icon>MQTT</div>
              <div class="config-line">Broker：{{ config.mqtt.host }}:{{ config.mqtt.port }}</div>
              <div class="config-line">订单 Topic：{{ config.mqtt.orderTopic }}</div>
              <div class="config-line">图片 Topic：{{ config.mqtt.imageTopic }}</div>
              <div class="config-line">自检/故障 Topic：{{ config.mqtt.selfcheckTopic }} / {{ config.mqtt.faultTopic }}</div>
              <div class="config-line">回执 Topic：{{ config.mqtt.ackTopic }}</div>
            </div>
            <div class="config-card">
              <div class="config-card__title"><el-icon><Bell /></el-icon>CoAP 与报文</div>
              <div class="config-line">CoAP：{{ config.coap.host }}:{{ config.coap.port }}</div>
              <div class="config-line">报文版本：{{ config.payload.version }} · {{ config.payload.signAlgorithm }}</div>
              <div class="config-line">重放窗口：{{ config.payload.replayWindowSeconds }} 秒</div>
              <div class="config-line">去重窗口：{{ config.payload.dedupeWindowSeconds }} 秒</div>
              <div class="config-line">图片上限：{{ config.image.maxSizeMb }} MB</div>
            </div>
            <div class="config-card">
              <div class="config-card__title"><el-icon><Warning /></el-icon>OCR 与 IoTDB</div>
              <div class="config-line">订单号前缀：{{ config.ocr.orderNoPrefix || '（不校验）' }}</div>
              <div class="config-line">订单号正则：{{ config.ocr.orderNoPattern || '（不校验）' }}</div>
              <div class="config-line">置信度阈值：{{ config.ocr.confidenceThreshold }}</div>
              <div class="config-line">IoTDB：{{ config.iotdb.host }}:{{ config.iotdb.port }} · {{ config.iotdb.database }}</div>
              <div class="config-line">上报频率：订单 {{ config.frequency.orderSeconds }} 秒 / 状态 {{ config.frequency.statusSeconds }} 秒</div>
            </div>
          </div>

          <div class="form-section-title">设备接入凭据（一机一密）</div>
          <el-table :data="credentialRows" class="data-table" row-key="id">
            <el-table-column label="设备编号" min-width="160">
              <template #default="{ row }">
                <span class="mono-text">{{ row.deviceNo }}</span>
              </template>
            </el-table-column>
            <el-table-column label="密钥" min-width="160">
              <template #default="{ row }">
                <span class="mono-text">{{ row.secretMasked }}</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.enabled ? 'success' : 'info'" size="small" effect="plain">
                  {{ row.enabled ? '启用' : '停用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="备注" min-width="180">
              <template #default="{ row }">{{ row.remark || '—' }}</template>
            </el-table-column>
            <el-table-column label="更新时间" min-width="170">
              <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
            </el-table-column>
            <template #empty>
              <EmptyState title="暂无设备凭据" description="为设备签发一机一密密钥后，设备才能上报。" />
            </template>
          </el-table>
        </section>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.report-tabs :deep(.el-tabs__header) {
  margin-bottom: 14px;
}

.config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
  margin-bottom: 6px;
}

.config-card {
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fbfcfe;
}

.config-card__title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  color: var(--ink-900);
  font-size: 13px;
  font-weight: 700;
}

.config-line {
  color: var(--ink-500);
  font-size: 11px;
  line-height: 1.8;
}
</style>
