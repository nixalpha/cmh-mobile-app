import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/text';
import { colors } from '@/constants/theme';

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
        { height, minWidth: height, borderRadius: height / 2 },
        variant === 'ink' ? styles.ink : styles.tint,
        style,
      ]}>
      <Text
        weight="extrabold"
        color={variant === 'ink' ? 'white' : 'ink'}
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
        color={inverted ? 'ink' : 'white'}
        style={{ fontSize: size > 24 ? 11 : 12, lineHeight: 16 }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  ink: { backgroundColor: colors.ink },
  tint: { backgroundColor: colors.inkTint },
  dot: { alignItems: 'center', justifyContent: 'center' },
  dotInverted: { backgroundColor: colors.white },
});
