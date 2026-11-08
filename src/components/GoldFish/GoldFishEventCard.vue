<template>
  <section class="gf-event">
    <header class="gf-head">
      <div class="gf-title">
        <span class="gf-logo">🐟</span>
        <div>
          <h3>金鱼活动</h3>
          <p>消耗活动 · 拿金鱼目标规划</p>
        </div>
      </div>
      <div class="gf-chips">
        <span class="gf-chip"
          >{{ festival.label }} · {{ festival.weekType }}</span
        >
        <span class="gf-chip" :class="{ warn: microStar <= 0 }">
          图鉴微星 {{ microStar > 0 ? formatAmount(microStar) : "未识别" }} ·
          {{ plan.bookTierLabel }}
        </span>
        <span class="gf-chip" :class="plan.isReady ? 'ok' : 'warn'">
          {{ plan.isReady ? "资源已够" : "资源不足" }}
        </span>
      </div>
    </header>

    <div class="gf-selectors">
      <div class="gf-selector">
        <span class="gf-selector-label">活动</span>
        <n-radio-group
          :value="festivalKey"
          size="small"
          @update:value="$emit('update:festivalKey', $event)"
        >
          <n-radio-button
            v-for="option in festivalOptions"
            :key="option.key"
            :value="option.key"
          >
            {{ option.label }}
          </n-radio-button>
        </n-radio-group>
      </div>
      <div class="gf-selector">
        <span class="gf-selector-label">目标</span>
        <n-radio-group
          :value="presetKey"
          size="small"
          @update:value="$emit('update:presetKey', $event)"
        >
          <n-radio-button
            v-for="option in presetOptions"
            :key="option.key"
            :value="option.value || option.key"
          >
            {{ option.label }} {{ formatPercent(option.rate) }}
          </n-radio-button>
        </n-radio-group>
      </div>
    </div>

    <div class="gf-stats">
      <div class="gf-stat">
        <span class="gf-stat-label">目标道具</span>
        <span class="gf-stat-value">{{ plan.totalProps }}</span>
        <span class="gf-stat-sub"
          >金鱼需 250 个金色{{ festival.itemName }}</span
        >
      </div>
      <div class="gf-stat">
        <span class="gf-stat-label">现有折算</span>
        <span class="gf-stat-value">{{ plan.stockProps }}</span>
        <span class="gf-stat-sub">只算已囤资源，不含返还</span>
      </div>
      <div class="gf-stat">
        <span class="gf-stat-label">预计可得</span>
        <span class="gf-stat-value">{{ plan.projectedProps }}</span>
        <span class="gf-stat-sub">现有 + 活动返还 + 图鉴折算</span>
      </div>
      <div class="gf-stat">
        <span class="gf-stat-label">还差道具</span>
        <span class="gf-stat-value" :class="{ warn: plan.gapProps > 0 }">
          {{ plan.gapProps }}
        </span>
        <span class="gf-stat-sub">≤ 0 即达标</span>
      </div>
    </div>

    <div class="gf-progress-row">
      <n-progress
        type="line"
        :percentage="stockPercent"
        :height="10"
        :show-indicator="false"
        color="#f59e0b"
        rail-color="rgba(127, 127, 127, 0.15)"
      />
      <span class="gf-progress-text">
        囤货进度 {{ stockPercent }}%（不含返还）
      </span>
    </div>

    <div class="gf-meta">
      <span>开启：{{ formatDateTime(festival.start) }}（7 天）</span>
      <span>距开始：{{ festival.daysLeft }} 天</span>
      <span>周常：{{ festival.weekType }}</span>
      <span>预计成功率：{{ formatPercent(plan.projectedRate, 1) }}</span>
      <span>
        档位经验 {{ formatPercent(plan.communityRate) }} · 理论
        {{ formatPercent(plan.theoryRate) }}
      </span>
    </div>

    <div class="gf-advice" :class="{ ok: plan.isReady }">
      <template v-if="plan.isReady">
        现有资源加上活动返还，可完成 {{ plan.totalProps }} 个道具任务（{{
          plan.preset.label
        }}），按计划消耗即可。
      </template>
      <template v-else>
        还差 <strong>{{ plan.gapProps }}</strong> 个道具。优先补
        <strong>{{ priorityText }}</strong
        >；按当前采购计划，活动前需花
        <strong>{{ formatAmount(market.preCost) }}</strong> 金砖，活动期再花
        <strong>{{ formatAmount(market.eventCost) }}</strong> 金砖。
      </template>
    </div>

    <div v-if="live.hasData" class="gf-live">
      当前活动道具：普通 {{ live.normal }} / 金色 {{ live.golden }}（兑换金鱼需
      250）
      <span v-if="live.golden >= 250" class="gf-live-ok">已可兑换</span>
    </div>

    <div class="gf-weekly">
      <span class="gf-weekly-title">每周需补</span>
      <span v-for="item in weeklyRows" :key="item.key" class="gf-weekly-item">
        {{ item.label }} <strong>{{ item.text }}</strong>
      </span>
    </div>

    <!-- 黑市采购规划 -->
    <div class="gf-market">
      <div class="gf-market-head">
        <div class="gf-market-title">
          <h4>黑市采购计划</h4>
          <span class="gf-market-sub">
            今日约 {{ formatAmount(market.todayCost) }} 金砖 · 活动前共
            {{ formatAmount(market.preCost) }} · 活动期
            {{ formatAmount(market.eventCost) }}
          </span>
        </div>
        <div class="gf-market-controls">
          <span class="gf-control">
            每日金砖
            <n-input-number
              :value="dailyIncome"
              size="tiny"
              :min="0"
              :max="20000"
              :step="100"
              style="width: 96px"
              @update:value="$emit('update:dailyIncome', $event ?? 0)"
            />
          </span>

          <n-button text size="tiny" @click="showSettings = !showSettings">
            {{ showSettings ? "收起设置" : "采购设置" }}
          </n-button>
        </div>
      </div>

      <div v-show="showSettings" class="gf-market-settings">
        <div class="gf-book-row">
          <span class="gf-book-label">图鉴微星</span>
          <n-input-number
            :value="bookStar"
            size="tiny"
            :min="0"
            :max="4600"
            :step="10"
            style="width: 110px"
            @update:value="$emit('update:bookStar', $event ?? 0)"
          />
          <span class="gf-book-hint">{{ bookHint }}</span>
        </div>
        <div class="gf-book-row">
          <span class="gf-book-label">图鉴档位</span>
          <n-radio-group
            :value="bookTier"
            size="small"
            @update:value="$emit('update:bookTier', $event)"
          >
            <n-radio-button value="auto">自动</n-radio-button>
            <n-radio-button value="low">&lt; 2000</n-radio-button>
            <n-radio-button value="mid">2000-3000</n-radio-button>
            <n-radio-button value="high">&gt; 3000</n-radio-button>
          </n-radio-group>
          <span class="gf-book-hint">
            招募 {{ plan.rows.find((r) => r.key === "recruit")?.target }} · 宝箱
            {{ plan.bookTierRounds }} 轮 · 金砖
            {{ formatAmount(plan.rows.find((r) => r.key === "gold")?.target) }}
          </span>
        </div>
        <p class="gf-market-hint">
          按顺序购买，↑↓ 调整优先级，取消勾选则不买；每日限购按黑市 2
          次刷新估算。
        </p>
        <div
          v-for="(item, index) in marketItems"
          :key="item.key"
          class="gf-market-item"
        >
          <n-checkbox
            :checked="item.enabled"
            size="small"
            @update:checked="$emit('toggleMarket', item.key, $event)"
          />
          <span class="gf-market-index">{{ index + 1 }}</span>
          <span class="gf-market-name">{{ item.label }}</span>
          <span class="gf-market-price">
            {{ item.price }} 砖 / {{ item.amount }} {{ item.unit }}
          </span>
          <span class="gf-market-cap">
            日限 {{ item.perDay >= 999 ? "不限" : item.perDay }}
          </span>
          <n-button
            text
            size="tiny"
            :disabled="index === 0"
            @click="$emit('moveMarket', item.key, -1)"
          >
            ↑
          </n-button>
          <n-button
            text
            size="tiny"
            :disabled="index === marketItems.length - 1"
            @click="$emit('moveMarket', item.key, 1)"
          >
            ↓
          </n-button>
        </div>
      </div>

      <div class="gf-today">
        <div class="gf-today-title">
          今日建议购买
          <span class="gf-today-cost"
            >{{ formatAmount(market.todayCost) }} 金砖</span
          >
        </div>
        <div v-if="market.todayList.length === 0" class="gf-today-empty">
          <template v-if="market.preCost > 0">
            今日可用金砖不足，先收盐罐攒金砖；活动前共需
            {{ formatAmount(market.preCost) }} 金砖
          </template>
          <template v-else> 今天不需要额外采购（活动期再买即可） </template>
        </div>
        <div v-else class="gf-today-list">
          <span
            v-for="item in market.todayList"
            :key="item.key"
            class="gf-today-item"
          >
            {{ item.label }} × {{ item.qty }}
            <span class="gf-today-item-cost"
              >({{ formatAmount(item.cost) }})</span
            >
          </span>
        </div>
        <div class="gf-today-foot">
          <span>
            采购后预计可得 {{ market.projectedProps }} 道具（{{
              formatPercent(market.projectedRate, 1)
            }}）
          </span>
          <span v-if="market.unmet.length" class="gf-today-warn">
            仍缺：{{ unmetText }}
          </span>
          <span v-else class="gf-today-ok">按此计划可补齐缺口</span>
        </div>
        <div class="gf-today-foot">
          <span>
            金砖：现有 {{ formatAmount(market.gold.current) }} + 收入
            {{ formatAmount(market.gold.dailyIncome * market.totalDays) }} =
            {{ formatAmount(market.gold.totalAvailable) }}，采购后余
            {{ formatAmount(market.gold.remaining) }}
          </span>
          <span v-if="market.assumedDirectSpend" class="gf-today-note">
            活动期另按直购 600 竿计
            {{ formatAmount(market.assumedDirectSpend) }} 金砖（已计入消耗任务）
          </span>
          <span v-if="market.goldShortfall > 0" class="gf-today-warn">
            金砖总量不足：活动期最多再花
            {{ formatAmount(market.maxEventSpend) }}，距
            {{ formatAmount(market.goldTaskTarget) }} 消耗任务还差
            {{ formatAmount(market.goldShortfall) }}
          </span>
          <span v-else-if="market.goldTaskGap > 0" class="gf-today-note">
            活动期采购消耗
            {{ formatAmount(market.eventCost) }} 金砖，还需在活动期多花
            {{ formatAmount(market.goldTaskGap) }}（直购鱼竿/彩玉/淬炼补）
          </span>
        </div>
      </div>
    </div>

    <p class="gf-disclaimer">
      数据口径：任务满档 = 1050 道具；金色{{ festival.itemName }} 25% 出、5
      次保底；概率为模型精算，社区经验更保守，已并列展示。图鉴折算按每 150 微星
      ≈ 25 招募令估算。
    </p>
  </section>
