<template>
  <div class="gf-activity">
    <GoldFishEventCard
      :plan="plan"
      :festival="festival"
      :festival-options="festivalOptions"
      :preset-options="presetOptions"
      :preset-key="presetKey"
      :festival-key="festivalKey"
      :live="live"
      :micro-star="microStar"
      :book-scope="bookInfo.scope"
      :daily-income="dailyIncome"
      :book-tier="bookTier"
      :market="market"
      :market-items="marketItems"
      @update:preset-key="setPresetKey"
      @update:festival-key="setFestivalKey"
      @update:daily-income="setDailyIncome"
      @update:book-tier="setBookTier"
      @update:book-star="setBookStar"
      @toggle-market="toggleMarketItem"
      @move-market="moveMarketItem"
    />

    <GoldFishResourceCard
      v-for="row in plan.rows"
      :key="row.key"
      :row="row"
      :pot-days="plan.potDays"
      :chest-rounds="plan.bookTierRounds"
    />
  </div>
</template>

<script setup>
import { onMounted } from "vue";
import { useGoldFishPlan } from "@/composables/useGoldFishPlan";
import { useTokenStore } from "@/stores/tokenStore";
import GoldFishEventCard from "./GoldFishEventCard.vue";
import GoldFishResourceCard from "./GoldFishResourceCard.vue";

const tokenStore = useTokenStore();
const {
  plan,
  festival,
  festivalOptions,
  presetOptions,
  presetKey,
  festivalKey,
  live,
  microStar,
  bookInfo,
  dailyIncome,
  bookTier,
  market,
  marketItems,
  setPresetKey,
  setFestivalKey,
  toggleMarketItem,
  moveMarketItem,
  setBookStar,
  setBookTier,
} = useGoldFishPlan();

const setDailyIncome = (value) => {
  dailyIncome.value = Math.max(0, Number(value) || 0);
};

onMounted(() => {
  const token = tokenStore.selectedToken;
  if (!token) return;
  if (tokenStore.getWebSocketStatus(token.id) === "connected") {
    tokenStore.sendMessage(token.id, "role_getroleinfo");
  }
});
</script>

<style scoped lang="scss">
/* display: contents 让大卡片与 5 张资源卡直接成为 GameStatus 网格的子项，
   从而保证大卡片与身份牌同宽、资源卡与“日常”卡片同宽 */
.gf-activity {
  display: contents;
}
</style>
