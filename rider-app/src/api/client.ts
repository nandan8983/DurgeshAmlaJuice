/**
 * HTTP client. One fetch wrapper so every call carries the token, a timeout,
 * and an error the UI can show a rider without exposing internals.
 */
import { DEFAULT_API_BASE_URL } from '../config';
import type { ApiErrorBody } from './types';

let apiBaseUrl = DEFAULT_API_BASE_URL;
let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setApiBaseUrl(url: string): void {
  apiBaseUrl = url.replace(/\/+$/, '');
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

/** The auth store registers a logout here, for when a token expires mid-shift. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly offline: boolean;

  constructor(status: number, code: string, message: string, offline = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.offline = offline;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  timeoutMs?: number;
  /** Skip the token (login only). */
  anonymous?: boolean;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, timeoutMs = 15_000, anonymous = false } = options;

  const url = new URL(`${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(!anonymous && authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : null;

    if (!response.ok) {
      const errorBody = payload as ApiErrorBody | null;
      const code = errorBody?.error?.code ?? 'http_error';
      const message = errorBody?.error?.message ?? `Request failed (${response.status})`;
      if (response.status === 401 && !anonymous) onUnauthorized?.();
      throw new ApiError(response.status, code, message);
    }

    return payload as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // Abort or a DNS/socket failure: the rider is in a dead spot.
    const aborted = (err as Error).name === 'AbortError';
    throw new ApiError(
      0,
      aborted ? 'timeout' : 'network',
      aborted ? 'The server took too long to answer.' : 'No connection. Your work is saved and will sync.',
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}
