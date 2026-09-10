import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { Brand } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Longest we'll hold the splash waiting for the stored token to be verified.
// `apiMe()` has no timeout of its own, so without this a stalled connection on
// launch would leave the user staring at the splash indefinitely.
const MAX_SPLASH_MS = 2000;

/**
 * Holds the native splash until the session has re-hydrated, so the app opens
 * on its real signed-in state instead of flashing the signed-out one. Lives
 * inside AuthProvider because it reads `loading`.
 */
function SplashGate() {
  const { loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch(() => {});
      return;
    }
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, MAX_SPLASH_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';
  return (
    <AuthProvider>
      <SplashGate />
      <ThemeProvider value={dark ? DarkTheme : DefaultTheme}>
        <Stack
          screenOptions={{
            headerTintColor: Brand.pink,
            headerStyle: { backgroundColor: dark ? '#161320' : Brand.cream },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="listing/[id]" options={{ title: 'Listing' }} />
          <Stack.Screen name="checkout/[id]" options={{ title: 'Checkout' }} />
        </Stack>
      </ThemeProvider>
    </AuthProvider>
  );
}
