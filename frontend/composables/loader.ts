import { onUnmounted, ref } from "vue";

export function useLoader(task: (signal: AbortSignal) => Promise<void>) {
  const busy = ref(false);
  const error = ref("");
  let controller: AbortController | undefined;
  onUnmounted(() => controller?.abort());
  async function load() {
    controller?.abort();
    const active = new AbortController();
    controller = active;
    busy.value = true;
    error.value = "";
    try {
      await task(active.signal);
    } catch (reason) {
      if (!active.signal.aborted)
        error.value = reason instanceof Error ? reason.message : "Could not load data.";
    } finally {
      if (!active.signal.aborted) busy.value = false;
    }
  }
  return { busy, error, load };
}