</template>

<script setup>
import { computed, ref } from "vue";
import {
  formatAmount,
  formatDateTime,
  formatPercent,
} from "@/utils/goldFish/format";

const props = defineProps({
  plan: { type: Object, required: true },
  festival: { type: Object, required: true },
  festivalOptions: { type: Array, default: () => [] },
  presetOptions: { type: Array, default: () => [] },
  presetKey: { type: String, default: "safe" },
  festivalKey: { type: String, default: "newYear" },
  live: {
    type: Object,
    default: () => ({ normal: 0, golden: 0, hasData: false }),
  },
  microStar: { type: Number, default: 0 },
  bookScope: { type: String, default: "unknown" },
  dailyIncome: { type: Number, default: 1500 },
  bookTier: { type: String, default: "auto" },
  market: { type: Object, required: true },
  marketItems: { type: Array, default: () => [] },
});

defineEmits([
  "update:presetKey",
  "update:festivalKey",
  "update:dailyIncome",
  "update:bookTier",
  "update:bookStar",
  "toggleMarket",
  "moveMarket",
]);

const showSettings = ref(false);

const stockPercent = computed(() => {
  const total = props.plan.totalProps || 1;
  return Math.min(100, Math.round((props.plan.stockProps / total) * 100));
});

const priorityText = computed(() => {
  const rows = (props.plan.rows || [])
    .filter((row) => row.gap > 0 && row.key !== "pot")
    .sort((a, b) => b.gap / (b.target || 1) - a.gap / (a.target || 1))
    .slice(0, 2);
  if (rows.length === 0) return "盐罐次数";
  return rows.map((row) => row.label).join("、");
});

