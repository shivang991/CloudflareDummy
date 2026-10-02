<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { Plus, KeyRound, Copy, Check, Trash2, RefreshCw } from "@lucide/vue";
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
import ErrorNotice from "@/components/ErrorNotice.vue";
import PaginationBar from "@/components/PaginationBar.vue";
import ConfirmDelete from "@/components/ConfirmDelete.vue";
import { api } from "@/lib/api";
import type { ApiKey, Page } from "@/lib/types";
import { useLoader } from "@/composables/loader";
import { currentUser } from "@/composables/auth";

const keys = ref<ApiKey[]>([]);
const offset = ref(0);
const hasMore = ref(false);
const dialog = ref(false);
const deleting = ref<ApiKey | null>(null);
const saving = ref(false);
const name = ref("");
const secret = ref("");
const copied = ref(false);
const copying = ref(false);
const formError = ref("");
let disposed = false;
let mutation: AbortController | undefined;

const { busy, error, load } = useLoader(async (signal) => {
  const data = await api<{ api_keys: ApiKey[]; page: Page }>("/api-keys", {
    query: { limit: 25, offset: offset.value },
    signal,
  });
  if (signal.aborted) return;
  keys.value = data.api_keys;
  hasMore.value = data.page.has_more;
  if (!keys.value.length && offset.value > 0) {
    offset.value = Math.max(0, offset.value - 25);
    await load();
  }
});
onMounted(load);
onUnmounted(() => {
  disposed = true;
  mutation?.abort();
  secret.value = "";
});

