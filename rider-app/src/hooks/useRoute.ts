/**
 * Today's route, as the rider's screens see it.
 *
 * Server data (React Query) is merged with the offline queue and re-sorted
 * on-device from the live GPS fix, so the next stop is correct the instant a
 * delivery is marked — with or without a connection.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STORAGE_KEYS } from '../config';
import { fetchTodayRoute } from '../api/endpoints';
import type { DeliveryProduct, DeliveryStatus, RouteStop, TodayRoute } from '../api/types';
import { readCache, writeCache } from '../lib/cache';
import { sortByDistance, type Coords } from '../lib/geo';
import { useQueueStore } from '../store/queue';

export const ROUTE_QUERY_KEY = ['route', 'today'] as const;

export interface RouteStopView extends RouteStop {
  distanceMeters: number | null;
  /** True while the update is still sitting in the offline queue. */
  unsynced: boolean;
  pinnedFirst?: boolean;
}

export interface RouteView {
  date: string | null;
  stops: RouteStopView[];
  pending: RouteStopView[];
  done: RouteStopView[];
  nextStop: RouteStopView | null;
  counters: {
    stops: number;
    delivered: number;
    remainingStops: number;
    bottlesTotal: number;
    bottlesDelivered: number;
    bottlesRemaining: number;
    remainingByProduct: Record<DeliveryProduct, number>;
  };
  fromCache: boolean;
  cachedAt: number | null;
}

export function useTodayRoute(coords: Coords | null) {
  const queryClient = useQueryClient();
  const queueItems = useQueueStore(state => state.items);
  const online = useQueueStore(state => state.online);
  const enqueue = useQueueStore(state => state.enqueue);

  const [cached, setCached] = useState<{ data: TodayRoute; savedAt: number } | null>(null);
  /** Stops the rider dragged to the front, for this session only. */
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  const query = useQuery({
    queryKey: ROUTE_QUERY_KEY,
    queryFn: async () => {
      const route = await fetchTodayRoute(coords);
      await writeCache(STORAGE_KEYS.routeCache, route);
      return route;
    },
    staleTime: 60_000,
    retry: 1,
  });

  // Fall back to the last route we saw on this device.
  useEffect(() => {
    if (query.data || cached) return;
    void readCache<TodayRoute>(STORAGE_KEYS.routeCache).then(setCached);
  }, [query.data, cached]);

  const source = query.data ?? cached?.data ?? null;

  /** Local status overrides from the queue, so the UI never lies to the rider. */
  const queuedByDelivery = useMemo(() => {
    const map = new Map<string, { status: DeliveryStatus; qty?: number }>();
    for (const item of queueItems) {
      if (item.kind !== 'delivery') continue;
      map.set(item.payload.deliveryId, { status: item.payload.status, qty: item.payload.qty });
    }
    return map;
  }, [queueItems]);

  const view: RouteView = useMemo(() => {
    const raw = source?.stops ?? [];
    const merged: RouteStopView[] = raw.map(stop => {
      const queued = queuedByDelivery.get(stop.deliveryId);
      return {
        ...stop,
        status: queued?.status ?? stop.status,
        qty: queued?.qty ?? stop.qty,
        unsynced: queued !== undefined,
        distanceMeters: null,
        pinnedFirst: pinnedIds.includes(stop.deliveryId),
      };
    });

    const pending = merged.filter(s => s.status !== 'delivered');
    const done = merged.filter(s => s.status === 'delivered');
    const ordered = sortByDistance(pending, coords) as RouteStopView[];

    const remainingByProduct: Record<DeliveryProduct, number> = { amla: 0, beetroot: 0 };
    for (const stop of pending) remainingByProduct[stop.product] += stop.qty;

    const bottlesTotal = merged.reduce((sum, s) => sum + s.qty, 0);
    const bottlesDelivered = done.reduce((sum, s) => sum + s.qty, 0);

    return {
      date: source?.date ?? null,
      stops: [...ordered, ...done],
      pending: ordered,
      done,
      nextStop: ordered[0] ?? null,
      counters: {
        stops: merged.length,
        delivered: done.length,
        remainingStops: pending.length,
        bottlesTotal,
        bottlesDelivered,
        bottlesRemaining: bottlesTotal - bottlesDelivered,
        remainingByProduct,
      },
      fromCache: !query.data && cached !== null,
      cachedAt: cached?.savedAt ?? null,
    };
  }, [source, queuedByDelivery, coords, pinnedIds, query.data, cached]);

  /** Mark a stop. Queued first, synced later — never blocks on the network. */
  const mark = useMutation({
    mutationFn: async (input: {
      deliveryId: string;
      status: DeliveryStatus;
      qty?: number;
      remarks?: string;
      at?: Coords | null;
    }) => {
      await enqueue({
        kind: 'delivery',
        payload: {
          deliveryId: input.deliveryId,
          status: input.status,
          qty: input.qty,
          remarks: input.remarks,
          latitude: input.at?.latitude,
          longitude: input.at?.longitude,
          occurredAt: new Date().toISOString(),
        },
      });
    },
    onSuccess: () => {
      // Re-fetch only when there is a point to it.
      if (online) void queryClient.invalidateQueries({ queryKey: ROUTE_QUERY_KEY });
    },
  });

  const pinToFront = useCallback((deliveryId: string) => {
    setPinnedIds(current =>
      current.includes(deliveryId)
        ? current.filter(id => id !== deliveryId)
        : [deliveryId, ...current],
    );
  }, []);

  return {
    route: view,
    isLoading: query.isLoading && !cached,
    isRefetching: query.isRefetching,
    error: query.error as Error | null,
    refetch: query.refetch,
    mark,
    pinToFront,
    pinnedIds,
  };
}
