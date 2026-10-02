<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { Database, ShieldCheck } from "@lucide/vue";
import { authBusy, authError, signIn } from "@/composables/auth";
import ErrorNotice from "./ErrorNotice.vue";
const button = ref<HTMLElement>();
const setupError = ref("");
let disposed = false;

onUnmounted(() => {
  disposed = true;
});
onMounted(async () => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId || clientId.startsWith("YOUR_")) {
    setupError.value =
      "Google sign-in is not configured. Set VITE_GOOGLE_CLIENT_ID in .env.local to your Google OAuth client ID, then restart the development server.";
    return;
  }
  try {
    if (!window.google)
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        const timer = setTimeout(
          () =>
            reject(
              new Error("Google sign-in took too long to load. Check your connection and reload."),
            ),
          15000,
        );
        script.onload = () => {
          clearTimeout(timer);
          resolve();
        };
        script.onerror = () => {
          clearTimeout(timer);
          script.remove();
          reject(new Error("Google sign-in could not load. Check your connection and reload."));
        };
        document.head.append(script);
      });
    if (disposed || !button.value || !window.google) return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: ({ credential }) => {
        void signIn(credential);
      },
      auto_select: false,
    });
    window.google.accounts.id.renderButton(button.value, {
      theme: "outline",
      size: "large",
      width: 300,
    });
  } catch (error) {
    setupError.value = (error as Error).message;
  }
});
</script>
<template>
  <main class="flex min-h-screen items-center justify-center p-6">
    <div class="w-full max-w-md">
      <div class="mb-7 flex items-center justify-center gap-3">
        <div class="rounded-xl bg-primary p-2.5 text-white"><Database class="size-6" /></div>
        <span class="text-xl font-semibold tracking-tight">Mini CRM</span>
      </div>
      <section class="panel p-7 sm:p-9">
        <div class="mb-6 flex size-11 items-center justify-center rounded-full bg-muted">
          <ShieldCheck class="size-5" />
        </div>
        <h1 class="page-heading">Admin workspace</h1>
        <p class="mt-3 mb-7 text-sm leading-6 text-muted-foreground">
          Manage accounts, shape collections, and keep your records in order. Sign in with your
          admin Google account to continue.
        </p>
        <ErrorNotice :message="setupError || authError" />
        <div v-show="!setupError" ref="button" class="mt-5 flex min-h-11 justify-center" />
        <p v-if="authBusy" role="status" class="mt-4 muted text-center">Checking your account…</p>
      </section>
      <p class="mt-5 text-center text-xs text-muted-foreground">Mini CRM · Administration</p>
    </div>
  </main>
</template>
