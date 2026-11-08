/** Response shapes from the API, kept in one place. */

export type DeliveryProduct = 'amla' | 'beetroot';
export type DeliveryStatus = 'pending' | 'delivered' | 'skipped' | 'not_home';
export type PaymentMode = 'cash' | 'upi' | 'other';

export interface AuthUser {
  id: string;
  name: string;
  role: 'admin' | 'supervisor' | 'rider';
  supervisorId: string | null;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface RouteStop {
  deliveryId: string;
  status: DeliveryStatus;
  product: DeliveryProduct;
  qty: number;
  sequence: number | null;
  deliveredAt: string | null;
  remarks: string | null;
  riderId: string;
  customerId: string;
  name: string;
  mobile: string;
  area: string | null;
  address: string | null;
  landmark: string | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  subscriptionId: string | null;
  subscriptionEndDate: string | null;
  daysLeft: number | null;
  renewalDue: boolean;
  distanceMeters?: number | null;
}

export interface RouteCounters {
  stops: number;
  delivered: number;
  pending: number;
  skipped: number;
  notHome: number;
  bottlesTotal: number;
  bottlesDelivered: number;
  bottlesRemaining: number;
  bottlesByProduct: Partial<Record<DeliveryProduct, number>>;
  remainingByProduct: Partial<Record<DeliveryProduct, number>>;
}

export interface TodayRoute {
  date: string;
  riderId: string | null;
  generated: boolean;
  nextStop: RouteStop | null;
  stops: RouteStop[];
  counters: RouteCounters;
}

export interface CustomerSubscription {
  id: string;
  product: 'amla' | 'beetroot' | 'combo';
  status: 'active' | 'paused' | 'expired' | 'cancelled';
  planName: string;
  startDate: string;
  endDate: string | null;
  daysLeft: number | null;
  amount: number | null;
  bottlesPerDay: number;
}

export interface Customer {
  id: string;
  name: string;
  mobile: string;
  bottlesPerDay: number;
  status: 'active' | 'inactive';
  area: string | null;
  address: string | null;
  landmark: string | null;
  city: string;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  riderId: string;
  riderName: string;
  subscription: CustomerSubscription | null;
  renewalDue: boolean;
}

export interface Plan {
  id: string;
  name: string;
  product: 'amla' | 'beetroot' | 'combo';
  durationDays: number;
  price: number;
  perDay: number;
  isTrial: boolean;
  isActive: boolean;
}

export interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}
