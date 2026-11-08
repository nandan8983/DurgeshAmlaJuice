/**
 * The offline queue.
 *
 * Riders work in streets with no signal, so nothing in the app waits for the
 * network to confirm. Every write is appended here first, persisted to the
 * device, and flushed when a connection comes back. The UI reads the queue to
 * show what has not reached the server yet.
 *
 * Deliveries go up in one batch (`POST /deliveries/sync`); payments and new
 * customers go one at a time so a single rejection can't block the rest.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';
import { STORAGE_KEYS } from '../config';
import { ApiError } from '../api/client';
import {
  createCustomer,
  recordPayment,
  syncDeliveries,
  type NewCustomerInput,
  type QueuedDeliveryUpdate,
} from '../api/endpoints';
import type { PaymentMode } from '../api/types';

export interface QueuedPayment {
  customerId: string;
  subscriptionId?: string;
  amount: number;
  mode: PaymentMode;
  notes?: string;
  paidAt: string;
}

export type QueueItem =
  | { id: string; kind: 'delivery'; createdAt: string; attempts: number; payload: QueuedDeliveryUpdate }
  | { id: string; kind: 'payment'; createdAt: string; attempts: number; payload: QueuedPayment }
  | { id: string; kind: 'customer'; createdAt: string; attempts: number; payload: NewCustomerInput };

/** After this many failed tries an item is parked for manual attention. */
const MAX_ATTEMPTS = 8;

interface QueueState {
  items: QueueItem[];
  failed: QueueItem[];
  online: boolean;
  syncing: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  hydrate: () => Promise<void>;
  enqueue: (item: Omit<QueueItem, 'id' | 'createdAt' | 'attempts'>) => Promise<void>;
  flush: () => Promise<void>;
  retryFailed: () => Promise<void>;
  clearFailed: () => Promise<void>;
}

const newId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const useQueueStore = create<QueueState>((set, get) => {
  const persist = async (): Promise<void> => {
    const { items, failed } = get();
    await AsyncStorage.setItem(STORAGE_KEYS.queue, JSON.stringify({ items, failed }));
  };

  return {
    items: [],
    failed: [],
    online: true,
    syncing: false,
    lastSyncAt: null,
    lastError: null,

    hydrate: async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.queue);
        if (raw) {
          const parsed = JSON.parse(raw) as { items?: QueueItem[]; failed?: QueueItem[] };
          set({ items: parsed.items ?? [], failed: parsed.failed ?? [] });
        }
      } catch {
        // A corrupted queue must not brick the app; start clean.
        set({ items: [], failed: [] });
      }
    },

    enqueue: async item => {
      const entry = { ...item, id: newId(), createdAt: new Date().toISOString(), attempts: 0 } as QueueItem;
      set(state => ({ items: [...state.items, entry] }));
      await persist();
      if (get().online) void get().flush();
    },

    flush: async () => {
      if (get().syncing || get().items.length === 0) return;
      set({ syncing: true, lastError: null });

      try {
        const batch = get().items;
        const done = new Set<string>();
        const retry: QueueItem[] = [];
        const dead: QueueItem[] = [];
        let networkDown = false;

        // ------------------------------------------------- deliveries (batched)
        const deliveryItems = batch.filter(
          (i): i is Extract<QueueItem, { kind: 'delivery' }> => i.kind === 'delivery',
        );
        if (deliveryItems.length > 0) {
          try {
            const result = await syncDeliveries(deliveryItems.map(i => i.payload));
            const okIds = new Set(
              result.results.filter(r => r.ok).map(r => r.deliveryId),
            );
            for (const item of deliveryItems) {
              if (okIds.has(item.payload.deliveryId)) {
                done.add(item.id);
              } else {
                const next = { ...item, attempts: item.attempts + 1 };
                (next.attempts >= MAX_ATTEMPTS ? dead : retry).push(next);
              }
            }
          } catch (err) {
            networkDown = err instanceof ApiError && err.offline;
            for (const item of deliveryItems) {
              const next = { ...item, attempts: networkDown ? item.attempts : item.attempts + 1 };
              (next.attempts >= MAX_ATTEMPTS ? dead : retry).push(next);
            }
            set({ lastError: (err as Error).message });
          }
        }

        // ------------------------------------------------- payments and customers
        for (const item of batch) {
          if (item.kind === 'delivery') continue;
          if (networkDown) {
            retry.push(item);
            continue;
          }
          try {
            if (item.kind === 'payment') {
              await recordPayment({ ...item.payload, status: 'paid' });
            } else {
              await createCustomer(item.payload);
            }
            done.add(item.id);
          } catch (err) {
            if (err instanceof ApiError && err.offline) {
              networkDown = true;
              retry.push(item);
            } else {
              const next = { ...item, attempts: item.attempts + 1 };
              (next.attempts >= MAX_ATTEMPTS ? dead : retry).push(next);
              set({ lastError: (err as Error).message });
            }
          }
        }

        set(state => ({
          items: retry,
          failed: [...state.failed, ...dead],
          syncing: false,
          online: !networkDown,
          lastSyncAt: done.size > 0 ? new Date().toISOString() : state.lastSyncAt,
        }));
        await persist();
      } catch (err) {
        set({ syncing: false, lastError: (err as Error).message });
      }
    },

    retryFailed: async () => {
      set(state => ({
        items: [...state.items, ...state.failed.map(i => ({ ...i, attempts: 0 }))],
        failed: [],
      }));
      await persist();
      await get().flush();
    },

    clearFailed: async () => {
      set({ failed: [] });
      await persist();
    },
  };
});

/** Watch connectivity and drain the queue the moment the signal returns. */
export function startQueueSync(): () => void {
  void useQueueStore.getState().hydrate().then(() => useQueueStore.getState().flush());

  const unsubscribe = NetInfo.addEventListener(state => {
    const online = Boolean(state.isConnected && state.isInternetReachable !== false);
    const wasOffline = !useQueueStore.getState().online;
    useQueueStore.setState({ online });
    if (online && wasOffline) void useQueueStore.getState().flush();
  });

  // Belt and braces: a periodic nudge for the case where NetInfo misses a
  // transition (common on flaky 2G).
  const timer = setInterval(() => {
    const { online, items, syncing } = useQueueStore.getState();
    if (online && !syncing && items.length > 0) void useQueueStore.getState().flush();
  }, 30_000);

  return () => {
    unsubscribe();
    clearInterval(timer);
  };
}

/** Pending status for one delivery, so a stop can show "saved, not synced". */
export function usePendingDeliveryStatus(deliveryId: string): QueuedDeliveryUpdate | null {
  return useQueueStore(state => {
    // Last write wins: the rider may have corrected a status before syncing.
    for (let i = state.items.length - 1; i >= 0; i -= 1) {
      const item = state.items[i];
      if (item && item.kind === 'delivery' && item.payload.deliveryId === deliveryId) {
        return item.payload;
      }
    }
    return null;
  });
}
