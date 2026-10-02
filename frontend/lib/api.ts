import type { Page, User, Collection, Item } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let credential: string | null = null;
let sessionVersion = 0;
let onUnauthorized: () => void = () => {};

export function setCredential(token: string | null) {
  credential = token;
  sessionVersion++;
}

export function onSessionExpired(handler: () => void) {
  onUnauthorized = handler;
}

export async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, unknown>;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  if (!credential) throw new ApiError(401, "Sign in to continue.");
  const version = sessionVersion;
  const url = new URL(`/api${path}`, window.location.origin);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== "")
      url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    credentials: "omit",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
  if (version !== sessionVersion) throw new ApiError(401, "Your sign-in session changed.");
  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ error: `Request failed (${response.status})` }));
    if (response.status === 401) onUnauthorized();
    const details = data.details
      ?.map((detail: { path: string; message: string }) => `${detail.path}: ${detail.message}`)
      .join("; ");
    throw new ApiError(response.status, details ? `${data.error}: ${details}` : data.error);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function allAccounts(signal?: AbortSignal): Promise<User[]> {
  return allPages<User>("/users", "users", {}, signal);
}

export async function allCollections(
  accountId: string,
  signal?: AbortSignal,
): Promise<Collection[]> {
  return allPages<Collection>("/collections", "collections", { actAs: accountId }, signal);
}

export async function allPages<T extends User | Collection | Item>(
  path: string,
  key: "users" | "collections" | "items",
  query: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; offset <= 100000; offset += 100) {
    const data = await api<Record<string, T[]> & { page: Page }>(path, {
      query: { ...query, limit: 100, offset },
      signal,
    });
    result.push(...data[key]);
    if (!data.page.has_more) return result;
  }
  throw new Error("Too many results. Narrow the selection before continuing.");
}
