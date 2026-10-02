import { ref } from "vue";
import { api, ApiError, onSessionExpired, setCredential } from "@/lib/api";
import type { User } from "@/lib/types";

export const currentUser = ref<User | null>(null);
export const authBusy = ref(false);
export const authError = ref("");
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let attempt = 0;

export function signOut(message = "") {
  attempt++;
  clearTimeout(expiryTimer);
  setCredential(null);
  currentUser.value = null;
  authBusy.value = false;
  authError.value = message;
  window.google?.accounts.id.disableAutoSelect();
}

onSessionExpired(() => signOut("Your session expired. Sign in again to continue."));

export async function signIn(token: string) {
  const version = ++attempt;
  clearTimeout(expiryTimer);
  currentUser.value = null;
  setCredential(token);
  authBusy.value = true;
  authError.value = "";
  try {
    const { user } = await api<{ user: User }>("/users/me");
    if (version !== attempt) return;
    if (user.role !== "ADMIN")
      throw new ApiError(
        403,
        "This dashboard requires an admin account. Ask an existing admin to grant access.",
      );
    const payload = JSON.parse(
      atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: number };
    const remaining = (payload.exp ?? 0) * 1000 - Date.now();
    if (remaining <= 0) throw new ApiError(401, "Your credential expired. Sign in again.");
    currentUser.value = user;
    expiryTimer = setTimeout(
      () => signOut("Your session expired. Sign in again to continue."),
      Math.min(remaining, 2147483647),
    );
  } catch (error) {
    if (version !== attempt) return;
    signOut(error instanceof Error ? error.message : "Sign-in failed.");
  } finally {
    if (version === attempt) authBusy.value = false;
  }
}
