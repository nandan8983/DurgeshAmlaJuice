/**
 * API access. `VITE_API_BASE_URL` is the single switch for moving between the
 * owner's own server and Render, so a host change is a rebuild with a different
 * env value and nothing else.
 */
import type {
  Customer,
  CustomerSubscription,
  DashboardSummary,
  DeliveryRow,
  Lead,
  Payment,
  Plan,
  RenewalAlert,
  Subscription,
  TeamMember,
} from './types';

export const API_BASE_URL = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:4000'
).replace(/\/+$/, '');

const TOKEN_KEY = 'daj.admin.token';

export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  clear: (): void => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (handler: (() => void) | null): void => {
  onUnauthorized = handler;
};

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; query?: Query; anonymous?: boolean } = {},
): Promise<T> {
  const token = tokenStore.get();
  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(!options.anonymous && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    if (response.status === 401) onUnauthorized?.();
    throw new ApiError(
      response.status,
      error?.code ?? 'http_error',
      error?.message ?? `Request failed (${response.status})`,
    );
  }
  return payload as T;
}

/** CSV exports come back as a file, so they bypass the JSON path. */
export async function downloadCsv(path: string, query: Query, filename: string): Promise<void> {
  const token = tokenStore.get();
  const response = await fetch(buildUrl(path, { ...query, format: 'csv' }), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new ApiError(response.status, 'export_failed', 'Export failed');

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------- auth
export const api = {
  login: (mobile: string, password: string) =>
    request<{ token: string; user: import('./types').AuthUser }>('/auth/login', {
      method: 'POST',
      body: { mobile, password },
      anonymous: true,
    }),

  me: () => request<{ user: import('./types').AuthUser }>('/auth/me'),

  // ---------------------------------------------------------------- dashboard
  summary: (date?: string) => request<DashboardSummary>('/admin/reports/summary', { query: { date } }),

  renewals: (days?: number) =>
    request<{ count: number; items: RenewalAlert[] }>('/admin/reports/renewals', { query: { days } }),

  // ---------------------------------------------------------------- customers
  customers: (query: Query = {}) =>
    request<{ customers: Customer[]; total: number; limit: number; offset: number }>('/customers', {
      query,
    }),

  customer: (id: string) =>
    request<{
      customer: Customer;
      subscriptions: CustomerSubscription[];
      payments: Payment[];
      pendingAmount: number;
    }>(`/customers/${id}`),

  updateCustomer: (id: string, patch: Partial<Customer>) =>
    request<{ customer: Customer }>(`/customers/${id}`, { method: 'PATCH', body: patch }),

  assignCustomer: (id: string, riderId: string) =>
    request<{ customer: Customer }>(`/customers/${id}/assign`, {
      method: 'PATCH',
      body: { riderId },
    }),

  createCustomer: (body: Record<string, unknown>) =>
    request<{ customer: Customer }>('/customers', { method: 'POST', body }),

  // ---------------------------------------------------------------- team
  users: (query: Query = {}) => request<{ users: TeamMember[] }>('/users', { query }),

  createUser: (body: Record<string, unknown>) =>
    request<{ user: TeamMember }>('/users', { method: 'POST', body }),

  updateUser: (id: string, patch: Record<string, unknown>) =>
    request<{ user: TeamMember }>(`/users/${id}`, { method: 'PATCH', body: patch }),

  // ---------------------------------------------------------------- plans
  plans: (includeInactive = false) =>
    request<{ plans: Plan[] }>('/plans', {
      query: includeInactive ? { includeInactive: 'true' } : undefined,
    }),

  createPlan: (body: Record<string, unknown>) =>
    request<{ plan: Plan }>('/plans', { method: 'POST', body }),

  updatePlan: (id: string, patch: Record<string, unknown>) =>
    request<{ plan: Plan }>(`/plans/${id}`, { method: 'PATCH', body: patch }),

  // ---------------------------------------------------------------- subscriptions
  subscriptions: (query: Query = {}) =>
    request<{ subscriptions: Subscription[]; total: number }>('/subscriptions', { query }),

  createSubscription: (body: Record<string, unknown>) =>
    request<{ subscription: Subscription }>('/subscriptions', { method: 'POST', body }),

  pauseSubscription: (id: string, reason?: string) =>
    request(`/subscriptions/${id}/pause`, { method: 'POST', body: { reason } }),

  resumeSubscription: (id: string) =>
    request<{ pausedDays: number; newEndDate: string }>(`/subscriptions/${id}/resume`, {
      method: 'POST',
      body: {},
    }),

  cancelSubscription: (id: string) =>
    request(`/subscriptions/${id}/cancel`, { method: 'POST', body: {} }),

  // ---------------------------------------------------------------- payments
  payments: (query: Query = {}) =>
    request<{ payments: Payment[]; total: number; totals: Record<string, number> }>('/payments', {
      query,
    }),

  createPayment: (body: Record<string, unknown>) =>
    request<{ payment: Payment }>('/payments', { method: 'POST', body }),

  updatePayment: (id: string, patch: Record<string, unknown>) =>
    request<{ payment: Payment }>(`/payments/${id}`, { method: 'PATCH', body: patch }),

  // ---------------------------------------------------------------- deliveries
  deliveries: (query: Query = {}) =>
    request<{ deliveries: DeliveryRow[]; total: number }>('/deliveries', { query }),

  generateRoute: (date?: string) =>
    request<{ result: Record<string, number | string> }>('/route/generate', {
      method: 'POST',
      body: { date },
    }),

  // ---------------------------------------------------------------- leads
  leads: (query: Query = {}) => request<{ leads: Lead[]; total: number }>('/leads', { query }),

  updateLead: (id: string, status: 'new' | 'contacted' | 'rejected') =>
    request(`/leads/${id}`, { method: 'PATCH', body: { status } }),

  convertLead: (id: string, body: Record<string, unknown>) =>
    request<{ customerId: string; subscriptionId: string | null }>(`/leads/${id}/convert`, {
      method: 'POST',
      body,
    }),

  // ---------------------------------------------------------------- reports
  reportPayments: (query: Query = {}) =>
    request<{
      from: string;
      to: string;
      total: number;
      count: number;
      byMode: Array<{ mode: string; amount: number; count: number }>;
      byCollector: Array<{ id: string; name: string; amount: number; count: number }>;
      bySupervisor: Array<{ id: string; amount: number; count: number }>;
    }>('/admin/reports/payments', { query }),

  reportDeliveries: (query: Query = {}) =>
    request<{
      from: string;
      to: string;
      perRider: Array<{
        riderId: string;
        rider: string;
        supervisor: string;
        delivered: number;
        bottlesDelivered: number;
        pending: number;
        skipped: number;
        notHome: number;
        total: number;
      }>;
    }>('/admin/reports/deliveries', { query }),

  reportExpiring: (days?: number) =>
    request<{
      date: string;
      days: number;
      count: number;
      items: Array<{
        customerId: string;
        customerName: string;
        mobile: string;
        area: string;
        rider: string;
        plan: string;
        product: string;
        endDate: string;
        daysLeft: number;
        amount: number;
        subscriptionId: string;
      }>;
    }>('/admin/reports/expiring', { query: { days } }),

  reportPendingPayments: () =>
    request<{
      total: number;
      count: number;
      items: Array<{
        customerId: string;
        customerName: string;
        mobile: string;
        area: string;
        rider: string;
        amount: number;
        since: string;
        paymentId: string;
      }>;
    }>('/admin/reports/pending-payments'),

  reportPauses: (query: Query = {}) =>
    request<{
      from: string;
      to: string;
      count: number;
      items: Array<{
        customerName: string;
        rider: string;
        product: string;
        pausedFrom: string;
        resumedOn: string;
        pausedDays: number | string;
        reason: string;
        pausedBy: string;
        resumedBy: string;
        newEndDate: string;
      }>;
    }>('/admin/reports/pauses', { query }),
};
