<script setup lang="ts">
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import ReferenceInput from "./ReferenceInput.vue";
import type { Field, User } from "@/lib/types";
defineProps<{
  modelValue: string | boolean;
  field: Field;
  accountId: string;
  users: User[];
  disabled?: boolean;
  id: string;
}>();
defineEmits<{ "update:modelValue": [value: string | boolean] }>();
</script>
<template>
  <select
    v-if="field.type === 'BOOL'"
    :id="id"
    class="select"
    :value="String(modelValue)"
    :disabled="disabled"
    @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value === 'true')"
  >
    <option value="false">No</option>
    <option value="true">Yes</option>
  </select>
  <select
    v-else-if="field.type === 'CATEGORY'"
    :id="id"
    class="select"
    :value="modelValue as string"
    :disabled="disabled"
    required
    @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <option disabled value="">Choose an option</option>
    <option v-for="option in field.options" :key="option.id" :value="option.id">
      {{ option.name }}
    </option>
  </select>
  <div v-else-if="field.type === 'DATE'">
    <Input
      :id="id"
      :model-value="String(modelValue)"
      type="datetime-local"
      step="0.001"
      required
      :disabled="disabled"
      @update:model-value="$emit('update:modelValue', String($event))"
    />
    <p class="mt-1 text-xs text-muted-foreground">
      Your local time ({{ Intl.DateTimeFormat().resolvedOptions().timeZone }})
    </p>
  </div>
  <Input
    v-else-if="field.type === 'NUMBER'"
    :id="id"
    :model-value="String(modelValue)"
    type="number"
    step="any"
    required
    :disabled="disabled"
    @update:model-value="$emit('update:modelValue', String($event))"
  />
  <ReferenceInput
    v-else-if="field.type === 'USER' || field.type === 'RELATION'"
    :id="id"
    :model-value="String(modelValue)"
    :field="field"
    :account-id="accountId"
    :users="users"
    :disabled="disabled"
    @update:model-value="$emit('update:modelValue', $event)"
  />
  <Textarea
    v-else
    :id="id"
    :model-value="String(modelValue)"
    :disabled="disabled"
    maxlength="10000"
    rows="2"
    @update:model-value="$emit('update:modelValue', String($event))"
  />
</template>
