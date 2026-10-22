<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: '—' },
  suffix: { type: String, default: '' },
  hint: { type: String, default: '' },
  tone: { type: String, default: 'teal' },
  loading: { type: Boolean, default: false },
})
</script>

<template>
  <article class="stat-card" :class="`stat-card--${tone}`">
    <div class="stat-card__top">
      <span class="stat-card__label">{{ label }}</span>
      <span class="stat-card__icon"><slot name="icon" /></span>
    </div>
    <div class="stat-card__value">
      <el-skeleton v-if="loading" animated :rows="0">
        <template #template>
          <el-skeleton-item variant="h1" style="width: 55%; height: 34px" />
        </template>
      </el-skeleton>
      <template v-else>
        <strong>{{ value }}</strong>
        <small v-if="suffix">{{ suffix }}</small>
      </template>
    </div>
    <div v-if="hint" class="stat-card__hint">{{ hint }}</div>
  </article>
</template>
