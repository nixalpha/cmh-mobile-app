import type { ComponentRef, ReactNode, Ref } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandHeader } from '@/components/brand-header';
import { Backdrop, type BackdropName } from '@/components/ui/backdrop';
import { colors, space } from '@/constants/theme';

export function useScreenTop() {
  return useSafeAreaInsets().top + space.screenTop;
}

export type ScreenProps = {
  backdrop?: BackdropName;
  headerActions?: ReactNode;
  color?: string;
  scroll?: boolean;
  scrollRef?: Ref<ComponentRef<typeof ScrollView>>;
  background?: ReactNode;
  overlay?: ReactNode;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export function Screen({ backdrop, headerActions, color, scroll, scrollRef, background, overlay, style, children }: ScreenProps) {
  const top = useScreenTop();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { backgroundColor: color ?? colors.canvas, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <Backdrop name={backdrop} color={color} />
      {background}
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          style={styles.root}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, styles.scroll, { paddingTop: top }, style]}>
          <BrandHeader actions={headerActions} />
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.root, styles.content, { paddingTop: top }, style]}>
          <BrandHeader actions={headerActions} />
          {children}
        </View>
      )}
      {overlay}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { width: '100%', maxWidth: space.screenMaxWidth, alignSelf: 'center', paddingHorizontal: space.gutter, gap: space.stack },
  scroll: { paddingBottom: space.scrollBottom },
});
