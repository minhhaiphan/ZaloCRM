<!--
  LeadPoolTabsPage — wrapper 2 tab (2026-06-10, CEO-review).
  Gộp 2 mục menu cũ thành 1: "Nhận Lead" (config) + "Queue chia Lead" (preview).
    • Tab "Cấu hình nhận lead" — LeadPoolConfigPage (quota, câu chào, điều kiện).
    • Tab "Queue chia lead"   — LeadPoolPreviewPage (xem trước hàng đợi chia).
  Mỗi tab là page độc lập, chỉ bọc tab bar. ?tab=queue để deep-link.
-->
<template>
  <div class="lp-tabs-wrap">
    <v-tabs v-model="tab" class="lp-tabs" color="primary" density="comfortable">
      <v-tab value="config">
        <v-icon start size="18" icon="mdi-cog-outline" /> Cấu hình nhận lead
      </v-tab>
      <v-tab value="queue">
        <v-icon start size="18" icon="mdi-format-list-numbered" /> Queue chia lead
      </v-tab>
      <v-tab value="dashboard">
        <v-icon start size="18" icon="mdi-view-dashboard-outline" /> Tổng quan
      </v-tab>
      <v-tab value="log">
        <v-icon start size="18" icon="mdi-calendar-text-outline" /> Nhật ký chia
      </v-tab>
    </v-tabs>

    <!-- Giữ mounted bằng v-show để không mất state khi chuyển tab. -->
    <div v-show="tab === 'config'">
      <LeadPoolConfigPage />
    </div>
    <div v-show="tab === 'queue'">
      <LeadPoolPreviewPage />
    </div>
    <div v-show="tab === 'dashboard'">
      <LeadPoolDashboardPage v-if="mountedTabs.has('dashboard')" />
    </div>
    <div v-show="tab === 'log'">
      <LeadPoolLogPage v-if="mountedTabs.has('log')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import LeadPoolConfigPage from './LeadPoolConfigPage.vue';
import LeadPoolPreviewPage from './LeadPoolPreviewPage.vue';
import LeadPoolDashboardPage from './LeadPoolDashboardPage.vue';
import LeadPoolLogPage from './LeadPoolLogPage.vue';

type TabKey = 'config' | 'queue' | 'dashboard' | 'log';
const VALID: TabKey[] = ['config', 'queue', 'dashboard', 'log'];
const initial = new URLSearchParams(window.location.search).get('tab') as TabKey | null;
const tab = ref<TabKey>(initial && VALID.includes(initial) ? initial : 'config');

// Lazy-mount các tab nặng (dashboard/log) — chỉ load API khi user mở.
const mountedTabs = ref(new Set<TabKey>([tab.value]));
watch(tab, (t) => mountedTabs.value.add(t), { immediate: true });
</script>

<style scoped>
.lp-tabs-wrap { display: flex; flex-direction: column; }
.lp-tabs { border-bottom: 1px solid var(--border, #e5e7eb); margin-bottom: 16px; }
</style>
