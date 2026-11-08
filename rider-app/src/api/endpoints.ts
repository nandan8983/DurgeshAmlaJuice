/** Typed calls to the API, one function per endpoint the rider app uses. */
import { request } from './client';
import type {
  Customer,
  CustomerSubscription,
  LoginResponse,
  PaymentMode,
  Plan,
  TodayRoute,
} from './types';

export const login = (mobile: string, password: string): Promise<LoginResponse> =>
  request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { mobile, password },
    anonymous: true,
  });

export const fetchTodayRoute = (coords?: { latitude: number; longitude: number } | null): Promise<TodayRoute> =>
  request<TodayRoute>('/route/today', {
    query: coords ? { latitude: coords.latitude, longitude: coords.longitude } : undefined,
  });

export const fetchCustomers = (search?: string): Promise<{ customers: Customer[]; total: number }> =>
  request<{ customers: Customer[]; total: number }>('/customers', {
    query: { search, limit: 200 },
  });

export const fetchCustomer = (
  id: string,
): Promise<{
  customer: Customer;
  subscriptions: CustomerSubscription[];
  payments: Array<{ id: string; amount: number; mode: PaymentMode; status: string; paidAt: string | null }>;
  pendingAmount: number;
}> => request(`/customers/${id}`);

export const fetchPlans = (): Promise<{ plans: Plan[] }> => request<{ plans: Plan[] }>('/plans');

export interface NewCustomerInput {
  name: string;
  mobile: string;
  bottlesPerDay: number;
  status: 'active' | 'inactive';
  area?: string;
  address?: string;
  landmark?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
}

export const createCustomer = (input: NewCustomerInput): Promise<{ customer: Customer }> =>
  request<{ customer: Customer }>('/customers', { method: 'POST', body: input });

export const updateCustomer = (
  id: string,
  patch: Partial<NewCustomerInput>,
): Promise<{ customer: Customer }> =>
  request<{ customer: Customer }>(`/customers/${id}`, { method: 'PATCH', body: patch });

export const createSubscription = (input: {
  customerId: string;
  planId: string;
  startDate?: string;
  bottlesPerDay?: number;
  renew?: boolean;
  payment?: { mode: PaymentMode; status: 'pending' | 'paid'; amount?: number };
}): Promise<{ subscription: { id: string } }> =>
  request<{ subscription: { id: string } }>('/subscriptions', { method: 'POST', body: input });

export const pauseSubscription = (id: string, reason?: string): Promise<unknown> =>
  request(`/subscriptions/${id}/pause`, { method: 'POST', body: { reason } });

export const resumeSubscription = (id: string): Promise<unknown> =>
  request(`/subscriptions/${id}/resume`, { method: 'POST', body: {} });

export const updateDelivery = (
  id: string,
  patch: {
    status?: 'pending' | 'delivered' | 'skipped' | 'not_home';
    qty?: number;
    latitude?: number;
    longitude?: number;
    remarks?: string;
    deliveredAt?: string;
  },
): Promise<unknown> => request(`/deliveries/${id}`, { method: 'PATCH', body: patch });

export interface QueuedDeliveryUpdate {
  deliveryId: string;
  status: 'pending' | 'delivered' | 'skipped' | 'not_home';
  qty?: number;
  latitude?: number;
  longitude?: number;
  remarks?: string;
  occurredAt?: string;
}

export const syncDeliveries = (
  updates: QueuedDeliveryUpdate[],
): Promise<{ applied: number; failed: number; results: Array<{ deliveryId: string; ok: boolean }> }> =>
  request('/deliveries/sync', { method: 'POST', body: { updates } });

export const recordPayment = (input: {
  customerId: string;
  subscriptionId?: string;
  amount: number;
  mode: PaymentMode;
  status?: 'pending' | 'paid';
  notes?: string;
  paidAt?: string;
}): Promise<unknown> => request('/payments', { method: 'POST', body: input });
