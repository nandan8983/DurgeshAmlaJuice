/**
 * Durgesh Amla Juice — rider app.
 *
 * Boots in this order: restore the saved session, start the offline queue
 * (which drains whenever connectivity returns), then show the route.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppNavigator } from './src/navigation';
import { useAuthStore } from './src/store/auth';
import { startQueueSync, useQueueStore } from './src/store/queue';
import { startUpdateChecker } from './src/lib/updater';
import { colors } from './src/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Riders are on poor connections: don't hammer, don't spin forever.
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      networkMode: 'offlineFirst',
    },
    mutations: { networkMode: 'offlineFirst', retry: 0 },
  },
});

function App(): React.JSX.Element {
  const restore = useAuthStore(state => state.restore);
  const restored = useAuthStore(state => state.restored);
  const token = useAuthStore(state => state.token);
  const [queueReady, setQueueReady] = useState(false);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    const stop = startQueueSync();
    const stopUpdater = startUpdateChecker();
    setQueueReady(true);
    return () => {
      stop();
      stopUpdater();
    };
  }, []);

  useEffect(() => {
    if (token) {
      void useQueueStore.getState().flush();
    } else {
      queryClient.clear();
    }
  }, [token]);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <QueryClientProvider client={queryClient}>
        {restored && queueReady ? (
          <AppNavigator />
        ) : (
          <View style={styles.splash}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});

export default App;
