<script setup lang="ts">
import { onMounted, ref, useId } from "vue";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useLoader } from "@/composables/loader";
import type { Field, Item, Page, User } from "@/lib/types";
const props = defineProps<{
  modelValue: string;
  field: Field;
  accountId: string;
  users: User[];
  disabled?: boolean;
  id: string;
}>();
defineEmits<{ "update:modelValue": [value: string] }>();
const items = ref<Item[]>([]);
const hasMore = ref(false);
const offset = ref(0);
const listId = useId();
const { busy, error, load } = useLoader(async (signal) => {
  if (props.field.type !== "RELATION" || !props.field.relation_collection_id) return;
  const data = await api<{ items: Item[]; page: Page }>(
    `/collections/${props.field.relation_collection_id}/items`,
    { query: { actAs: props.accountId, limit: 25, offset: offset.value }, signal },
  );
  if (signal.aborted) return;
  items.value = data.items;
  hasMore.value = data.page.has_more;
});
onMounted(load);
function changePage(delta: number) {
  offset.value += delta;
  void load();
}
</script>
<template>
  <div class="space-y-2">
    <Input
      :id="id"
      :model-value="modelValue"
      :list="listId"
      :disabled="disabled"
      required
      pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
      placeholder="Choose a suggestion or enter a UUID"
      @update:model-value="$emit('update:modelValue', String($event))"
    />
    <datalist :id="listId">
      <template v-if="field.type === 'USER'"
        ><option v-for="user in users" :key="user.id" :value="user.id">
          {{ user.profile.name || user.email }} · {{ user.email }}
        </option></template
      >
      <template v-else
        ><option v-for="item in items" :key="item.id" :value="item.id">
          {{ item.values.find((v) => v.type === "TEXT")?.value || item.id }}
        </option></template
      >
    </datalist>
    <div v-if="field.type === 'RELATION'" class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-muted-foreground">{{
        busy ? "Loading suggestions…" : error || `${items.length} record suggestions`
      }}</span
      ><Button
        type="button"
        variant="ghost"
        size="xs"
        :disabled="disabled || busy || !offset"
        @click="changePage(-25)"
        >Previous</Button
      ><Button
        type="button"
        variant="ghost"
        size="xs"
        :disabled="disabled || busy || !hasMore || offset >= 100000"
        @click="changePage(25)"
        >Next</Button
      ><Button v-if="error" type="button" variant="ghost" size="xs" :disabled="busy" @click="load"
        >Retry</Button
      >
    </div>
  </div>
</template>
