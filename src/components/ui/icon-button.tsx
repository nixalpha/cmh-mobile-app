import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Glass } from '@/components/ui/glass';
import { Icon, type IconName } from '@/components/ui/icon';
import { colors, radius } from '@/constants/theme';

export type IconButtonProps = {
  icon: IconName;
  label: string;
  variant?: 'glass' | 'ink' | 'plain';
  size?: number;
  iconSize?: number;
  badge?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  icon,
  label,
  variant = 'glass',
  size = 32,
  iconSize = 18,
  badge,
  selected,
  disabled,
  onPress,
  style,
}: IconButtonProps) {
  const shape = [styles.base, { width: size, height: size, borderRadius: radius.control }, disabled && styles.disabled];
  const hitSlop = size < 44 ? (44 - size) / 2 : undefined;
  const a11yState = { disabled: !!disabled, ...(selected !== undefined && { selected }) };
  const content = (
    <>
      {/* The View keeps the SVG above Glass's absolutely positioned blur layer on web. */}
      <View><Icon name={icon} size={iconSize} color={variant === 'ink' ? colors.accentForeground : colors.ink} /></View>
      {badge && <View style={styles.badge} />}
    </>
  );
  if (variant === 'glass') {
    return (
      <Glass
        radius={radius.card}
        onPress={onPress ?? (() => {})}
        disabled={disabled}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={a11yState}
        style={[shape, style]}>
        {content}
      </Glass>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={a11yState}
      style={[shape, variant === 'ink' && styles.ink, style]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  ink: { backgroundColor: colors.accent },
  disabled: { opacity: 0.5 },
  badge: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.alert,
  },
});
