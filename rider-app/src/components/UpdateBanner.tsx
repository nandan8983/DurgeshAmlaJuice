/**
 * Persistent banner shown whenever a newer APK is published on GitHub Releases.
 */
import React from 'react';
import { installReleaseUpdate, useUpdateStore } from '../lib/updater';
import { Banner } from './ui';

export function UpdateBanner(): React.JSX.Element | null {
  const available = useUpdateStore(state => state.available);

  if (!available) return null;

  return (
    <Banner
      tone="info"
      text={`New version v${available.version} is available.`}
      action={{
        label: 'Install latest update',
        onPress: () => void installReleaseUpdate(available),
      }}
    />
  );
}