function openForm() {
  name.value = "";
  secret.value = "";
  copied.value = false;
  formError.value = "";
  dialog.value = true;
}
function closeForm(open: boolean) {
  if (saving.value) return;
  dialog.value = open;
  if (!open) {
    secret.value = "";
    copied.value = false;
    formError.value = "";
  }
}
async function create() {
  if (saving.value || !name.value.trim()) return;
  saving.value = true;
  formError.value = "";
  mutation = new AbortController();
  try {
    const result = await api<{ api_key: ApiKey; key: string }>("/api-keys", {
      method: "POST",
      body: { name: name.value.trim() },
      signal: mutation.signal,
    });
    if (disposed) return;
    secret.value = result.key;
    name.value = result.api_key.name;
    offset.value = 0;
    await load();
  } catch (reason) {
    if (!disposed) formError.value = (reason as Error).message;
  } finally {
    saving.value = false;
  }
}
async function copyKey() {
  copying.value = true;
  copied.value = false;
  formError.value = "";
  try {
    await navigator.clipboard.writeText(secret.value);
    if (!disposed && secret.value) copied.value = true;
  } catch {
    if (!disposed && secret.value)
      formError.value = "Could not copy automatically. Select the key and copy it manually.";
  } finally {
    copying.value = false;
  }
}
async function revoke() {
  if (!deleting.value || saving.value) return;
  saving.value = true;
  formError.value = "";
  mutation = new AbortController();
  try {
    await api(`/api-keys/${deleting.value.id}`, { method: "DELETE", signal: mutation.signal });
    if (disposed) return;
    deleting.value = null;
    await load();
  } catch (reason) {
    if (!disposed) formError.value = (reason as Error).message;
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
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="page-heading">API keys</h1>
        <p class="mt-2 muted">Manage integration keys for {{ currentUser?.email }}.</p>
      </div>
      <Button :disabled="saving" @click="openForm"><Plus class="size-4" /> Create API key</Button>
    </div>
    <div class="panel flex items-start gap-3 p-5">
      <KeyRound class="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div class="space-y-1 text-sm leading-6">
        <p class="font-medium">Item access for your account</p>
        <p class="text-muted-foreground">
          Keys can create, read, update, and delete items, and read collections and their field
          definitions in your account. They cannot manage accounts, collections, or fields, or
          access another account’s workspace.
        </p>
      </div>
    </div>
    <ErrorNotice :message="error" />
    <section class="panel overflow-hidden">
      <div class="flex items-center justify-between gap-3 border-b px-5 py-4">
        <div class="flex items-center gap-2 text-sm font-medium">
          <KeyRound class="size-4 text-muted-foreground" /> Your keys
          <Badge variant="secondary">{{ keys.length }} on page</Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          :disabled="busy || saving"
          aria-label="Refresh API keys"
          @click="load"
        >
          <RefreshCw :class="['size-4', busy && 'animate-spin']" />
        </Button>
      </div>
      <Table>
        <TableHeader
          ><TableRow>
            <TableHead class="pl-5">Name</TableHead
            ><TableHead class="hidden sm:table-cell">Key prefix</TableHead>
            <TableHead class="hidden sm:table-cell">Created</TableHead
            ><TableHead class="pr-5 text-right">Actions</TableHead>
          </TableRow></TableHeader
        >
        <TableBody>
          <TableRow v-for="key in keys" :key="key.id">
            <TableCell class="pl-5">
              <div class="max-w-40 break-words whitespace-normal font-medium sm:max-w-64">
                {{ key.name }}
              </div>
              <div class="mt-1 grid gap-1 text-xs text-muted-foreground sm:hidden">
                <code>{{ key.key_prefix }}…</code>
                <span>Created {{ new Date(key.created_at).toLocaleDateString() }}</span>
              </div>
            </TableCell>
            <TableCell class="hidden sm:table-cell"
              ><code class="text-xs text-muted-foreground">{{ key.key_prefix }}…</code></TableCell
            >
            <TableCell class="hidden text-muted-foreground sm:table-cell">{{
              new Date(key.created_at).toLocaleDateString()
            }}</TableCell>
            <TableCell class="pr-5 text-right">
              <Button
                variant="ghost"
                size="sm"
                :disabled="saving"
                :aria-label="`Revoke ${key.name}`"
                @click="
                  formError = '';
                  deleting = key;
                "
              >
                <Trash2 class="size-4" /> Revoke
              </Button>
            </TableCell>
          </TableRow>
          <TableRow v-if="!keys.length"
            ><TableCell :colspan="4" class="h-40 text-center text-muted-foreground">
              {{
                busy
                  ? "Loading API keys…"
                  : error
                    ? "API keys could not be loaded. Try refreshing."
                    : "No API keys yet. Create a key to connect an integration."
              }}
            </TableCell></TableRow
          >
        </TableBody>
      </Table>
      <PaginationBar
        :offset="offset"
        :count="keys.length"
        :has-more="hasMore"
        :busy="busy || saving"
        @change="changePage"
      />
    </section>
    <Dialog :open="dialog" @update:open="closeForm">
      <DialogContent
        :show-close-button="!saving && !secret"
        @interact-outside="(saving || secret) && $event.preventDefault()"
        @escape-key-down="(saving || secret) && $event.preventDefault()"
      >
        <DialogHeader>
          <DialogTitle>{{ secret ? "API key created" : "Create API key" }}</DialogTitle>
          <DialogDescription>
            {{
              secret
                ? `Save the key for ${name} now. You won’t be able to view it again.`
                : "Give this key a name to identify the integration using it."
            }}
          </DialogDescription>
        </DialogHeader>
        <ErrorNotice :message="formError" />
        <template v-if="secret">
          <div class="form-field">
            <Label for="new-api-key">Your new API key</Label>
            <textarea
              id="new-api-key"
              :value="secret"
              readonly
              spellcheck="false"
              class="min-h-24 w-full resize-none break-all rounded-md border bg-white p-3 font-mono text-sm"
              @focus="($event.target as HTMLTextAreaElement).select()"
            />
          </div>
          <p class="muted">Send this key in the <code>X-API-Key</code> request header.</p>
          <p v-if="copied" role="status" class="text-sm text-green-700">Key copied to clipboard.</p>
          <DialogFooter>
            <Button variant="outline" :disabled="copying" @click="copyKey"
              ><Check v-if="copied" class="size-4" /><Copy v-else class="size-4" />{{
                copied ? "Copied" : "Copy key"
              }}</Button
            >
            <Button :disabled="saving || copying" @click="closeForm(false)"
              >I’ve saved the key</Button
            >
          </DialogFooter>
        </template>
        <form v-else class="space-y-4" @submit.prevent="create">
          <div class="form-field">
            <Label for="key-name">Key name</Label>
            <Input
              id="key-name"
              v-model="name"
              placeholder="e.g. Website integration"
              required
              maxlength="200"
              :disabled="saving"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" :disabled="saving" @click="closeForm(false)"
              >Cancel</Button
            >
            <Button type="submit" :disabled="saving || !name.trim()">{{
              saving ? "Creating…" : "Create key"
            }}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <ConfirmDelete
      :open="!!deleting"
      :title="`Revoke ${deleting?.name}?`"
      description="This key will stop working immediately. Integrations using it will need a new key."
      confirm-label="Revoke key"
      busy-label="Revoking…"
      :busy="saving"
      :error="formError"
      @update:open="!$event && (deleting = null)"
      @confirm="revoke"
    />
  </div>
</template>
