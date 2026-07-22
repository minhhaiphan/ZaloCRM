<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <v-app
    :class="{ 'mobile-layout--chat': isChatRoute }"
    :style="mobileLayoutStyle"
  >
    <OfflineIndicator />

    <!-- Slim mobile app bar -->
    <v-app-bar density="compact" :height="isChatRoute ? 56 : 64" flat>
      <div class="mobile-brand d-flex align-center ml-3">
        <div class="mobile-brand-mark d-flex align-center justify-center">
          <v-icon size="16" color="white">mdi-robot</v-icon>
        </div>
        <span class="mobile-brand-name font-weight-bold text-body-1">CRM</span>
      </div>

      <v-spacer />

      <template v-if="isChatRoute">
        <NotificationBell />
        <v-menu v-model="appMenuOpen" location="bottom end">
          <template #activator="{ props: menuProps }">
            <v-btn v-bind="menuProps" icon size="small" variant="text" aria-label="Mở menu điều hướng">
              <v-icon size="21">mdi-view-grid-outline</v-icon>
            </v-btn>
          </template>
          <v-list density="compact" min-width="220">
            <v-list-item
              v-for="item in headerNavItems"
              :key="item.path"
              :prepend-icon="item.icon"
              :title="item.title"
              :active="isNavActive(item.path)"
              @click="navigateTo(item.path)"
            />
            <v-divider />
            <v-list-item
              :prepend-icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
              :title="isDark ? 'Giao diện sáng' : 'Giao diện tối'"
              @click="toggleTheme"
            />
            <v-list-item prepend-icon="mdi-logout" title="Đăng xuất" @click="logout" />
          </v-list>
        </v-menu>
      </template>
      <template v-else>
        <NotificationBell />
        <v-btn icon size="small" variant="text" @click="toggleTheme">
          <v-icon size="20">{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
        </v-btn>
        <v-btn icon size="small" variant="text" @click="logout">
          <v-icon size="20">mdi-logout</v-icon>
        </v-btn>
      </template>
    </v-app-bar>

    <!-- Vuetify reserves the app bar and bottom navigation space for v-main. -->
    <v-main :class="{ 'mobile-main--chat': isChatRoute }">
      <div class="mobile-content" :class="{ 'mobile-content--chat': isChatRoute }">
        <slot />
      </div>
    </v-main>

    <BottomNav v-if="!isChatRoute" />
  </v-app>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useTheme } from 'vuetify';
import { useAuthStore } from '@/stores/auth';
import { useRoute, useRouter } from 'vue-router';
import NotificationBell from '@/components/NotificationBell.vue';
import BottomNav from '@/components/BottomNav.vue';
import OfflineIndicator from '@/components/OfflineIndicator.vue';

const theme = useTheme();
const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const isDark = ref(localStorage.getItem('theme') !== 'light');
const appMenuOpen = ref(false);
const mobileViewportHeight = ref(window.visualViewport?.height ?? window.innerHeight);
const isChatRoute = computed(() => route.path === '/chat' || route.path.startsWith('/chat/'));
const mobileLayoutStyle = computed(() => isChatRoute.value
  ? { '--mobile-viewport-height': `${Math.round(mobileViewportHeight.value)}px` }
  : undefined,
);
const headerNavItems = [
  { title: 'Chat', icon: 'mdi-message-text-outline', path: '/chat' },
  { title: 'Khách hàng', icon: 'mdi-account-group-outline', path: '/contacts' },
  { title: 'Lịch hẹn', icon: 'mdi-calendar-clock-outline', path: '/appointments' },
  { title: 'Tổng quan', icon: 'mdi-view-dashboard-outline', path: '/' },
];

onMounted(() => {
  theme.global.name.value = isDark.value ? 'dark' : 'light';
  syncMobileViewportHeight();
  window.visualViewport?.addEventListener('resize', syncMobileViewportHeight);
  window.addEventListener('resize', syncMobileViewportHeight);
});

onUnmounted(() => {
  window.visualViewport?.removeEventListener('resize', syncMobileViewportHeight);
  window.removeEventListener('resize', syncMobileViewportHeight);
});

function syncMobileViewportHeight() {
  mobileViewportHeight.value = window.visualViewport?.height ?? window.innerHeight;
}

function toggleTheme() {
  appMenuOpen.value = false;
  isDark.value = !isDark.value;
  theme.global.name.value = isDark.value ? 'dark' : 'light';
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
}

function logout() {
  appMenuOpen.value = false;
  authStore.logout();
  router.push('/login');
}

function isNavActive(path: string) {
  return path === '/chat' ? isChatRoute.value : route.path === path;
}

function navigateTo(path: string) {
  appMenuOpen.value = false;
  router.push(path);
}
</script>

<style scoped>
.mobile-brand {
  gap: 8px;
}

.mobile-brand-mark {
  width: 28px;
  height: 28px;
  background: linear-gradient(135deg, #00f2ff, #0077b6);
  border-radius: 8px;
}

.mobile-brand-name {
  color: #00cfe0;
}

.mobile-layout--chat .mobile-brand {
  gap: 6px;
  margin-left: 10px !important;
}

.mobile-layout--chat .mobile-brand-mark {
  width: 24px;
  height: 24px;
  border-radius: 7px;
}

.mobile-layout--chat .mobile-brand-name {
  font-size: 15px !important;
}

.mobile-content {
  padding-bottom: 72px;
}

.mobile-layout--chat {
  height: var(--mobile-viewport-height, 100vh);
  min-height: var(--mobile-viewport-height, 100vh);
  overflow: hidden;
}

.mobile-layout--chat :deep(.v-application__wrap) {
  height: var(--mobile-viewport-height, 100vh);
  min-height: var(--mobile-viewport-height, 100vh);
  overflow: hidden;
}

/* Dynamic viewport units exclude the visible mobile browser chrome. */
@supports (height: 100dvh) {
  .mobile-layout--chat {
    height: var(--mobile-viewport-height, 100dvh);
    min-height: var(--mobile-viewport-height, 100dvh);
  }

  .mobile-layout--chat :deep(.v-application__wrap) {
    height: var(--mobile-viewport-height, 100dvh);
    min-height: var(--mobile-viewport-height, 100dvh);
  }
}

.mobile-main--chat {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.mobile-content--chat {
  height: calc(var(--mobile-viewport-height, 100vh) - var(--v-layout-top, 48px) - var(--v-layout-bottom, 0px));
  max-height: calc(var(--mobile-viewport-height, 100vh) - var(--v-layout-top, 48px) - var(--v-layout-bottom, 0px));
  min-height: 0;
  overflow: hidden;
  padding-bottom: 0;
}

@supports (height: 100dvh) {
  .mobile-content--chat {
    height: calc(var(--mobile-viewport-height, 100dvh) - var(--v-layout-top, 48px) - var(--v-layout-bottom, 0px));
    max-height: calc(var(--mobile-viewport-height, 100dvh) - var(--v-layout-top, 48px) - var(--v-layout-bottom, 0px));
  }
}
</style>
