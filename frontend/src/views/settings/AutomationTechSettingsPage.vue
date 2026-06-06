<!--
  AutomationTechSettingsPage — #3 2026-06-06 (Anh chốt).
  Cài đặt KỸ THUẬT cho automation Mục tiêu (kết bạn + bám đuổi).
  Đây là nhóm tham số VẬN HÀNH NỘI BỘ trước đây hardcode trong hệ thống — nay đưa
  ra cho admin chỉnh. KHÁC với cấu hình từng Mục tiêu (nhịp gửi, giờ, template...)
  nằm trong wizard tạo Mục tiêu. Trang này áp dụng cho TOÀN tổ chức.
  Lưu ý: đổi "nhịp quét" cần khởi động lại hệ thống mới áp dụng (ghi rõ trên UI).
-->
<template>
  <div class="ats-page">
    <header class="ats-head">
      <h1>⚙️ Cài đặt kỹ thuật — Tự động hoá</h1>
      <p class="ats-sub">
        Các tham số vận hành nội bộ của hệ thống kết bạn &amp; bám đuổi. Em đã đặt sẵn giá trị
        an toàn theo kinh nghiệm — anh chỉ chỉnh khi thật sự cần. Cấu hình của từng chiến dịch
        (nhịp gửi, giờ gửi, lời nhắn) nằm trong màn hình tạo <strong>Mục tiêu</strong>, không phải ở đây.
      </p>
    </header>

    <div v-if="loading" class="ats-loading">Đang tải...</div>

    <template v-else>
      <!-- Nhóm 1: Nhịp quét nền -->
      <section class="ats-card">
        <h3>🔄 Nhịp kiểm tra của hệ thống</h3>
        <p class="ats-detail">
          Hệ thống chạy nền tự kiểm tra theo chu kỳ để xử lý hàng đợi. Số nhỏ = phản ứng nhanh
          hơn nhưng tốn tài nguyên hơn. <strong>Đổi nhóm này cần khởi động lại hệ thống mới có hiệu lực.</strong>
        </p>
        <div class="ats-grid">
          <label class="ats-field">
            <span>Quét khách bị kẹt (giây)</span>
            <input type="number" min="10" max="3600" v-model.number="form.autoStuckSweepSeconds" />
            <small>Giải phóng khách bị treo về hàng đợi. Mặc định 60.</small>
          </label>
          <label class="ats-field">
            <span>Quét vào luồng bám đuổi (giây)</span>
            <input type="number" min="5" max="3600" v-model.number="form.autoDrainerSweepSeconds" />
            <small>Đẩy khách đã gửi tin chào vào chuỗi bám đuổi. Mặc định 30.</small>
          </label>
          <label class="ats-field">
            <span>Quét gửi tin nhắc đồng ý (phút)</span>
            <input type="number" min="1" max="1440" v-model.number="form.autoRemindSweepMinutes" />
            <small>Tần suất kiểm tra để gửi tin nhắc khách duyệt kết bạn. Mặc định 30.</small>
          </label>
        </div>
      </section>

      <!-- Nhóm 2: Ngưỡng kẹt / cứu -->
      <section class="ats-card">
        <h3>🩹 Xử lý khách bị kẹt</h3>
        <p class="ats-detail">Khi một khách bị treo giữa chừng (lỗi mạng, nick rớt...), hệ thống sẽ cứu về hàng đợi.</p>
        <div class="ats-grid">
          <label class="ats-field">
            <span>Coi là kẹt sau (phút)</span>
            <input type="number" min="1" max="1440" v-model.number="form.autoStuckThresholdMinutes" />
            <small>Khách "đang xử lý" quá lâu thì coi là kẹt. Mặc định 5.</small>
          </label>
          <label class="ats-field">
            <span>Số lần cứu tối đa</span>
            <input type="number" min="1" max="1000" v-model.number="form.autoStuckMaxRecovery" />
            <small>Cứu quá số lần này vẫn kẹt thì đánh dấu thất bại. Mặc định 10.</small>
          </label>
        </div>
      </section>

      <!-- Nhóm 3: Ngưỡng treo dài -->
      <section class="ats-card">
        <h3>⏱️ Ngưỡng treo dài</h3>
        <p class="ats-detail">Khi nick gửi bị offline lâu hoặc chiến dịch không tiến triển, hệ thống tự xử lý.</p>
        <div class="ats-grid">
          <label class="ats-field">
            <span>Chiến dịch treo quá (giờ)</span>
            <input type="number" min="1" max="720" v-model.number="form.autoCampaignTimeoutHours" />
            <small>Chiến dịch không tiến triển quá lâu → đánh dấu hết hạn. Mặc định 24.</small>
          </label>
          <label class="ats-field">
            <span>Reset khách khi nick offline quá (giờ)</span>
            <input type="number" min="1" max="720" v-model.number="form.autoNickOfflineResetHours" />
            <small>Nick gửi offline lâu → trả khách cho nick khác làm lại. Mặc định 24.</small>
          </label>
        </div>
      </section>

      <div class="ats-actions">
        <button class="ats-save" :disabled="saving" @click="onSave">
          {{ saving ? 'Đang lưu...' : 'Lưu cài đặt' }}
        </button>
        <span v-if="saveStatus === 'saved'" class="ats-toast ok">✓ Đã lưu</span>
        <span v-if="saveStatus === 'error'" class="ats-toast err">⚠ {{ saveError }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/index';

interface TechSettings {
  autoStuckSweepSeconds: number;
  autoDrainerSweepSeconds: number;
  autoRemindSweepMinutes: number;
  autoStuckThresholdMinutes: number;
  autoStuckMaxRecovery: number;
  autoCampaignTimeoutHours: number;
  autoNickOfflineResetHours: number;
}

const DEFAULTS: TechSettings = {
  autoStuckSweepSeconds: 60,
  autoDrainerSweepSeconds: 30,
  autoRemindSweepMinutes: 30,
  autoStuckThresholdMinutes: 5,
  autoStuckMaxRecovery: 10,
  autoCampaignTimeoutHours: 24,
  autoNickOfflineResetHours: 24,
};

const loading = ref(true);
const saving = ref(false);
const saveStatus = ref<'' | 'saved' | 'error'>('');
const saveError = ref('');
const form = ref<TechSettings>({ ...DEFAULTS });

async function fetchSettings() {
  loading.value = true;
  try {
    const { data } = await api.get('/organization/automation-settings');
    form.value = { ...DEFAULTS, ...data };
  } catch {
    form.value = { ...DEFAULTS };
  } finally {
    loading.value = false;
  }
}

async function onSave() {
  saving.value = true;
  saveStatus.value = '';
  try {
    await api.put('/organization/automation-settings', { ...form.value });
    saveStatus.value = 'saved';
    setTimeout(() => (saveStatus.value = ''), 2500);
  } catch (err: unknown) {
    saveStatus.value = 'error';
    const e = err as { response?: { data?: { error?: string; hint?: string } } };
    saveError.value = e.response?.data?.hint || e.response?.data?.error || 'Lưu thất bại';
  } finally {
    saving.value = false;
  }
}

onMounted(fetchSettings);
</script>

<style scoped>
.ats-page { max-width: 920px; margin: 0 auto; padding: 20px; }
.ats-head h1 { font-size: 20px; font-weight: 700; margin: 0 0 6px; }
.ats-sub { color: #6b7280; font-size: 13px; line-height: 1.5; margin: 0 0 18px; }
.ats-loading { color: #6b7280; padding: 40px; text-align: center; }
.ats-card {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
  padding: 18px 20px; margin-bottom: 16px;
}
.ats-card h3 { font-size: 15px; font-weight: 600; margin: 0 0 4px; }
.ats-detail { color: #6b7280; font-size: 12.5px; line-height: 1.5; margin: 0 0 14px; }
.ats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
.ats-field { display: flex; flex-direction: column; gap: 5px; }
.ats-field > span { font-size: 13px; font-weight: 500; color: #374151; }
.ats-field input {
  border: 1px solid #d1d5db; border-radius: 8px; padding: 7px 10px; font-size: 14px;
}
.ats-field input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.12); }
.ats-field small { color: #9ca3af; font-size: 11.5px; line-height: 1.4; }
.ats-actions { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
.ats-save {
  background: #2563eb; color: #fff; border: none; border-radius: 8px;
  padding: 9px 20px; font-size: 14px; font-weight: 600; cursor: pointer;
}
.ats-save:disabled { opacity: .6; cursor: default; }
.ats-toast { font-size: 13px; font-weight: 500; }
.ats-toast.ok { color: #16a34a; }
.ats-toast.err { color: #dc2626; }
</style>
