<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <v-app :class="{ 'mobile-layout--chat': isChatRoute }">
    <OfflineIndicator />

    <!-- Slim mobile app bar -->
    <v-app-bar density="compact" flat>
      <div class="d-flex align-center ml-3" style="gap: 8px;">
        <div class="d-flex align-center justify-center" style="width: 28px; height: 28px; background: linear-gradient(135deg, #00F2FF, #0077B6); border-radius: 8px;">
          <v-icon size="16" color="white">mdi-robot</v-icon>
        </div>
        <span class="font-weight-bold text-body-1"><span style="color: #00F2FF;">CRM</span></span>
      </div>

      <v-spacer />

      <NotificationBell />
      <v-btn icon size="small" variant="text" @click="toggleTheme">
        <v-icon size="20">{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
      </v-btn>
      <v-btn icon size="small" variant="text" @click="logout">
        <v-icon size="20">mdi-logout</v-icon>
      </v-btn>
    </v-app-bar>

    <!-- Vuetify reserves the app bar and bottom navigation space for v-main. -->
    <v-main :class="{ 'mobile-main--chat': isChatRoute }">
      <div class="mobile-content" :class="{ 'mobile-content--chat': isChatRoute }">
        <slot />
      </div>
    </v-main>

    <BottomNav />
  </v-app>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
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
const isChatRoute = computed(() => route.path === '/chat' || route.path.startsWith('/chat/'));

onMounted(() => {
  theme.global.name.value = isDark.value ? 'dark' : 'light';
});

function toggleTheme() {
  isDark.value = !isDark.value;
  theme.global.name.value = isDark.value ? 'dark' : 'light';
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
}

function logout() {
  authStore.logout();
  router.push('/login');
}
</script>

<style scoped>
.mobile-content {
  padding-bottom: 72px;
}

.mobile-layout--chat {
  height: 100vh;
  min-height: 100vh;
  overflow: hidden;
}

.mobile-layout--chat :deep(.v-application__wrap) {
  height: 100vh;
  min-height: 100vh;
  overflow: hidden;
}

/* Dynamic viewport units exclude the visible mobile browser chrome. */
@supports (height: 100dvh) {
  .mobile-layout--chat {
    height: 100dvh;
    min-height: 100dvh;
  }

  .mobile-layout--chat :deep(.v-application__wrap) {
    height: 100dvh;
    min-height: 100dvh;
  }
}

.mobile-main--chat {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.mobile-content--chat {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding-bottom: 0;
}
</style>
