<template>
  <MyCard class="gf-resource-card" :status-class="statusClass">
    <template #icon>
      <span class="gf-icon">{{ row.icon }}</span>
    </template>
    <template #title>
      <h3>{{ row.label }}</h3>
      <p>
        {{ isAction ? "活动期任务" : "需囤" }} {{ formatAmount(row.target) }}
        {{ row.unit }}
      </p>
      <p class="gf-return">
        <template v-if="isAction">每日上限 {{ row.capacity }} 次</template>
        <template v-else-if="row.key === 'chest'">
          任务 {{ formatAmount(row.task) }} 分（{{ chestRounds }} 轮） · 活动内
          {{ formatAmount(row.inEvent) }}
        </template>
        <template v-else>
          任务 {{ formatAmount(row.task) }} · 活动内可拿
          {{ formatAmount(row.inEvent) }}
        </template>
      </p>
    </template>
    <template #badge>
      <span v-if="isAction">活动期 {{ potDays }} 天</span>
      <span v-else>{{
        isDone ? "已达标" : `差 ${formatAmount(row.gap)}`
      }}</span>
    </template>

    <div class="gf-numbers">
      <div class="gf-number">
        <span class="gf-number-label">{{
          isAction ? "每日上限" : "现有"
        }}</span>
        <span class="gf-number-value">
          {{ formatAmount(isAction ? row.capacity : row.current) }}
        </span>
      </div>
      <div class="gf-number">
        <span class="gf-number-label">{{ isAction ? "需完成" : "缺口" }}</span>
        <span class="gf-number-value">
          {{ isAction ? `${row.target} 次` : formatAmount(row.gap) }}
        </span>
      </div>
    </div>

    <n-progress
      type="line"
      :percentage="Math.round(row.progress * 100)"
      :height="8"
      :show-indicator="false"
      :color="isDone ? '#22c55e' : '#f59e0b'"
      rail-color="rgba(127, 127, 127, 0.15)"
    />
    <div class="gf-progress-caption">
      <template v-if="isAction">活动期收满 {{ row.target }} 次</template>
      <template v-else>
        已囤 {{ Math.round(row.progress * 100) }}%（不含活动内返还）
      </template>
    </div>

    <div class="gf-gap" :class="{ done: isDone }">
      <template v-if="isAction">
        每日 {{ row.perDay.toFixed(0) }} 次，{{ potDays }} 天完成
      </template>
      <template v-else-if="isDone"> 已满足需囤量，无需额外补充 </template>
      <template v-else>
        每天需补 {{ formatAmount(Math.ceil(row.perDay)) }} {{ row.unit }}
        <span class="gf-perday">（缺口 / 距活动天数）</span>
      </template>
    </div>

    <div v-if="breakdown" class="gf-extra">{{ breakdown }}</div>

    <div
      v-if="!isAction && row.nextTier && !row.nextTier.done && !isDone"
      class="gf-next"
    >
      再囤 {{ formatAmount(row.nextTier.remain) }} {{ row.unit }} → 多拿
      {{ row.nextTier.reward }} 道具（第 {{ row.nextTier.tier }}/20 档）
    </div>

    <div class="gf-tip">{{ row.tip }}</div>

    <div class="gf-acq-title">获取方式</div>
    <ul class="gf-acq">
      <li v-for="item in acquisition" :key="item">{{ item }}</li>
    </ul>
  </MyCard>
</template>

<script setup>
import { computed } from "vue";
import { ACQUISITION } from "@/utils/goldFish/constants";
import { formatAmount } from "@/utils/goldFish/format";
import MyCard from "../Common/MyCard.vue";

const props = defineProps({
  row: { type: Object, required: true },
  potDays: { type: Number, default: 3 },
  chestRounds: { type: Number, default: 0 },
});

const isAction = computed(() => props.row.key === "pot");
const isDone = computed(() => !isAction.value && props.row.gap <= 0);
const acquisition = computed(() => ACQUISITION[props.row.key] || []);

const statusClass = computed(() => {
  if (isAction.value) return "weekly";
  if (isDone.value) return "completed";
  return props.row.feasible ? "active" : "energy";
});

// 明细：说明“任务消耗”是怎么扣到“需囤”的
const breakdown = computed(() => {
  const row = props.row;
  if (isAction.value) return "";
  if (row.key === "chest") {
    return `开箱循环 + 道具/钓鱼 + 图鉴合计 ${formatAmount(row.inEvent)} 分，其中开箱循环按 ${formatAmount(row.recycle)} 分估算`;
  }
  if (row.key === "rod") {
    return `钓鱼返还 ${formatAmount(row.returned)} 竿 + 活动期直购 ${formatAmount(row.direct)} 竿（约 38.8 万金砖，计入金砖消耗）+ 图鉴/其他，合计 ${formatAmount(row.inEvent)} 竿`;
  }
  if (row.key === "recruit") {
    return `开道具/钓鱼返还 ${formatAmount(row.returned)} 个 + 图鉴升星 ${formatAmount(row.bookPart)} 个，合计 ${formatAmount(row.inEvent)} 个`;
  }
  if (row.key === "gold") {
    const days = Math.ceil(row.gap / 1500);
    return `活动内返还 + 图鉴合计 ${formatAmount(row.inEvent)} 砖；按盐罐每日 1500 砖估算，缺口约需 ${days} 天`;
  }
  return "";
});
</script>

<style scoped lang="scss">
.gf-icon {
  font-size: 26px;
  line-height: 32px;
}

.gf-return {
  margin-top: 2px !important;
  font-size: 11px !important;
  color: var(--text-tertiary) !important;
}

.gf-progress-caption {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.gf-numbers {
  display: flex;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
}

.gf-number {
  display: flex;
  flex-direction: column;
  gap: 2px;

  &-label {
    font-size: 11px;
    color: var(--text-tertiary);
  }

  &-value {
    font-size: 15px;
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
  }
}

.gf-gap {
  margin-top: var(--spacing-sm);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);

  &.done {
    color: var(--success-color);
  }

  .gf-perday {
    color: var(--text-tertiary);
  }
}

.gf-extra {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-tertiary);
}

.gf-next {
  margin-top: 6px;
  padding: 4px 8px;
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.1);
  color: #b45309;
  font-size: 11px;
  line-height: 1.5;
}

.gf-tip {
  margin-top: 8px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.gf-acq-title {
  margin-top: 8px;
  font-size: 11px;
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.gf-acq {
  margin: 4px 0 0;
  padding-left: 14px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-tertiary);

  li + li {
    margin-top: 2px;
  }
}
</style>
