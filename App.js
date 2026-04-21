// App.js
import 'react-native-url-polyfill/auto';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { uuidv4, supabase } from './lib/supabase';

import HomeScreen from './screens/HomeScreen';
import TournamentDetailScreen from './screens/TournamentDetailScreen';
import JoinScreen from './screens/JoinScreen';
import AdminScreen from './screens/AdminScreen';
import WithdrawScreen from './screens/WithdrawScreen';

const Stack = createStackNavigator();

// ─── App Context ────────────────────────────────────────────────
export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export default function App() {
  const [deviceId, setDeviceId] = useState(null);
  const [adminSession, setAdminSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initApp();
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      setAdminSession(session);
      if (session?.user) {
        const { data } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', session.user.id)
          .single();
        setIsAdmin(data?.is_admin === true);
      } else {
        setIsAdmin(false);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function initApp() {
    try {
      let id = await AsyncStorage.getItem('device_id');
      if (!id) {
        id = uuidv4();
        await AsyncStorage.setItem('device_id', id);
      }
      setDeviceId(id);

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setAdminSession(session);
        const { data } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', session.user.id)
          .single();
        setIsAdmin(data?.is_admin === true);
      }
    } catch (e) {
      console.log('Init error:', e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loader}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#ff5722" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppContext.Provider value={{ deviceId, adminSession, isAdmin, setAdminSession, setIsAdmin }}>
          <NavigationContainer>
            <StatusBar style="light" />
            <Stack.Navigator
              screenOptions={{
                headerShown: false,
                cardStyle: { backgroundColor: '#080810' },
                animationEnabled: true,
              }}
            >
              <Stack.Screen name="Home" component={HomeScreen} />
              <Stack.Screen name="TournamentDetail" component={TournamentDetailScreen} />
              <Stack.Screen name="JoinTournament" component={JoinScreen} />
              <Stack.Screen name="Admin" component={AdminScreen} />
              <Stack.Screen name="Withdraw" component={WithdrawScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </AppContext.Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    backgroundColor: '#080810',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