const weeklyRows = computed(() =>
  (props.plan.rows || []).map((row) => ({
    key: row.key,
    label: row.label,
    text:
      row.key === "pot"
        ? `活动期 ${row.target} 次`
        : row.gap > 0
          ? `${formatAmount(Math.ceil(row.perDay * 7))} ${row.unit}`
          : "已够",
  })),
);

const bookHint = computed(() => {
  if (props.bookScope === "manual") return "手动填写";
  if (props.bookScope === "bookPoint") return "自动识别";
  if (props.bookScope === "bookCount") return "仅取到收录数，请填微星";
  return "未识别，请按游戏内图鉴填写";
});

const unmetText = computed(() =>
  (props.market.unmet || [])
    .map((item) => {
      const row = (props.plan.rows || []).find(
        (entry) => entry.key === item.key,
      );
      return `${item.label} ${formatAmount(item.amount)}${row?.unit || ""}`;
    })
    .join("、"),
);
</script>

<style scoped lang="scss">
.gf-event {
  grid-column: 1 / -1;
  width: 100%;
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: var(--border-radius-xl);
  padding: var(--spacing-lg);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.gf-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  flex-wrap: wrap;
}

.gf-title {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);

  .gf-logo {
    font-size: 28px;
    line-height: 1;
  }

  h3 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
  }

  p {
    margin: 2px 0 0;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }
}

