/** Navigation: a stack behind the route screen, with a small header menu. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from './store/auth';
import { LoginScreen } from './screens/LoginScreen';
import { RouteScreen } from './screens/RouteScreen';
import { NextStopScreen } from './screens/NextStopScreen';
import { AddCustomerScreen } from './screens/AddCustomerScreen';
import { CustomersScreen } from './screens/CustomersScreen';
import { CustomerDetailScreen } from './screens/CustomerDetailScreen';
import { DaySummaryScreen } from './screens/DaySummaryScreen';
import { colors, spacing } from './theme';

export type RootStackParamList = {
  Route: undefined;
  NextStop: { deliveryId: string };
  Customers: undefined;
  CustomerDetail: { customerId: string };
  AddCustomer: undefined;
  DaySummary: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function HeaderLinks({
  onCustomers,
  onSummary,
}: {
  onCustomers: () => void;
  onSummary: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.headerLinks}>
      <Pressable onPress={onCustomers} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.headerLink}>Customers</Text>
      </Pressable>
      <Pressable onPress={onSummary} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.headerLink}>Summary</Text>
      </Pressable>
    </View>
  );
}

export function AppNavigator(): React.JSX.Element {
  const token = useAuthStore(state => state.token);

  return (
    <NavigationContainer>
      {token ? (
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.primaryDark },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '800' },
            contentStyle: { backgroundColor: colors.bg },
          }}>
          <Stack.Screen
            name="Route"
            component={RouteScreen}
            options={({ navigation }) => ({
              title: "Today's Route",
              headerRight: () => (
                <HeaderLinks
                  onCustomers={() => navigation.navigate('Customers')}
                  onSummary={() => navigation.navigate('DaySummary')}
                />
              ),
            })}
          />
          <Stack.Screen name="NextStop" component={NextStopScreen} options={{ title: 'Stop' }} />
          <Stack.Screen name="Customers" component={CustomersScreen} options={{ title: 'My customers' }} />
          <Stack.Screen
            name="CustomerDetail"
            component={CustomerDetailScreen}
            options={{ title: 'Customer' }}
          />
          <Stack.Screen
            name="AddCustomer"
            component={AddCustomerScreen}
            options={{ title: 'Add customer' }}
          />
          <Stack.Screen name="DaySummary" component={DaySummaryScreen} options={{ title: 'Day summary' }} />
        </Stack.Navigator>
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Route" component={LoginScreen} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  headerLinks: { flexDirection: 'row', gap: spacing.lg },
  headerLink: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
