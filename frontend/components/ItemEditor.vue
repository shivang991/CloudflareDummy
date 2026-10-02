<script setup lang="ts">
import { ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import ErrorNotice from "./ErrorNotice.vue";
import ScalarInput from "./ScalarInput.vue";
import { api, allAccounts } from "@/lib/api";
import { draftValues, serializeValues, type ValueDraft } from "@/lib/values";
import type { Collection, Item, User } from "@/lib/types";
const props = defineProps<{
  open: boolean;
  collection: Collection;
  accountId: string;
  item: Item | null;
}>();
const emit = defineEmits<{ "update:open": [open: boolean]; saved: [] }>();
const drafts = ref<Record<string, ValueDraft>>({});
const users = ref<User[]>([]);
const saving = ref(false);
const error = ref("");
const referenceError = ref("");
watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    drafts.value = draftValues(props.collection.fields, props.item ?? undefined);
    error.value = "";
    referenceError.value = "";
    if (props.collection.fields.some((field) => field.type === "USER")) {
      try {
        users.value = await allAccounts();
      } catch (reason) {
        referenceError.value = `Account suggestions could not load: ${(reason as Error).message}. You can still enter an account UUID.`;
      }
    }
  },
);
async function save() {
  saving.value = true;
  error.value = "";
  try {
    const values = serializeValues(props.collection.fields, drafts.value, props.item ?? undefined);
    if (props.item && !values.length) {
      emit("update:open", false);
      return;
    }
    await api(`/collections/${props.collection.id}/items${props.item ? `/${props.item.id}` : ""}`, {
      method: props.item ? "PATCH" : "POST",
      query: { actAs: props.accountId },
      body: { values },
    });
    emit("update:open", false);
    emit("saved");
  } catch (reason) {
    error.value = (reason as Error).message;
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <Dialog :open="open" @update:open="!saving && emit('update:open', $event)">
    <DialogContent
      class="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
      @interact-outside="saving && $event.preventDefault()"
      @escape-key-down="saving && $event.preventDefault()"
    >
      <DialogHeader
        ><DialogTitle>{{ item ? "Edit record" : "New record" }}</DialogTitle
        ><DialogDescription>{{
          item
            ? "Update values or clear a field. Other values remain unchanged."
            : "Set the values you need. Unset category fields use their configured defaults."
        }}</DialogDescription></DialogHeader
      >
      <form class="space-y-5" @submit.prevent="save">
        <ErrorNotice :message="error" /><ErrorNotice :message="referenceError" />
        <div
          v-for="field in collection.fields"
          :key="field.id"
          class="space-y-2 rounded-lg border p-3"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <Label :for="`value-${field.id}`">{{ field.name }}</Label
            ><Badge variant="outline">{{ field.type }}</Badge>
          </div>
          <select
            v-if="drafts[field.id]"
            v-model="drafts[field.id]!.mode"
            class="select"
            :aria-label="`${field.name} value mode`"
            :disabled="saving"
          >
            <option v-if="!item" value="omit">Default / leave unset</option>
            <option value="value">Set value</option>
            <option value="clear">{{ item ? "Clear value" : "Leave empty (no default)" }}</option>
          </select>
          <ScalarInput
            v-if="drafts[field.id]?.mode === 'value'"
            :id="`value-${field.id}`"
            v-model="drafts[field.id]!.value"
            :field="field"
            :account-id="accountId"
            :users="users"
            :disabled="saving"
          />
        </div>
        <p v-if="!collection.fields.length" class="muted">
          This collection has no fields. You can create an empty record and add fields later.
        </p>
        <DialogFooter
          ><Button
            type="button"
            variant="outline"
            :disabled="saving"
            @click="emit('update:open', false)"
            >Cancel</Button
          ><Button :disabled="saving">{{
            saving ? "Saving…" : "Save record"
          }}</Button></DialogFooter
        >
      </form>
    </DialogContent>
  </Dialog>
</template>
