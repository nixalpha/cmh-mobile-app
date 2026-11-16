import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/brand-logo';
import { DiscoverMap } from '@/components/discover-map';
import { space } from '@/constants/theme';

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = useState(false);

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  return (
    <View style={styles.screen}>
      <DiscoverMap active={focused} />
      <View style={[styles.friends, { bottom: Math.max(insets.bottom, space.tabBarBottom) + space.tabBarHeight + 16 }]}><Button label="Find my friends" icon="users" variant="glass" onPress={() => router.push('/friends')} /></View>
      <View pointerEvents="none" style={[styles.logo, {
        top: insets.top + space.screenTop,
        left: insets.left + space.gutter,
      }]}>
        <BrandLogo height={28} variant="white" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#02040A' },
  friends: { position: 'absolute', alignSelf: 'center', minWidth: 200 },
  logo: { position: 'absolute', minHeight: 44, justifyContent: 'center' },
});
