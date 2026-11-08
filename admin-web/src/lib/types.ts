export type Role = 'admin' | 'supervisor' | 'rider';
export type ProductKind = 'amla' | 'beetroot' | 'combo';
export type DeliveryProduct = 'amla' | 'beetroot';
export type DeliveryStatus = 'pending' | 'delivered' | 'skipped' | 'not_home';
export type SubscriptionStatus = 'active' | 'paused' | 'expired' | 'cancelled';
export type PaymentMode = 'cash' | 'upi' | 'other';
export type PaymentStatus = 'pending' | 'paid';
export type LeadStatus = 'new' | 'contacted' | 'converted' | 'rejected';

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  supervisorId: string | null;
}

export interface TeamMember {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  role: Role;
  supervisorId: string | null;
  isActive: boolean;
  createdAt: string;
  customerCount: number;
}

export interface CustomerSubscription {
  id: string;
  product: ProductKind;
  status: SubscriptionStatus;
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
  createdAt: string;
  subscription: CustomerSubscription | null;
  renewalDue: boolean;
}

export interface Plan {
  id: string;
  name: string;
  product: ProductKind;
  durationDays: number;
  price: number;
  perDay: number;
  isTrial: boolean;
  isActive: boolean;
}

export interface Subscription {
  id: string;
  customerId: string;
  customerName: string;
  riderId: string;
  planId: string;
  product: ProductKind;
  status: SubscriptionStatus;
  durationDays: number;
  bottlesPerDay: number;
  amount: number | null;
  startDate: string;
  endDate: string;
  pausedDays: number;
}

export interface Payment {
  id: string;
  customerId: string;
  customerName: string | null;
  subscriptionId: string | null;
  amount: number | null;
  mode: PaymentMode;
  status: PaymentStatus;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  collectedById: string | null;
  collectedByName: string | null;
}

export interface Lead {
  id: string;
  fullName: string;
  mobile: string;
  area: string | null;
  city: string | null;
  planId: string | null;
  planName: string | null;
  planPrice: number | null;
  notes: string | null;
  status: LeadStatus;
  source: string;
  convertedCustomerId: string | null;
  createdAt: string;
}

export interface RenewalAlert {
  subscriptionId: string;
  customerId: string;
  customerName: string;
  riderId: string;
  riderName: string;
  product: string;
  endDate: string;
  daysLeft: number;
}

export interface DashboardSummary {
  date: string;
  deliveries: {
    total: number;
    delivered: number;
    pending: number;
    skipped: number;
    notHome: number;
    bottlesDelivered: number;
    bottlesTotal: number;
  };
  collections: {
    today: number;
    todayCount: number;
    month: number;
    pending: number;
    pendingCount: number;
  };
  renewalsDue: { thresholdDays: number; count: number; items: RenewalAlert[] };
  pausedSubscriptions: number;
  activeCustomers: number;
  activeRiders: number;
}

export interface DeliveryRow {
  id: string;
  deliveryDate: string;
  status: DeliveryStatus;
  product: DeliveryProduct;
  qty: number;
  deliveredAt: string | null;
  remarks: string | null;
  latitude: number | null;
  longitude: number | null;
  customerId: string;
  customerName: string;
  area: string | null;
  riderId: string;
  riderName: string;
}
