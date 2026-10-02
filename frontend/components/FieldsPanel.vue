<script setup lang="ts">
import { ref } from "vue";
import { Plus, Pencil, Trash2 } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import ConfirmDelete from "./ConfirmDelete.vue";
import ErrorNotice from "./ErrorNotice.vue";
import { api, allCollections } from "@/lib/api";
import type { Field, Collection, CreateField } from "@/lib/types";
const props = defineProps<{ collection: Collection; accountId: string; busy: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const fieldTypes = ["TEXT", "NUMBER", "BOOL", "DATE", "CATEGORY", "USER", "RELATION"] as const;
const dialog = ref(false);
const editing = ref<Field | null>(null);
const deleting = ref<Field | null>(null);
const saving = ref(false);
const loadingTargets = ref(false);
const error = ref("");
const targets = ref<Collection[]>([]);
const name = ref("");
const type = ref<CreateField["type"]>("TEXT");
const relation = ref("");
const options = ref([{ name: "", default: false }]);
async function openForm(field: Field | null = null) {
  editing.value = field;
  name.value = field?.name ?? "";
  type.value = field?.type ?? "TEXT";
  relation.value = "";
  options.value = [{ name: "", default: false }];
  error.value = "";
  dialog.value = true;
  if (!field) {
    loadingTargets.value = true;
    try {
      targets.value = await allCollections(props.accountId);
    } catch (reason) {
      error.value = (reason as Error).message;
    } finally {
      loadingTargets.value = false;
    }
  }
}
async function save() {
  saving.value = true;
  error.value = "";
  try {
    const body = editing.value
      ? { name: name.value }
      : {
          name: name.value,
          type: type.value,
          ...(type.value === "CATEGORY" ? { options: options.value } : {}),
          ...(type.value === "RELATION" ? { relation_collection_id: relation.value } : {}),
        };
    await api(
      `/collections/${props.collection.id}/fields${editing.value ? `/${editing.value.id}` : ""}`,
      { method: editing.value ? "PATCH" : "POST", query: { actAs: props.accountId }, body },
    );
    dialog.value = false;
    emit("changed");
  } catch (reason) {
    error.value = (reason as Error).message;
  } finally {
    saving.value = false;
  }
}
async function remove() {
  if (!deleting.value) return;
  saving.value = true;
  error.value = "";
  try {
    await api(`/collections/${props.collection.id}/fields/${deleting.value.id}`, {
      method: "DELETE",
      query: { actAs: props.accountId },
    });
    deleting.value = null;
    emit("changed");
  } catch (reason) {
    error.value = (reason as Error).message;
  } finally {
    saving.value = false;
  }
}
function setDefault(index: number) {
  options.value.forEach((option, i) => {
    option.default = i === index ? !option.default : false;
  });
}
</script>
<template>
  <section class="panel overflow-hidden">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
      <div>
        <h2 class="font-medium">Collection fields</h2>
        <p class="mt-1 muted">Define the shape of each record.</p>
      </div>
      <Button size="sm" :disabled="busy" @click="openForm()"
        ><Plus class="size-4" /> Add field</Button
      >
    </div>
    <Table
      ><TableHeader
        ><TableRow
          ><TableHead class="pl-5">Name</TableHead><TableHead>Type</TableHead
          ><TableHead>Configuration</TableHead
          ><TableHead class="text-right pr-5">Actions</TableHead></TableRow
        ></TableHeader
      ><TableBody
        ><TableRow v-for="field in collection.fields" :key="field.id"
          ><TableCell class="pl-5 font-medium">{{ field.name }}</TableCell
          ><TableCell
            ><Badge variant="secondary">{{ field.type }}</Badge></TableCell
          ><TableCell class="max-w-72 whitespace-normal text-muted-foreground"
            ><span v-if="field.type === 'CATEGORY'">{{
              field.options.map((o) => o.name + (o.default ? " (default)" : "")).join(", ")
            }}</span
            ><span v-else-if="field.type === 'RELATION'" class="text-xs">{{
              field.relation_collection_id
            }}</span
            ><span v-else>—</span></TableCell
          ><TableCell class="pr-5"
            ><div class="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                :disabled="busy"
                :aria-label="`Rename ${field.name}`"
                @click="openForm(field)"
                ><Pencil class="size-4" /></Button
              ><Button
                variant="ghost"
                size="icon"
                :disabled="busy"
                :aria-label="`Delete field ${field.name}`"
                @click="
                  error = '';
                  deleting = field;
                "
                ><Trash2 class="size-4"
              /></Button></div></TableCell></TableRow
        ><TableRow v-if="!collection.fields.length"
          ><TableCell :colspan="4" class="h-36 text-center text-muted-foreground"
            >No fields yet. Add a field to start shaping this collection.</TableCell
          ></TableRow
        ></TableBody
      ></Table
    >
    <Dialog :open="dialog" @update:open="!saving && (dialog = $event)"
      ><DialogContent
        class="max-h-[90dvh] overflow-y-auto"
        @interact-outside="saving && $event.preventDefault()"
        @escape-key-down="saving && $event.preventDefault()"
        ><DialogHeader
          ><DialogTitle>{{ editing ? "Rename field" : "Add field" }}</DialogTitle
          ><DialogDescription
            >Field types, category options, and relation targets cannot be changed after
            creation.</DialogDescription
          ></DialogHeader
        >
        <form class="space-y-4" @submit.prevent="save">
          <ErrorNotice :message="error" />
          <div class="form-field">
            <Label for="field-name">Field name</Label
            ><Input id="field-name" v-model="name" required maxlength="200" :disabled="saving" />
          </div>
          <div v-if="!editing" class="form-field">
            <Label for="field-type">Type</Label
            ><select id="field-type" v-model="type" class="select" :disabled="saving">
              <option v-for="fieldType in fieldTypes" :key="fieldType" :value="fieldType">
                {{ fieldType }}
              </option>
            </select>
          </div>
          <div v-if="!editing && type === 'CATEGORY'" class="space-y-3">
            <Label>Category options</Label>
            <div v-for="(option, index) in options" :key="index" class="flex items-center gap-2">
              <Input
                v-model="option.name"
                :aria-label="`Option ${index + 1} name`"
                required
                maxlength="200"
                :disabled="saving"
              /><label class="flex items-center gap-1 text-xs"
                ><input
                  type="checkbox"
                  :checked="option.default"
                  :disabled="saving"
                  @change="setDefault(index)"
                />
                Default</label
              ><Button
                type="button"
                variant="ghost"
                size="icon"
                :aria-label="`Remove option ${index + 1}`"
                :disabled="saving || options.length === 1"
                @click="options.splice(index, 1)"
                ><Trash2 class="size-4"
              /></Button>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              :disabled="saving || options.length >= 100"
              @click="options.push({ name: '', default: false })"
              >Add option</Button
            >
          </div>
          <div v-if="!editing && type === 'RELATION'" class="form-field">
            <Label for="relation-target">Related collection</Label
            ><select
              id="relation-target"
              v-model="relation"
              class="select"
              required
              :disabled="saving || loadingTargets"
            >
              <option disabled value="">
                {{ loadingTargets ? "Loading collections…" : "Choose a collection" }}
              </option>
              <option v-for="target in targets" :key="target.id" :value="target.id">
                {{ target.name }}
              </option>
            </select>
          </div>
          <DialogFooter
            ><Button type="button" variant="outline" :disabled="saving" @click="dialog = false"
              >Cancel</Button
            ><Button
              :disabled="saving || !name.trim() || (!editing && type === 'RELATION' && !relation)"
              >{{ saving ? "Saving…" : "Save field" }}</Button
            ></DialogFooter
          >
        </form>
      </DialogContent></Dialog
    >
    <ConfirmDelete
      :open="!!deleting"
      :title="`Delete field ${deleting?.name}?`"
      description="This permanently deletes this field and its values from every record in the collection."
      :busy="saving"
      :error="error"
      @update:open="!$event && (deleting = null)"
      @confirm="remove"
    />
  </section>
</template>
