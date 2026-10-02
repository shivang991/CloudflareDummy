<script setup lang="ts">
import { Button } from "@/components/ui/button";
defineProps<{ offset: number; count: number; hasMore: boolean; busy: boolean; limit?: number }>();
defineEmits<{ change: [offset: number] }>();
</script>
<template>
  <div class="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4">
    <p class="muted">
      {{ count ? `${offset + 1}–${offset + count}` : "No results" }}
      <span v-if="count">on this page</span>
    </p>
    <div class="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        :disabled="busy || offset === 0"
        @click="$emit('change', Math.max(0, offset - (limit ?? 25)))"
        >Previous</Button
      >
      <Button
        variant="outline"
        size="sm"
        :disabled="busy || !hasMore || offset + (limit ?? 25) > 100000"
        @click="$emit('change', offset + (limit ?? 25))"
        >Next</Button
      >
    </div>
  </div>
</template>
