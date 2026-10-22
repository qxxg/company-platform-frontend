<script setup>
import { computed } from 'vue'
import { CircleCheck, Key, Lock, Warning } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import { useAuthStore } from '@/stores/auth'
import { PERMISSION_GROUPS, PERMISSION_LABELS, ROLE_LABELS } from '@/constants'
import { initialsOf } from '@/utils/format'

const auth = useAuthStore()

const groupStats = computed(() =>
  PERMISSION_GROUPS.map((group) => {
    const owned = group.permissions.filter((code) => auth.hasPermission(code)).length
    return { ...group, owned, total: group.permissions.length }
  }),
)

const ownedCount = computed(() => auth.permissions.length)
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="SYSTEM · ACCESS CONTROL"
      title="角色与权限"
      description="当前账号从 JWT 中读取角色与权限声明。前端按权限隐藏入口，后端通过 @PreAuthorize 再次校验。"
    />

    <section class="permission-hero">
      <div class="permission-hero__identity">
        <div class="permission-hero__avatar">{{ initialsOf(auth.displayName) }}</div>
        <div>
          <span>当前账号</span>
          <h2>{{ auth.displayName }}</h2>
          <p>{{ auth.username }} · 员工编号 {{ auth.employeeNo || '未设置' }}</p>
        </div>
      </div>
      <div class="permission-hero__stats">
        <div><strong>{{ auth.roles.length }}</strong><span>角色</span></div>
        <div><strong>{{ ownedCount }}</strong><span>权限项</span></div>
        <div><strong>{{ groupStats.filter((item) => item.owned > 0).length }}</strong><span>覆盖模块</span></div>
      </div>
    </section>

    <el-alert type="info" :closable="false" show-icon class="section-alert" title="权限模型说明">
      <template #default>
        V1.4 的权限设计包含“角色 + 数据范围 + 字段权限 + 操作权限”四层。本版本已落地角色与操作权限；
        数据范围和字段权限需要客户、财务、设备等业务表接入后继续实现。
      </template>
    </el-alert>

    <section class="panel role-panel">
      <div class="panel__head">
        <div>
          <span class="panel__eyebrow">MY ROLES</span>
          <h2>我的角色</h2>
        </div>
      </div>
      <div class="role-cards">
        <div v-for="role in auth.roles" :key="role" class="role-card">
          <span class="role-card__icon"><el-icon><Key /></el-icon></span>
          <div>
            <strong>{{ ROLE_LABELS[role] || role }}</strong>
            <span>{{ role }}</span>
          </div>
        </div>
        <div v-if="!auth.roles.length" class="muted-text">当前账号未分配角色。</div>
      </div>
    </section>

    <section class="permission-groups">
      <article v-for="group in groupStats" :key="group.key" class="panel permission-group">
        <div class="permission-group__head">
          <div>
            <span class="panel__eyebrow">{{ group.key.toUpperCase() }}</span>
            <h2>{{ group.title }}</h2>
            <p>{{ group.description }}</p>
          </div>
          <span class="permission-group__count">{{ group.owned }} / {{ group.total }}</span>
        </div>
        <div class="permission-list">
          <div
            v-for="code in group.permissions"
            :key="code"
            class="permission-item"
            :class="{ 'is-owned': auth.hasPermission(code) }"
          >
            <span class="permission-item__icon">
              <el-icon><CircleCheck v-if="auth.hasPermission(code)" /><Lock v-else /></el-icon>
            </span>
            <div>
              <strong>{{ PERMISSION_LABELS[code] || code }}</strong>
              <code>{{ code }}</code>
            </div>
            <el-tag :type="auth.hasPermission(code) ? 'success' : 'info'" size="small" effect="plain" round>
              {{ auth.hasPermission(code) ? '已授予' : '未授予' }}
            </el-tag>
          </div>
        </div>
      </article>
    </section>

    <section class="panel enforcement-panel">
      <div class="panel__head">
        <div>
          <span class="panel__eyebrow">ENFORCEMENT</span>
          <h2>权限校验链路</h2>
        </div>
      </div>
      <div class="enforcement-flow">
        <div><span>01</span><strong>认证中心</strong><p>签发 JWT，写入 roles 与 permissions 声明</p></div>
        <div><span>02</span><strong>网关</strong><p>校验签名与有效期，拒绝未认证请求</p></div>
        <div><span>03</span><strong>微服务</strong><p>@PreAuthorize 按权限码逐接口校验</p></div>
        <div><span>04</span><strong>PC Web</strong><p>按权限隐藏菜单、按钮，仅作为体验优化</p></div>
      </div>
      <div class="enforcement-note">
        <el-icon><Warning /></el-icon>
        <span>不要仅凭前端隐藏做安全控制；所有敏感操作都必须由后端再次校验。</span>
      </div>
    </section>
  </div>
</template>
