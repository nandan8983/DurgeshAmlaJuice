/** The strip that tells a rider whether their taps have reached the server. */
import React from 'react';
import { useQueueStore } from '../store/queue';
import { Banner } from './ui';

export function SyncStatus(): React.JSX.Element | null {
  const { items, failed, online, syncing, flush, retryFailed } = useQueueStore(state => ({
    items: state.items,
    failed: state.failed,
    online: state.online,
    syncing: state.syncing,
    flush: state.flush,
    retryFailed: state.retryFailed,
  }));

  if (failed.length > 0) {
    return (
      <Banner
        tone="danger"
        text={`${failed.length} update${failed.length === 1 ? '' : 's'} could not be saved.`}
        action={{ label: 'Try again', onPress: () => void retryFailed() }}
      />
    );
  }

  if (!online) {
    return (
      <Banner
        tone="warning"
        text={
          items.length > 0
            ? `Offline — ${items.length} update${items.length === 1 ? '' : 's'} saved on this phone.`
            : 'Offline — your work is saved and will sync automatically.'
        }
      />
    );
  }

  if (items.length > 0) {
    return (
      <Banner
        tone="info"
        text={syncing ? 'Syncing…' : `${items.length} update${items.length === 1 ? '' : 's'} waiting to sync.`}
        action={syncing ? undefined : { label: 'Sync now', onPress: () => void flush() }}
      />
    );
  }

  return null;
}