.gf-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.gf-chip {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);

  &.ok {
    background: rgba(34, 197, 94, 0.12);
    color: var(--success-color);
  }

  &.warn {
    background: rgba(245, 158, 11, 0.14);
    color: #b45309;
  }
}

.gf-selectors {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm) var(--spacing-lg);
  margin: var(--spacing-md) 0;
}

.gf-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}

.gf-selector-label {
  font-size: 12px;
  color: var(--text-tertiary);
}

.gf-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}

.gf-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);

  &-label {
    font-size: 11px;
    color: var(--text-tertiary);
  }

  &-value {
    font-size: 20px;
    font-weight: var(--font-weight-bold);
    color: var(--text-primary);

    &.warn {
      color: #b45309;
    }
  }

  &-sub {
    font-size: 11px;
    color: var(--text-tertiary);
    line-height: 1.4;
  }
}

.gf-progress-row {
  display: flex;
  align-items: center;
  gap: 10px;

  :deep(.n-progress) {
    flex: 1;
  }
}

.gf-progress-text {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.gf-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-top: var(--spacing-sm);
  font-size: 12px;
  color: var(--text-tertiary);
}

.gf-advice {
  margin-top: var(--spacing-sm);
  padding: 8px 12px;
  border-radius: 10px;
  font-size: var(--font-size-sm);
  line-height: 1.6;
  background: rgba(245, 158, 11, 0.1);
  color: #92400e;

  &.ok {
    background: rgba(34, 197, 94, 0.1);
    color: #166534;
  }
}

.gf-live {
  margin-top: var(--spacing-sm);
  font-size: 12px;
  color: var(--text-secondary);
}

.gf-live-ok {
  margin-left: 6px;
  color: var(--success-color);
  font-weight: var(--font-weight-semibold);
}

.gf-weekly {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  margin-top: var(--spacing-sm);
  font-size: 12px;
  color: var(--text-secondary);
}

.gf-weekly-title {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-tertiary);
  color: var(--text-tertiary);
  font-size: 11px;
}

.gf-weekly-item strong {
  color: var(--text-primary);
  font-weight: var(--font-weight-semibold);
}

.gf-market {
  margin-top: var(--spacing-md);
  padding: 12px;
  border-radius: 12px;
  border: 1px dashed var(--border-light);
  background: var(--bg-secondary);
}

.gf-market-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.gf-market-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;

  h4 {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
  }
}

.gf-market-sub {
  font-size: 11px;
  color: var(--text-tertiary);
}

.gf-market-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.gf-control {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.gf-market-settings {
  margin-top: 10px;
  padding: 10px;
  border-radius: 10px;
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
}

.gf-book-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
}

.gf-book-label {
  color: var(--text-secondary);
}

.gf-book-hint {
  color: var(--text-tertiary);
  font-size: 11px;
}

.gf-market-hint {
  margin: 0 0 8px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.gf-market-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  font-size: 12px;
  border-bottom: 1px dashed var(--border-light);

  &:last-child {
    border-bottom: none;
  }
}

.gf-market-index {
  width: 16px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 11px;
}

.gf-market-name {
  min-width: 96px;
  color: var(--text-primary);
}

.gf-market-price {
  color: var(--text-secondary);
}

.gf-market-cap {
  margin-left: auto;
  color: var(--text-tertiary);
  font-size: 11px;
}

.gf-today {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-light);
}

.gf-today-title {
  font-size: 13px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.gf-today-cost {
  margin-left: 8px;
  color: #b45309;
}

.gf-today-empty {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.gf-today-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin-top: 6px;
}

.gf-today-item {
  padding: 3px 10px;
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.12);
  font-size: 12px;
  color: #92400e;
}

.gf-today-item-cost {
  color: #b45309;
  opacity: 0.8;
}

.gf-today-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.gf-today-warn {
  color: #b45309;
}

.gf-today-ok {
  color: var(--success-color);
}

.gf-today-note {
  color: var(--text-secondary);
}

.gf-disclaimer {
  margin: var(--spacing-sm) 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-tertiary);
}

@media (max-width: 768px) {
  .gf-event {
    padding: var(--spacing-md);
  }

  .gf-stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .gf-market-name {
    min-width: auto;
  }

  .gf-market-cap {
    display: none;
  }
}
</style>
