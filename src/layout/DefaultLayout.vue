<template>
  <div class="default-layout">
    <AppNav />
    <div class="main">
      <router-view />
    </div>
  </div>
</template>

<script setup>
import AppNav from "@/components/Common/AppNav.vue";
</script>
