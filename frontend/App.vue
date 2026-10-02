<script setup lang="ts">
import { computed, ref } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { useRoute } from "vue-router";
import { Database, Users, LogOut, Menu, X, ShieldCheck } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { currentUser, signOut } from "@/composables/auth";
import LoginPanel from "@/components/LoginPanel.vue";
const route = useRoute();
const mobileMenu = ref(false);
const desktop = useMediaQuery("(min-width: 1024px)");
const accountId = computed(() => route.params.accountId as string | undefined);
</script>
<template>
  <LoginPanel v-if="!currentUser" />
  <div v-else class="min-h-screen">
    <aside
      id="workspace-navigation"
      :inert="!desktop && !mobileMenu"
      :class="[
        'fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r bg-white p-4 transition-transform lg:translate-x-0',
        mobileMenu ? 'translate-x-0' : '-translate-x-full',
      ]"
    >
      <RouterLink
        to="/admin/accounts"
        class="mb-10 flex items-center gap-3 px-2 py-2"
        @click="mobileMenu = false"
        ><div class="rounded-lg bg-primary p-2 text-white"><Database class="size-5" /></div>
        <span class="font-semibold tracking-tight">Mini CRM</span></RouterLink
      >
      <p class="px-3 pb-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        Workspace
      </p>
      <RouterLink
        to="/admin/accounts"
        class="flex items-center gap-3 rounded-lg bg-muted px-3 py-2.5 text-sm font-medium"
        @click="mobileMenu = false"
        ><Users class="size-4" /> Accounts</RouterLink
      >
      <div class="mt-auto rounded-lg border p-3">
        <div class="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck class="size-4" /> Admin access
        </div>
        <p class="mt-2 text-xs leading-5 text-muted-foreground">
          Manage every account from one place.
        </p>
      </div>
      <Button variant="ghost" class="mt-3 justify-start text-muted-foreground" @click="signOut()"
        ><LogOut class="size-4" /> Sign out</Button
      >
    </aside>
    <button
      v-if="mobileMenu"
      class="fixed inset-0 z-20 bg-black/30 lg:hidden"
      aria-label="Close navigation"
      @click="mobileMenu = false"
    />
    <div class="lg:pl-60">
      <header class="flex h-17 items-center justify-between gap-3 border-b bg-white px-5 sm:px-8">
        <div class="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            class="lg:hidden"
            aria-label="Toggle navigation"
            aria-controls="workspace-navigation"
            :aria-expanded="mobileMenu"
            @click="mobileMenu = !mobileMenu"
            ><X v-if="mobileMenu" class="size-5" /><Menu v-else class="size-5" /></Button
          ><span class="text-sm text-muted-foreground">Administration</span
          ><span v-if="accountId" class="hidden text-xs text-muted-foreground sm:inline"
            >/ Account workspace</span
          >
        </div>
        <div class="flex min-w-0 items-center gap-3">
          <Badge variant="secondary" class="hidden sm:inline-flex">ADMIN</Badge
          ><span class="max-w-48 truncate text-sm">{{
            currentUser.profile.name || currentUser.email
          }}</span>
          <div
            class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold"
          >
            {{ (currentUser.profile.name || currentUser.email).slice(0, 2).toUpperCase() }}
          </div>
        </div>
      </header>
      <main class="mx-auto max-w-7xl p-5 sm:p-8"><RouterView :key="route.path" /></main>
    </div>
  </div>
</template>
