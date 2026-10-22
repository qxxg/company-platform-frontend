<script setup>
import { nextTick, onMounted, ref } from 'vue'
import { ChatDotRound, Cpu, MagicStick, Promotion, Refresh } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import { chatWithAssistant, fetchAssistantStatus } from '@/api/ai'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { initialsOf } from '@/utils/format'

/**
 * AI 助手页面。
 *
 * 只读对话：模型可以查询订单、应收、报销、借款和审批待办，但不能审批、
 * 付款或修改任何数据。会话标识保存在当前页面内；点击“新会话”会清空
 * 浏览器上下文并生成新的 sessionId，避免长期对话把 8K 上下文撑满。
 */
const auth = useAuthStore()

const SAMPLE_PROMPTS = [
  '我今天有哪些审批待办？',
  '当前应收账款和逾期情况如何？',
  '最近订单情况怎么样？',
  '本月费用报销和借款情况如何？',
]

const sessionId = ref(newSessionId())
const draft = ref('')
const loading = ref(false)
const messages = ref([greeting()])
const status = ref({ model: '本地 Qwen', note: '' })
const streamRef = ref(null)
let nextMessageId = 2

function newSessionId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  } catch {
    // 内网 HTTP 可能不是安全上下文，crypto.randomUUID 不可用时退回时间戳。
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function greeting() {
  return {
    id: 1,
    role: 'assistant',
    content:
      '你好，我是公司管理系统的 AI 助手。我可以查询你权限范围内的订单、应收、报销、借款和审批待办。' +
      '我只读，不会替你审批、付款或修改数据。',
    toolCalls: [],
  }
}

function resetSession() {
  if (loading.value) return
  sessionId.value = newSessionId()
  draft.value = ''
  messages.value = [greeting()]
  nextMessageId = 2
  nextTick(scrollToBottom)
}

function usePrompt(prompt) {
  if (loading.value) return
  draft.value = prompt
  send()
}

async function send(text = draft.value) {
  const content = text.trim()
  if (!content || loading.value) return
  messages.value.push({ id: nextMessageId++, role: 'user', content })
  draft.value = ''
  loading.value = true
  await nextTick(scrollToBottom)
  try {
    const result = await chatWithAssistant({ message: content, sessionId: sessionId.value })
    sessionId.value = result.sessionId || sessionId.value
    messages.value.push({
      id: nextMessageId++,
      role: 'assistant',
      content: result.answer,
      toolCalls: result.toolCalls || [],
      elapsedMs: result.elapsedMs,
    })
  } catch (error) {
    messages.value.push({
      id: nextMessageId++,
      role: 'assistant',
      content: `抱歉，本次查询没有完成：${errorMessage(error)}`,
      toolCalls: [],
      failed: true,
    })
  } finally {
    loading.value = false
    await nextTick(scrollToBottom)
  }
}

function handleKeydown(event) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  send()
}

function scrollToBottom() {
  const element = streamRef.value
  if (element) element.scrollTop = element.scrollHeight
}

function elapsedLabel(message) {
  if (!message.elapsedMs) return ''
  return `${(message.elapsedMs / 1000).toFixed(1)} 秒`
}

onMounted(async () => {
  try {
    const value = await fetchAssistantStatus()
    if (value) status.value = value
  } catch {
    // 状态查询失败不阻塞对话；真正发送时会给出明确错误。
  }
})
</script>

<template>
  <div class="assistant-page">
    <PageHeader
      eyebrow="AI · READ ONLY"
      title="AI 助手"
      description="基于本地 Ollama 模型和 AgentScope 的只读助手。业务查询仍使用你当前的 JWT、权限和数据范围。"
    >
      <template #actions>
        <el-tag class="model-tag" effect="plain" type="success">
          <el-icon><Cpu /></el-icon>
          {{ status.model }}
        </el-tag>
        <el-button :icon="Refresh" :disabled="loading" @click="resetSession">新会话</el-button>
      </template>
    </PageHeader>

    <section class="assistant-shell">
      <div ref="streamRef" class="assistant-stream">
        <div v-if="messages.length === 1" class="prompt-panel">
          <div class="prompt-panel__icon">
            <el-icon><MagicStick /></el-icon>
          </div>
          <div>
            <strong>可以从这些问法开始</strong>
            <div class="prompt-grid">
              <button v-for="prompt in SAMPLE_PROMPTS" :key="prompt" type="button" class="prompt-chip" @click="usePrompt(prompt)">
                {{ prompt }}
              </button>
            </div>
          </div>
        </div>

        <div v-for="message in messages" :key="message.id" class="message" :class="`message--${message.role}`">
          <div class="message__avatar" :class="{ 'message__avatar--user': message.role === 'user' }">
            <template v-if="message.role === 'assistant'">
              <el-icon><ChatDotRound /></el-icon>
            </template>
            <template v-else>{{ initialsOf(auth.displayName) }}</template>
          </div>
          <div class="message__body">
            <div class="message__meta">
              <strong>{{ message.role === 'assistant' ? 'AI 助手' : auth.displayName }}</strong>
              <span v-if="message.role === 'assistant' && message.elapsedMs">{{ elapsedLabel(message) }}</span>
              <span v-if="message.failed" class="message__failed">查询失败</span>
            </div>
            <div class="message__bubble" :class="{ 'message__bubble--failed': message.failed }">
              {{ message.content }}
            </div>
            <div v-if="message.toolCalls?.length" class="tool-strip">
              <span class="tool-strip__label">已查询</span>
              <el-tag
                v-for="(tool, toolIndex) in message.toolCalls"
                :key="`${message.id}-${toolIndex}`"
                size="small"
                effect="plain"
                :type="tool.success ? 'success' : 'warning'"
              >
                {{ tool.label }}
              </el-tag>
            </div>
          </div>
        </div>

        <div v-if="loading" class="message message--assistant">
          <div class="message__avatar">
            <el-icon><ChatDotRound /></el-icon>
          </div>
          <div class="message__body">
            <div class="message__meta"><strong>AI 助手</strong><span>正在思考</span></div>
            <div class="message__bubble message__bubble--thinking">
              <span class="thinking-dot"></span>
              <span class="thinking-dot"></span>
              <span class="thinking-dot"></span>
              本地模型推理较慢，请稍候
            </div>
          </div>
        </div>
      </div>

      <div class="assistant-composer">
        <el-input
          v-model="draft"
          type="textarea"
          :rows="3"
          maxlength="2000"
          show-word-limit
          resize="none"
          placeholder="问订单、应收、报销、借款或审批待办…… Enter 发送，Shift + Enter 换行"
          @keydown="handleKeydown"
        />
        <div class="composer-footer">
          <span class="composer-hint">
            <el-icon><Cpu /></el-icon>
            只读 · 不执行审批、付款或改数据
          </span>
          <el-button type="primary" :icon="Promotion" :loading="loading" :disabled="!draft.trim()" @click="send()">
            发送
          </el-button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.assistant-page {
  max-width: 1180px;
  margin: 0 auto;
}

