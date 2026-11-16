import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexReactClient } from 'convex/react';
import * as SecureStore from 'expo-secure-store';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';

import { BrandLogo } from '@/components/brand-logo';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/backend';

const url = process.env.EXPO_PUBLIC_CONVEX_URL;
const client = url ? new ConvexReactClient(url) : null;
const storage = Platform.OS === 'web' ? undefined : {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

export function BackendProvider({ children }: { children: ReactNode }) {
  if (!client) return <Screen><BrandLogo height={28} /><Text>Set EXPO_PUBLIC_CONVEX_URL to connect travi.</Text></Screen>;
  return <ConvexAuthProvider client={client} api={api.auth} storage={storage} ambientSignIns={[]}>{children}</ConvexAuthProvider>;
}
