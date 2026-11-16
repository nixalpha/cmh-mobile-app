import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_500Medium } from '@expo-google-fonts/nunito/500Medium';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { useFonts } from 'expo-font';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import Head from 'expo-router/head';
import type { Metadata } from 'expo-router/server';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useConvexAuth, useQuery } from 'convex/react';

import { FriendLocationBanner } from '@/components/friend-location-banner';
import { FriendLocationProvider } from '@/components/friend-location-provider';
import { AutoCollectionRunner } from '@/components/auto-collection';
import { BackendProvider } from '@/components/backend-provider';
import { AsyncButton, Notice } from '@/components/live-ui';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { colors } from '@/constants/theme';
import { api } from '@/lib/backend';

SplashScreen.preventAutoHideAsync();

export function generateMetadata(): Metadata {
  return {
    title: 'travi',
    applicationName: 'travi',
    description: 'Collect the places you love. Find your next favorite with travi.',
    openGraph: {
      title: 'travi',
      siteName: 'travi',
      description: 'Collect the places you love. Find your next favorite with travi.',
      images: [{ url: '/press-kit/social/travi-social-card-1200x630.png', width: 1200, height: 630, alt: 'travi — Every place you’ve been, in order.' }],
    },
  };
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return <Screen backdrop="onboarding"><Text variant="title">Couldn’t open this screen</Text><Notice>Check your connection or try opening another place.</Notice><AsyncButton label="Try again" onPress={retry} /></Screen>;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  return (
    <>
      <Head>
        <title>travi</title>
        <meta name="application-name" content="travi" />
        <meta name="description" content="Collect the places you love. Find your next favorite with travi." />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/press-kit/icons/apple-touch-icon.png" />
        <meta property="og:image" content="/press-kit/social/travi-social-card-1200x630.png" />
        <meta property="og:title" content="travi" />
        <meta name="theme-color" content="#909DC3" />
      </Head>
      {(loaded || error) && (
        <BackendProvider>
          <StatusBar style="dark" />
          <SessionRoutes />
        </BackendProvider>
      )}
    </>
  );
}

function SessionRoutes() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : 'skip');
  if (isLoading || (isAuthenticated && me === undefined)) return <Screen><Notice>Opening travi…</Notice></Screen>;
  return (
    <AuthenticatedLocationProvider enabled={isAuthenticated && !!me?.handle}>
    <AutoCollectionRunner userId={isAuthenticated ? me?._id : null} />
    <Stack screenOptions={{ title: 'travi', headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="auth" />
      <Stack.Protected guard={__DEV__} redirectTo="/">
        <Stack.Screen name="dev" />
      </Stack.Protected>
      <Stack.Protected guard={isAuthenticated && (me === undefined || !!me?.handle)} redirectTo="/auth">
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="friends" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="place/[id]" />
        <Stack.Screen name="city/[id]" />
        <Stack.Screen name="rank/[id]" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="landmark-visit/[id]" options={{ presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
    </AuthenticatedLocationProvider>
  );
}

function AuthenticatedLocationProvider({ enabled, children }: { enabled: boolean; children: import('react').ReactNode }) {
  return enabled ? <FriendLocationProvider>{children}<FriendLocationBanner /></FriendLocationProvider> : children;
}
