<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { ArrowLeft, Plus, Pencil, Trash2, RefreshCw, Rows3, SlidersHorizontal } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import ErrorNotice from "@/components/ErrorNotice.vue";
import PaginationBar from "@/components/PaginationBar.vue";
import ConfirmDelete from "@/components/ConfirmDelete.vue";
import ItemEditor from "@/components/ItemEditor.vue";
import FieldsPanel from "@/components/FieldsPanel.vue";
import ScalarInput from "@/components/ScalarInput.vue";
import { api, allAccounts } from "@/lib/api";
import { displayValue, scalarValue } from "@/lib/values";
import type { User, Collection, Item, Page, ItemFilter } from "@/lib/types";
import { useLoader } from "@/composables/loader";
const route = useRoute();
const accountId = route.params.accountId as string;
const collectionId = route.params.collectionId as string;
const collection = ref<Collection>();
const account = ref<User>();
const items = ref<Item[]>([]);
const users = ref<User[]>([]);
const offset = ref(0);
const hasMore = ref(false);
const tab = ref("records");
const editorOpen = ref(false);
const editing = ref<Item | null>(null);
const deleting = ref<Item | null>(null);
const saving = ref(false);
const actionError = ref("");
const showFilter = ref(false);
const filterFieldId = ref("");
const filterOp = ref<ItemFilter["op"]>("eq");
const filterValue = ref<string | boolean>("");
const appliedFilter = ref<ItemFilter | null>(null);
const filterError = ref("");
const filterField = computed(() =>
  collection.value?.fields.find((field) => field.id === filterFieldId.value),
);
const operators = computed(() => {
  const base = ["eq", "ne", "is_empty", "is_not_empty"] as ItemFilter["op"][];
  if (filterField.value?.type === "TEXT") base.push("contains");
  if (filterField.value && ["NUMBER", "DATE"].includes(filterField.value.type))
    base.push("gt", "gte", "lt", "lte");
  return base;
});
const operatorNames: Record<ItemFilter["op"], string> = {
  eq: "Equals",
  ne: "Does not equal",
  contains: "Contains",
  gt: "Greater than",
  gte: "Greater than or equal",
  lt: "Less than",
  lte: "Less than or equal",
  is_empty: "Is empty",
  is_not_empty: "Is not empty",
};
const { busy, error, load } = useLoader(async (signal) => {
  const [accountData, collectionData, itemData] = await Promise.all([
    api<{ user: User }>(`/users/${accountId}`, { signal }),
    api<{ collection: Collection }>(`/collections/${collectionId}`, {
      query: { actAs: accountId },
      signal,
    }),
    api<{ items: Item[]; page: Page }>(`/collections/${collectionId}/items`, {
      query: {
        actAs: accountId,
        limit: 25,
        offset: offset.value,
        filters: appliedFilter.value ? JSON.stringify([appliedFilter.value]) : undefined,
      },
      signal,
    }),
  ]);
  if (signal.aborted) return;
  account.value = accountData.user;
  collection.value = collectionData.collection;
  items.value = itemData.items;
  hasMore.value = itemData.page.has_more;
  if (!items.value.length && offset.value > 0) {
    offset.value = Math.max(0, offset.value - 25);
    await load();
  }
});
onMounted(load);
watch(filterFieldId, async () => {
  filterOp.value = "eq";
  filterValue.value = filterField.value?.type === "BOOL" ? false : "";
  filterError.value = "";
  if (filterField.value?.type === "USER") {
    try {
      users.value = await allAccounts();
    } catch (reason) {
      filterError.value = (reason as Error).message;
    }
  }
});
function applyFilter() {
  filterError.value = "";
  try {
    if (!filterField.value) throw new Error("Choose a field to filter.");
    const empty = ["is_empty", "is_not_empty"].includes(filterOp.value);
    appliedFilter.value = {
      field_id: filterField.value.id,
      op: filterOp.value,
      ...(!empty ? { value: scalarValue(filterField.value, filterValue.value) } : {}),
    };
    offset.value = 0;
    void load();
  } catch (reason) {
    filterError.value = (reason as Error).message;
  }
}
function clearFilter() {
  appliedFilter.value = null;
  filterError.value = "";
  offset.value = 0;
  void load();
}
function changePage(next: number) {
  offset.value = next;
  void load();
}
function openItem(item: Item | null = null) {
  editing.value = item;
  editorOpen.value = true;
}
function savedItem() {
  if (!editing.value) offset.value = 0;
  void load();
}
function fieldsChanged() {
  appliedFilter.value = null;
  filterFieldId.value = "";
  offset.value = 0;
  void load();
}
async function remove() {
  if (!deleting.value) return;
  saving.value = true;
  actionError.value = "";
  try {
    await api(`/collections/${collectionId}/items/${deleting.value.id}`, {
      method: "DELETE",
      query: { actAs: accountId },
    });
    deleting.value = null;
    await load();
  } catch (reason) {
    actionError.value = (reason as Error).message;
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <div class="space-y-6">
    <RouterLink
      :to="`/admin/accounts/${accountId}/collections`"
      class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      ><ArrowLeft class="size-4" /> {{ account?.profile.name || account?.email || "Account" }} /
      Collections</RouterLink
    >
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="page-heading">{{ collection?.name || "Collection" }}</h1>
        <p class="mt-2 muted">
          {{ collection?.fields.length ?? 0 }} fields · {{ account?.email || "Loading workspace…" }}
        </p>
      </div>
      <Button v-if="tab === 'records'" :disabled="!collection || busy" @click="openItem()"
        ><Plus class="size-4" /> New record</Button
      >
    </div>
    <ErrorNotice :message="error" />
    <div class="flex items-center justify-between border-b">
      <div class="flex gap-5" role="group" aria-label="Collection view">
        <button
          v-for="view in ['records', 'fields']"
          :key="view"
          :aria-pressed="tab === view"
          :class="[
            'flex items-center gap-2 border-b-2 px-1 pt-2 pb-3 text-sm font-medium capitalize',
            tab === view
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground',
          ]"
          @click="tab = view"
        >
          <Rows3 v-if="view === 'records'" class="size-4" /><SlidersHorizontal
            v-else
            class="size-4"
          />{{ view
          }}<Badge variant="secondary">{{
            view === "fields"
              ? (collection?.fields.length ?? 0)
              : `${items.length}${hasMore ? "+" : ""}`
          }}</Badge>
        </button>
      </div>
      <Button
        variant="ghost"
        size="icon"
        :disabled="busy"
        aria-label="Refresh collection"
        @click="load"
        ><RefreshCw :class="['size-4', busy && 'animate-spin']"
      /></Button>
    </div>
    <FieldsPanel
      v-if="tab === 'fields' && collection"
      :collection="collection"
      :account-id="accountId"
      :busy="busy"
      @changed="fieldsChanged"
    />
    <template v-else-if="tab === 'records'">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="muted">
          {{ appliedFilter ? "Filtered records" : "All records" }} · {{ items.length }} on page
        </p>
        <div class="flex gap-2">
          <Button
            v-if="appliedFilter"
            variant="ghost"
            size="sm"
            :disabled="busy"
            @click="clearFilter"
            >Clear filter</Button
          ><Button
            variant="outline"
            size="sm"
            :disabled="!collection?.fields.length"
            :aria-expanded="showFilter"
            @click="showFilter = !showFilter"
            ><SlidersHorizontal class="size-4" /> Filter
            <Badge v-if="appliedFilter" variant="secondary">1</Badge></Button
          >
        </div>
      </div>
      <form v-if="showFilter" class="panel space-y-4 p-4" @submit.prevent="applyFilter">
        <div class="grid items-end gap-3 md:grid-cols-[1fr_1fr_2fr_auto]">
          <div class="form-field">
            <Label for="filter-field">Field</Label
            ><select id="filter-field" v-model="filterFieldId" class="select" :disabled="busy">
              <option disabled value="">Choose a field</option>
              <option v-for="field in collection?.fields" :key="field.id" :value="field.id">
                {{ field.name }}
              </option>
            </select>
          </div>
          <div class="form-field">
            <Label for="filter-op">Condition</Label
            ><select id="filter-op" v-model="filterOp" class="select" :disabled="busy">
              <option v-for="op in operators" :key="op" :value="op">{{ operatorNames[op] }}</option>
            </select>
          </div>
          <div class="form-field">
            <Label
              v-if="filterField && !['is_empty', 'is_not_empty'].includes(filterOp)"
              for="filter-value"
              >Value</Label
            ><ScalarInput
              v-if="filterField && !['is_empty', 'is_not_empty'].includes(filterOp)"
              id="filter-value"
              v-model="filterValue"
              :field="filterField"
              :account-id="accountId"
              :users="users"
              :disabled="busy"
            />
          </div>
          <Button :disabled="busy || !filterField">Apply filter</Button>
        </div>
        <ErrorNotice :message="filterError" />
      </form>
      <section class="panel overflow-hidden">
        <Table
          ><TableHeader
            ><TableRow
              ><TableHead class="pl-5">Record</TableHead
              ><TableHead v-for="field in collection?.fields" :key="field.id">{{
                field.name
              }}</TableHead
              ><TableHead>Created</TableHead
              ><TableHead class="text-right pr-5">Actions</TableHead></TableRow
            ></TableHeader
          ><TableBody
            ><TableRow v-for="item in items" :key="item.id"
              ><TableCell class="pl-5"
                ><button
                  class="font-mono text-xs underline-offset-4 hover:underline"
                  :title="item.id"
                  @click="openItem(item)"
                >
                  {{ item.id.slice(0, 8) }}
                </button></TableCell
              ><TableCell v-for="field in collection?.fields" :key="field.id" class="max-w-72"
                ><span
                  :class="[
                    'block max-w-64 truncate',
                    ['USER', 'RELATION'].includes(field.type) && 'font-mono text-xs',
                  ]"
                  :title="displayValue(field, item)"
                  >{{
                    displayValue(field, item) === "" ? "(empty text)" : displayValue(field, item)
                  }}</span
                ></TableCell
              ><TableCell class="text-muted-foreground">{{
                new Date(item.created_at).toLocaleDateString()
              }}</TableCell
              ><TableCell class="pr-5"
                ><div class="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    :disabled="busy"
                    :aria-label="`Edit record ${item.id.slice(0, 8)}`"
                    @click="openItem(item)"
                    ><Pencil class="size-4" /></Button
                  ><Button
                    variant="ghost"
                    size="icon"
                    :disabled="busy"
                    :aria-label="`Delete record ${item.id.slice(0, 8)}`"
                    @click="
                      actionError = '';
                      deleting = item;
                    "
                    ><Trash2 class="size-4"
                  /></Button></div></TableCell></TableRow
            ><TableRow v-if="!items.length"
              ><TableCell
                :colspan="(collection?.fields.length ?? 0) + 3"
                class="h-40 text-center text-muted-foreground"
                >{{
                  busy
                    ? "Loading records…"
                    : error
                      ? "Records could not be loaded. Try refreshing."
                      : appliedFilter
                        ? "No records match this filter."
                        : "No records yet. Add your first record to get started."
                }}</TableCell
              ></TableRow
            ></TableBody
          ></Table
        ><PaginationBar
          :offset="offset"
          :count="items.length"
          :has-more="hasMore"
          :busy="busy"
          @change="changePage"
        />
      </section>
    </template>
    <ItemEditor
      v-if="collection"
      v-model:open="editorOpen"
      :collection="collection"
      :account-id="accountId"
      :item="editing"
      @saved="savedItem"
    />
    <ConfirmDelete
      :open="!!deleting"
      title="Delete this record?"
      description="This permanently deletes the record and its values. References from other records may prevent deletion."
      :busy="saving"
      :error="actionError"
      @update:open="!$event && (deleting = null)"
      @confirm="remove"
    />
  </div>
</template>
