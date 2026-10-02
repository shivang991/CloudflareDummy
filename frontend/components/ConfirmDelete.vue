<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import ErrorNotice from "./ErrorNotice.vue";
defineProps<{ open: boolean; title: string; description: string; busy: boolean; error: string }>();
const emit = defineEmits<{ "update:open": [open: boolean]; confirm: [] }>();
const handleOpen = (open: boolean, busy: boolean) => {
  if (!busy) emit("update:open", open);
};
</script>
<template>
  <Dialog :open="open" @update:open="handleOpen($event, busy)">
    <DialogContent
      @interact-outside="busy && $event.preventDefault()"
      @escape-key-down="busy && $event.preventDefault()"
    >
      <DialogHeader
        ><DialogTitle>{{ title }}</DialogTitle
        ><DialogDescription>{{ description }}</DialogDescription></DialogHeader
      >
      <ErrorNotice :message="error" />
      <DialogFooter>
        <Button variant="outline" :disabled="busy" @click="emit('update:open', false)"
          >Cancel</Button
        >
        <Button variant="destructive" :disabled="busy" @click="emit('confirm')">{{
          busy ? "Deleting…" : "Delete permanently"
        }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
