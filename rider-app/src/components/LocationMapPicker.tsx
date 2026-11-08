/**
 * Interactive OpenStreetMap location picker.
 *
 * Uses standard Web Mercator slippy tiles (no Google Cloud Maps API key or
 * billing required), so the map works out of the box in debug, emulator, and
 * release APK builds. Riders can drag the map or tap any spot to drop the pin.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { colors, radius, spacing } from '../theme';

const TILE_SIZE = 256;
const MIN_ZOOM = 12;
const MAX_ZOOM = 19;
const DEFAULT_ZOOM = 16;

export interface MapCoords {
  latitude: number;
  longitude: number;
}

interface LocationMapPickerProps {
  pin: MapCoords | null;
  defaultCenter: MapCoords;
  onChange: (coords: MapCoords) => void;
  onInteractionChange?: (interacting: boolean) => void;
}

function clampLatitude(lat: number): number {
  return Math.max(-85.0511, Math.min(85.0511, lat));
}

function normalizeLongitude(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

function lonToWorldX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * TILE_SIZE * Math.pow(2, zoom);
}

function latToWorldY(lat: number, zoom: number): number {
  const clamped = clampLatitude(lat);
  const rad = (clamped * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
    TILE_SIZE *
    Math.pow(2, zoom)
  );
}

function worldXToLon(worldX: number, zoom: number): number {
  const worldSize = TILE_SIZE * Math.pow(2, zoom);
  return normalizeLongitude((worldX / worldSize) * 360 - 180);
}

function worldYToLat(worldY: number, zoom: number): number {
  const worldSize = TILE_SIZE * Math.pow(2, zoom);
  const clampedY = Math.max(0, Math.min(worldSize, worldY));
  const n = Math.PI - (2 * Math.PI * clampedY) / worldSize;
  return clampLatitude((180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
}

export function LocationMapPicker({
  pin,
  defaultCenter,
  onChange,
  onInteractionChange,
}: LocationMapPickerProps): React.JSX.Element {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [center, setCenter] = useState<MapCoords>(pin ?? defaultCenter);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 340, height: 260 });

  // Sync map center when the parent sets a pin externally (e.g. "Use my location").
  const lastCommittedRef = useRef<MapCoords | null>(pin);
  useEffect(() => {
    if (!pin) return;
    const prev = lastCommittedRef.current;
    if (
      !prev ||
      Math.abs(prev.latitude - pin.latitude) > 1e-6 ||
      Math.abs(prev.longitude - pin.longitude) > 1e-6
    ) {
      lastCommittedRef.current = pin;
      setCenter(pin);
      setDragOffset({ x: 0, y: 0 });
    }
  }, [pin]);

  const stateRef = useRef({ center, zoom, size, onChange, onInteractionChange });
  stateRef.current = { center, zoom, size, onChange, onInteractionChange };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          stateRef.current.onInteractionChange?.(true);
        },
        onPanResponderMove: (_evt, gestureState) => {
          setDragOffset({ x: gestureState.dx, y: gestureState.dy });
        },
        onPanResponderRelease: (evt, gestureState) => {
          const {
            center: curCenter,
            zoom: curZoom,
            size: curSize,
            onChange: commitChange,
            onInteractionChange: notifyInteraction,
          } = stateRef.current;

          notifyInteraction?.(false);

          const baseWorldX = lonToWorldX(curCenter.longitude, curZoom);
          const baseWorldY = latToWorldY(curCenter.latitude, curZoom);

          const movedDistance = Math.hypot(gestureState.dx, gestureState.dy);
          let targetWorldX: number;
          let targetWorldY: number;

          if (movedDistance < 6) {
            // Tap: place the pin at the tapped point and center there.
            const tapX = evt.nativeEvent.locationX;
            const tapY = evt.nativeEvent.locationY;
            targetWorldX = baseWorldX + (tapX - curSize.width / 2);
            targetWorldY = baseWorldY + (tapY - curSize.height / 2);
          } else {
            // Drag: pan the map and drop the pin at the new center.
            targetWorldX = baseWorldX - gestureState.dx;
            targetWorldY = baseWorldY - gestureState.dy;
          }

          const nextCoords: MapCoords = {
            latitude: Number(worldYToLat(targetWorldY, curZoom).toFixed(6)),
            longitude: Number(worldXToLon(targetWorldX, curZoom).toFixed(6)),
          };

          lastCommittedRef.current = nextCoords;
          setDragOffset({ x: 0, y: 0 });
          setCenter(nextCoords);
          commitChange(nextCoords);
        },
        onPanResponderTerminate: () => {
          stateRef.current.onInteractionChange?.(false);
          setDragOffset({ x: 0, y: 0 });
        },
      }),
    [],
  );

  const handleLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setSize({ width, height });
    }
  };

  const effectiveCenterWorldX = lonToWorldX(center.longitude, zoom) - dragOffset.x;
  const effectiveCenterWorldY = latToWorldY(center.latitude, zoom) - dragOffset.y;
  const topLeftWorldX = effectiveCenterWorldX - size.width / 2;
  const topLeftWorldY = effectiveCenterWorldY - size.height / 2;

  const numTiles = Math.pow(2, zoom);
  const minTileX = Math.floor(topLeftWorldX / TILE_SIZE);
  const maxTileX = Math.floor((topLeftWorldX + size.width) / TILE_SIZE);
  const minTileY = Math.max(0, Math.floor(topLeftWorldY / TILE_SIZE));
  const maxTileY = Math.min(numTiles - 1, Math.floor((topLeftWorldY + size.height) / TILE_SIZE));

  const tiles: Array<{ key: string; url: string; left: number; top: number }> = [];
  for (let tx = minTileX; tx <= maxTileX; tx += 1) {
    const wrappedTx = ((tx % numTiles) + numTiles) % numTiles;
    for (let ty = minTileY; ty <= maxTileY; ty += 1) {
      tiles.push({
        key: `${zoom}-${tx}-${ty}`,
        url: `https://tile.openstreetmap.org/${zoom}/${wrappedTx}/${ty}.png`,
        left: Math.round(tx * TILE_SIZE - topLeftWorldX),
        top: Math.round(ty * TILE_SIZE - topLeftWorldY),
      });
    }
  }

  const liveLat = worldYToLat(effectiveCenterWorldY, zoom);
  const liveLon = worldXToLon(effectiveCenterWorldX, zoom);

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <View style={styles.touchLayer} {...panResponder.panHandlers}>
        {tiles.map(tile => (
          <Image
            key={tile.key}
            source={{
              uri: tile.url,
              headers: { 'User-Agent': 'DurgeshAmlaJuiceRider/1.0' },
            }}
            style={[styles.tile, { left: tile.left, top: tile.top }]}
            resizeMode="cover"
          />
        ))}

        {/* Center pin / target */}
        <View pointerEvents="none" style={styles.pinWrapper}>
          <View style={styles.pinHead}>
            <View style={styles.pinInnerDot} />
          </View>
          <View style={styles.pinStem} />
          <View style={styles.pinShadow} />
        </View>
      </View>

      {/* Zoom controls */}
      <View pointerEvents="box-none" style={styles.zoomControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zoom in"
          onPress={() => setZoom(z => Math.min(MAX_ZOOM, z + 1))}
          disabled={zoom >= MAX_ZOOM}
          style={({ pressed }) => [
            styles.zoomButton,
            pressed ? styles.zoomButtonPressed : null,
            zoom >= MAX_ZOOM ? styles.zoomButtonDisabled : null,
          ]}>
          <Text style={styles.zoomText}>+</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zoom out"
          onPress={() => setZoom(z => Math.max(MIN_ZOOM, z - 1))}
          disabled={zoom <= MIN_ZOOM}
          style={({ pressed }) => [
            styles.zoomButton,
            styles.zoomButtonBottom,
            pressed ? styles.zoomButtonPressed : null,
            zoom <= MIN_ZOOM ? styles.zoomButtonDisabled : null,
          ]}>
          <Text style={styles.zoomText}>−</Text>
        </Pressable>
      </View>

      {/* Coordinate & attribution footer */}
      <View pointerEvents="none" style={styles.footerRow}>
        <View style={styles.coordBadge}>
          <Text style={styles.coordBadgeText}>
            {pin || dragOffset.x !== 0 || dragOffset.y !== 0
              ? `${liveLat.toFixed(5)}, ${liveLon.toFixed(5)}`
              : 'Drag or tap map to set pin'}
          </Text>
        </View>
        <View style={styles.attributionBadge}>
          <Text style={styles.attributionText}>© OpenStreetMap</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E5E8E1',
    overflow: 'hidden',
    position: 'relative',
  },
  touchLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  tile: {
    position: 'absolute',
    width: TILE_SIZE,
    height: TILE_SIZE,
  },
  pinWrapper: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -15,
    marginTop: -38,
    width: 30,
    height: 42,
    alignItems: 'center',
  },
  pinHead: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.danger,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  pinInnerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  pinStem: {
    width: 3,
    height: 10,
    backgroundColor: colors.danger,
    marginTop: -1,
  },
  pinShadow: {
    width: 10,
    height: 4,
    borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.35)',
    marginTop: -1,
  },
  zoomControls: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 3,
  },
  zoomButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  zoomButtonBottom: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  zoomButtonPressed: {
    backgroundColor: '#EDF2EA',
  },
  zoomButtonDisabled: {
    opacity: 0.4,
  },
  zoomText: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.primaryDark,
    lineHeight: 24,
  },
  footerRow: {
    position: 'absolute',
    left: spacing.xs,
    right: spacing.xs,
    bottom: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coordBadge: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  coordBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
  },
  attributionBadge: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  attributionText: {
    fontSize: 10,
    color: colors.textMuted,
  },
});

