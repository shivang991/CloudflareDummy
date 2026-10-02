<script setup lang="ts">
defineProps<{ message: string }>();
</script>
<template>
  <div v-if="message" role="alert" class="error-box">{{ message }}</div>
</template>
