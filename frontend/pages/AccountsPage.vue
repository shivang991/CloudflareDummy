<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Plus, ArrowUpRight, Pencil, Trash2, RefreshCw, Users } from "@lucide/vue";
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
import type { User, Page } from "@/lib/types";
import { useLoader } from "@/composables/loader";
import { currentUser, signOut } from "@/composables/auth";
const users = ref<User[]>([]);
const offset = ref(0);
const hasMore = ref(false);
const dialog = ref(false);
const editing = ref<User | null>(null);
const deleting = ref<User | null>(null);
const saving = ref(false);
const formError = ref("");
const form = ref({ email: "", name: "", avatar_url: "", role: "USER" });
const { busy, error, load } = useLoader(async (signal) => {
  const data = await api<{ users: User[]; page: Page }>("/users", {
    query: { limit: 25, offset: offset.value },
    signal,
  });
  if (signal.aborted) return;
  users.value = data.users;
  hasMore.value = data.page.has_more;
  if (!users.value.length && offset.value > 0) {
    offset.value = Math.max(0, offset.value - 25);
    await load();
  }
});
onMounted(load);
function openForm(user: User | null = null) {
  editing.value = user;
  form.value = {
    email: user?.email ?? "",
    name: user?.profile.name ?? "",
    avatar_url: user?.profile.avatar_url ?? "",
    role: user?.role ?? "USER",
  };
  formError.value = "";
  dialog.value = true;
}
async function save() {
  saving.value = true;
  formError.value = "";
  try {
    const { user } = await api<{ user: User }>(
      editing.value ? `/users/${editing.value.id}` : "/users",
      {
        method: editing.value ? "PATCH" : "POST",
        body: {
          email: form.value.email,
          role: form.value.role,
          profile: {
            ...(form.value.name.trim() ? { name: form.value.name.trim() } : {}),
            ...(form.value.avatar_url.trim() ? { avatar_url: form.value.avatar_url.trim() } : {}),
          },
        },
      },
    );
    dialog.value = false;
    if (user.id === currentUser.value?.id) {
      if (user.role !== "ADMIN") {
        signOut("Your admin access was removed.");
        return;
      }
      currentUser.value = user;
    }
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
  const id = deleting.value.id;
  saving.value = true;
  formError.value = "";
  try {
    await api(`/users/${id}`, { method: "DELETE" });
    deleting.value = null;
    if (id === currentUser.value?.id) {
      signOut("Your account was deleted.");
      return;
    }
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
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="page-heading">Accounts</h1>
        <p class="mt-2 muted">Manage access and open an account’s workspace.</p>
      </div>
      <Button @click="openForm()"><Plus class="size-4" /> Add account</Button>
    </div>
    <ErrorNotice :message="error" />
    <section class="panel overflow-hidden">
      <div class="flex items-center justify-between border-b px-5 py-4">
        <div class="flex items-center gap-2 text-sm font-medium">
          <Users class="size-4 text-muted-foreground" /> All accounts
          <Badge variant="secondary">{{ users.length }} on page</Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          :disabled="busy"
          aria-label="Refresh accounts"
          @click="load"
          ><RefreshCw :class="['size-4', busy && 'animate-spin']"
        /></Button>
      </div>
      <Table>
        <TableHeader
          ><TableRow
            ><TableHead class="pl-5">Account</TableHead><TableHead>Role</TableHead
            ><TableHead>Created</TableHead
            ><TableHead class="text-right pr-5">Actions</TableHead></TableRow
          ></TableHeader
        >
        <TableBody>
          <TableRow v-for="user in users" :key="user.id"
            ><TableCell class="pl-5"
              ><div class="flex items-center gap-3">
                <div
                  class="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted font-medium"
                >
                  {{ (user.profile.name || user.email).slice(0, 1).toUpperCase() }}
                </div>
                <div>
                  <RouterLink
                    :to="`/admin/accounts/${user.id}/collections`"
                    class="font-medium hover:underline"
                    >{{ user.profile.name || user.email }}</RouterLink
                  >
                  <p class="mt-0.5 text-xs text-muted-foreground">
                    {{ user.email }} <span v-if="user.id === currentUser?.id">· You</span>
                  </p>
                </div>
              </div></TableCell
            ><TableCell
              ><Badge :variant="user.role === 'ADMIN' ? 'default' : 'secondary'">{{
                user.role
              }}</Badge></TableCell
            ><TableCell class="text-muted-foreground">{{
              new Date(user.created_at).toLocaleDateString()
            }}</TableCell
            ><TableCell class="pr-5"
              ><div class="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  :aria-label="`Edit ${user.email}`"
                  @click="openForm(user)"
                  ><Pencil class="size-4" /></Button
                ><Button
                  variant="ghost"
                  size="icon"
                  :aria-label="`Delete ${user.email}`"
                  @click="
                    formError = '';
                    deleting = user;
                  "
                  ><Trash2 class="size-4" /></Button
                ><Button variant="ghost" size="icon" as-child
                  ><RouterLink
                    :to="`/admin/accounts/${user.id}/collections`"
                    :aria-label="`Open ${user.email}`"
                    ><ArrowUpRight class="size-4" /></RouterLink
                ></Button></div></TableCell
          ></TableRow>
          <TableRow v-if="!users.length"
            ><TableCell :colspan="4" class="h-40 text-center text-muted-foreground">{{
              busy
                ? "Loading accounts…"
                : error
                  ? "Accounts could not be loaded. Try refreshing."
                  : "No accounts yet. Add an account to get started."
            }}</TableCell></TableRow
          >
        </TableBody>
      </Table>
      <PaginationBar
        :offset="offset"
        :count="users.length"
        :has-more="hasMore"
        :busy="busy"
        @change="changePage"
      />
    </section>
    <Dialog :open="dialog" @update:open="!saving && (dialog = $event)">
      <DialogContent
        @interact-outside="saving && $event.preventDefault()"
        @escape-key-down="saving && $event.preventDefault()"
      >
        <DialogHeader
          ><DialogTitle>{{ editing ? "Edit account" : "Add account" }}</DialogTitle
          ><DialogDescription>{{
            editing
              ? "Update this account’s profile and access."
              : "Provision an account for a verified Google email. They can sign in with Google when ready."
          }}</DialogDescription></DialogHeader
        >
        <form class="space-y-4" @submit.prevent="save">
          <ErrorNotice :message="formError" />
          <div class="form-field">
            <Label for="email">Google email</Label
            ><Input
              id="email"
              v-model="form.email"
              type="email"
              required
              maxlength="320"
              :disabled="saving"
            />
          </div>
          <div class="form-field">
            <Label for="name">Name</Label
            ><Input id="name" v-model="form.name" maxlength="200" :disabled="saving" />
          </div>
          <div class="form-field">
            <Label for="avatar"
              >Avatar URL <span class="text-muted-foreground">(optional)</span></Label
            ><Input
              id="avatar"
              v-model="form.avatar_url"
              type="url"
              maxlength="2000"
              :disabled="saving"
            />
          </div>
          <div class="form-field">
            <Label for="role">Role</Label
            ><select id="role" v-model="form.role" class="select" :disabled="saving">
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <p
            v-if="editing?.id === currentUser?.id && form.role !== 'ADMIN'"
            class="text-sm text-amber-700"
          >
            Removing your admin role will sign you out of this dashboard.
          </p>
          <DialogFooter
            ><Button type="button" variant="outline" :disabled="saving" @click="dialog = false"
              >Cancel</Button
            ><Button type="submit" :disabled="saving">{{
              saving ? "Saving…" : "Save account"
            }}</Button></DialogFooter
          >
        </form>
      </DialogContent>
    </Dialog>
    <ConfirmDelete
      :open="!!deleting"
      :title="`Delete ${deleting?.profile.name || deleting?.email}?`"
      description="This permanently deletes the account, its collections, fields, and records. References from other accounts may prevent deletion."
      :busy="saving"
      :error="formError"
      @update:open="!$event && (deleting = null)"
      @confirm="remove"
    />
  </div>
</template>
