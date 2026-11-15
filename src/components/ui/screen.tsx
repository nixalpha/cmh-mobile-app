import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Backdrop, type BackdropName } from '@/components/ui/backdrop';
import { space } from '@/constants/theme';

export function useScreenTop() {
  return useSafeAreaInsets().top + 4;
}

export type ScreenProps = {
  backdrop?: BackdropName;
  color?: string;
  scroll?: boolean;
  background?: ReactNode;
  overlay?: ReactNode;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export function Screen({ backdrop, color, scroll, background, overlay, style, children }: ScreenProps) {
  const top = useScreenTop();
  return (
    <View style={styles.root}>
      <Backdrop name={backdrop} color={color} />
      {background}
      {scroll ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, styles.scroll, { paddingTop: top }, style]}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.root, styles.content, { paddingTop: top }, style]}>{children}</View>
      )}
      {overlay}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: space.gutter, gap: space.stack },
  scroll: { paddingBottom: space.scrollBottom },
});