.model-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.assistant-shell {
  display: flex;
  flex-direction: column;
  min-height: 620px;
  height: calc(100vh - 230px);
  max-height: 860px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.assistant-stream {
  flex: 1;
  overflow-y: auto;
  padding: 26px 28px 10px;
  background:
    radial-gradient(circle at 92% 0%, rgba(16, 185, 129, 0.08), transparent 34%),
    linear-gradient(180deg, #fbfdfd 0%, #ffffff 52%);
}

.prompt-panel {
  display: flex;
  gap: 16px;
  padding: 18px;
  margin-bottom: 24px;
  border: 1px solid #d9efe9;
  border-radius: 16px;
  background: linear-gradient(135deg, #f0fbf7 0%, #ffffff 72%);
}

.prompt-panel__icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  border-radius: 13px;
  color: #fff;
  background: linear-gradient(135deg, #0f766e, #10b981);
  box-shadow: 0 10px 22px rgba(15, 118, 110, 0.2);
}

.prompt-panel strong {
  display: block;
  margin-bottom: 12px;
  color: var(--ink-800);
}

.prompt-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
}

.prompt-chip {
  padding: 8px 12px;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  color: var(--ink-700);
  background: #fff;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: 0.18s ease;
}

.prompt-chip:hover {
  border-color: var(--brand-400);
  color: var(--brand-700);
  background: var(--brand-50);
  transform: translateY(-1px);
}

.message {
  display: flex;
  gap: 12px;
  margin-bottom: 22px;
}

.message--user {
  flex-direction: row-reverse;
}

.message__avatar {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  border-radius: 12px;
  color: #fff;
  background: linear-gradient(135deg, #0f766e, #10b981);
  font-size: 14px;
  font-weight: 700;
  box-shadow: 0 8px 18px rgba(15, 118, 110, 0.18);
}

.message__avatar--user {
  background: linear-gradient(135deg, #334155, #0f172a);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.16);
}

.message__body {
  max-width: min(760px, 78%);
}

.message--user .message__body {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.message__meta {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 6px;
  color: var(--ink-400);
  font-size: 12px;
}

.message__meta strong {
  color: var(--ink-700);
  font-size: 13px;
}

.message__failed {
  color: var(--red);
}

.message__bubble {
  padding: 13px 16px;
  border: 1px solid var(--line);
  border-radius: 4px 16px 16px;
  color: var(--ink-800);
  background: #fff;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.75;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.035);
}

.message--user .message__bubble {
  border-color: #0f766e;
  border-radius: 16px 4px 16px 16px;
  color: #fff;
  background: linear-gradient(135deg, #0f766e, #127d75);
}

.message__bubble--failed {
  border-color: #fecaca;
  color: #991b1b;
  background: #fff7f7;
}

.message__bubble--thinking {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--ink-500);
}

.thinking-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--brand-500);
  animation: pulse 1.1s ease-in-out infinite;
}

.thinking-dot:nth-child(2) {
  animation-delay: 0.16s;
}

.thinking-dot:nth-child(3) {
  animation-delay: 0.32s;
  margin-right: 4px;
}

@keyframes pulse {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  40% {
    opacity: 1;
    transform: scale(1);
  }
}

.tool-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}

.tool-strip__label {
  color: var(--ink-400);
  font-size: 12px;
}

.assistant-composer {
  padding: 16px 20px 18px;
  border-top: 1px solid var(--line);
  background: #fff;
}

.assistant-composer :deep(.el-textarea__inner) {
  border-radius: 13px;
  padding: 12px 14px;
  line-height: 1.65;
  background: var(--surface-soft);
}

.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}

.composer-hint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--ink-400);
  font-size: 12px;
}

@media (max-width: 760px) {
  .assistant-shell {
    height: calc(100vh - 250px);
    min-height: 520px;
  }

  .assistant-stream {
    padding: 18px 14px 6px;
  }

  .message__body {
    max-width: 84%;
  }

  .composer-hint {
    display: none;
  }
}
</style>
