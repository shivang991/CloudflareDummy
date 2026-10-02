<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { Plus, ArrowLeft, ArrowUpRight, Pencil, Trash2, Layers, RefreshCw } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import ErrorNotice from "@/components/ErrorNotice.vue";
import PaginationBar from "@/components/PaginationBar.vue";
import ConfirmDelete from "@/components/ConfirmDelete.vue";
import { api } from "@/lib/api";
import type { User, Collection, Page } from "@/lib/types";
import { useLoader } from "@/composables/loader";
const accountId = useRoute().params.accountId as string;
const account = ref<User>();
const collections = ref<Collection[]>([]);
const offset = ref(0);
const hasMore = ref(false);
const dialog = ref(false);
const editing = ref<Collection | null>(null);
const deleting = ref<Collection | null>(null);
const name = ref("");
const saving = ref(false);
const formError = ref("");
const { busy, error, load } = useLoader(async (signal) => {
  const [userData, data] = await Promise.all([
    api<{ user: User }>(`/users/${accountId}`, { signal }),
    api<{ collections: Collection[]; page: Page }>("/collections", {
      query: { actAs: accountId, limit: 25, offset: offset.value },
      signal,
    }),
  ]);
  if (signal.aborted) return;
  account.value = userData.user;
  collections.value = data.collections;
  hasMore.value = data.page.has_more;
  if (!collections.value.length && offset.value > 0) {
    offset.value = Math.max(0, offset.value - 25);
    await load();
  }
});
onMounted(load);
function openForm(collection: Collection | null = null) {
  editing.value = collection;
  name.value = collection?.name ?? "";
  formError.value = "";
  dialog.value = true;
}
async function save() {
  saving.value = true;
  formError.value = "";
  try {
    await api(editing.value ? `/collections/${editing.value.id}` : "/collections", {
      method: editing.value ? "PATCH" : "POST",
      query: { actAs: accountId },
      body: { name: name.value },
    });
    dialog.value = false;
    if (!editing.value) offset.value = 0;
    await load();
  } catch (reason) {
    formError.value = (reason as Error).message;
  } finally {
    saving.value = false;
  }
}
async function remove() {
  if (!deleting.value) return;
  saving.value = true;
  formError.value = "";
  try {
    await api(`/collections/${deleting.value.id}`, {
      method: "DELETE",
      query: { actAs: accountId },
    });
    deleting.value = null;
    await load();
  } catch (reason) {
    formError.value = (reason as Error).message;
  } finally {
    saving.value = false;
  }
}
function changePage(next: number) {
  offset.value = next;
  void load();
}
</script>
<template>
  <div class="space-y-6">
    <RouterLink
      to="/admin/accounts"
      class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      ><ArrowLeft class="size-4" /> All accounts</RouterLink
    >
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-3">
          <h1 class="page-heading">
            {{ account?.profile.name || account?.email || "Account workspace" }}
          </h1>
          <Badge v-if="account" variant="secondary">{{ account.role }}</Badge>
        </div>
        <p class="mt-2 muted">{{ account?.email }} · Collections and records</p>
      </div>
      <Button :disabled="!account || busy" @click="openForm()"
        ><Plus class="size-4" /> New collection</Button
      >
    </div>
    <ErrorNotice :message="error" />
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-medium">
        Collections <span class="ml-1 text-muted-foreground">{{ collections.length }} on page</span>
      </h2>
      <Button
        variant="ghost"
        size="icon"
        :disabled="busy"
        aria-label="Refresh collections"
        @click="load"
        ><RefreshCw :class="['size-4', busy && 'animate-spin']"
      /></Button>
    </div>
    <div v-if="collections.length" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <article v-for="collection in collections" :key="collection.id" class="panel p-5">
        <div class="mb-5 flex items-start justify-between">
          <div class="flex size-10 items-center justify-center rounded-lg bg-muted">
            <Layers class="size-5 text-muted-foreground" />
          </div>
          <div class="flex">
            <Button
              variant="ghost"
              size="icon"
              :aria-label="`Rename ${collection.name}`"
              @click="openForm(collection)"
              ><Pencil class="size-4" /></Button
            ><Button
              variant="ghost"
              size="icon"
              :aria-label="`Delete ${collection.name}`"
              @click="
                formError = '';
                deleting = collection;
              "
              ><Trash2 class="size-4"
            /></Button>
          </div>
        </div>
        <RouterLink
          :to="`/admin/accounts/${accountId}/collections/${collection.id}`"
          class="block font-semibold hover:underline"
          >{{ collection.name }}</RouterLink
        >
        <p class="mt-2 muted">
          {{ collection.fields.length }} {{ collection.fields.length === 1 ? "field" : "fields" }} ·
          Created {{ new Date(collection.created_at).toLocaleDateString() }}
        </p>
        <div class="mt-4 flex flex-wrap gap-1.5">
          <Badge v-for="field in collection.fields.slice(0, 3)" :key="field.id" variant="outline">{{
            field.name
          }}</Badge
          ><Badge v-if="collection.fields.length > 3" variant="outline"
            >+{{ collection.fields.length - 3 }}</Badge
          >
          <p v-if="!collection.fields.length" class="text-xs text-muted-foreground">
            Add fields to define your records.
          </p>
        </div>
        <Button variant="outline" size="sm" class="mt-6 w-full justify-between" as-child
          ><RouterLink :to="`/admin/accounts/${accountId}/collections/${collection.id}`"
            >Open collection <ArrowUpRight class="size-4" /></RouterLink
        ></Button>
      </article>
    </div>
    <div v-else class="panel flex flex-col items-center px-6 py-16 text-center">
      <Layers class="mb-4 size-8 text-muted-foreground" />
      <h2 class="font-medium">
        {{
          busy ? "Loading collections…" : error ? "Collections unavailable" : "A fresh workspace"
        }}
      </h2>
      <p class="mt-2 muted">
        {{
          error
            ? "Try refreshing to load this account."
            : "Create a collection, then add fields and records."
        }}
      </p>
    </div>
    <PaginationBar
      class="rounded-xl border bg-white"
      :offset="offset"
      :count="collections.length"
      :has-more="hasMore"
      :busy="busy"
      @change="changePage"
    />
    <Dialog :open="dialog" @update:open="!saving && (dialog = $event)"
      ><DialogContent
        @interact-outside="saving && $event.preventDefault()"
        @escape-key-down="saving && $event.preventDefault()"
        ><DialogHeader
          ><DialogTitle>{{ editing ? "Rename collection" : "New collection" }}</DialogTitle
          ><DialogDescription
            >Collections organize records with a shared set of fields.</DialogDescription
          ></DialogHeader
        >
        <form class="space-y-4" @submit.prevent="save">
          <ErrorNotice :message="formError" />
          <div class="form-field">
            <Label for="collection-name">Collection name</Label
            ><Input
              id="collection-name"
              v-model="name"
              required
              maxlength="200"
              :disabled="saving"
              placeholder="e.g. Companies"
            />
          </div>
          <DialogFooter
            ><Button type="button" variant="outline" :disabled="saving" @click="dialog = false"
              >Cancel</Button
            ><Button :disabled="saving || !name.trim()">{{
              saving ? "Saving…" : "Save collection"
            }}</Button></DialogFooter
          >
        </form></DialogContent
      ></Dialog
    >
    <ConfirmDelete
      :open="!!deleting"
      :title="`Delete ${deleting?.name}?`"
      description="This permanently deletes the collection, all its fields, and all its records. References from other collections may prevent deletion."
      :busy="saving"
      :error="formError"
      @update:open="!$event && (deleting = null)"
      @confirm="remove"
    />
  </div>
</template>
