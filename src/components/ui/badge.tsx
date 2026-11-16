import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/text';
import { colors, radius, space } from '@/constants/theme';

export type BadgeProps = {
  label: string;
  variant?: 'ink' | 'tint';
  height?: number;
  style?: StyleProp<ViewStyle>;
};

export function Badge({ label, variant = 'ink', height = 30, style }: BadgeProps) {
  return (
    <View
      style={[
        styles.base,
        { height, minWidth: height, borderRadius: radius.control },
        variant === 'ink' ? styles.ink : styles.tint,
        style,
      ]}>
      <Text
        weight="extrabold"
        color="ink"
        style={{ fontSize: height >= 32 ? 13 : 12, lineHeight: 17 }}>
        {label}
      </Text>
    </View>
  );
}

export function CountDot({ label, inverted, size = 24 }: { label: string; inverted?: boolean; size?: number }) {
  return (
    <View
      style={[
        styles.dot,
        { width: size, height: size, borderRadius: size / 2 },
        inverted ? styles.dotInverted : styles.ink,
      ]}>
      <Text
        weight={size > 24 ? 'extrabold' : 'bold'}
        color="ink"
        style={{ fontSize: size > 24 ? 11 : 12, lineHeight: 16 }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { paddingHorizontal: space.inset, alignItems: 'center', justifyContent: 'center' },
  ink: { backgroundColor: colors.accent },
  tint: { backgroundColor: colors.accentSoft },
  dot: { alignItems: 'center', justifyContent: 'center' },
  dotInverted: { backgroundColor: colors.white },
});
