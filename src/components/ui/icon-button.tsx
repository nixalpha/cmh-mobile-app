import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Glass } from '@/components/ui/glass';
import { Icon, type IconName } from '@/components/ui/icon';
import { colors } from '@/constants/theme';

export type IconButtonProps = {
  icon: IconName;
  label: string;
  variant?: 'glass' | 'ink' | 'plain';
  size?: number;
  iconSize?: number;
  badge?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  icon,
  label,
  variant = 'glass',
  size = 44,
  iconSize = 18,
  badge,
  onPress,
  style,
}: IconButtonProps) {
  const shape = [styles.base, { width: size, height: size, borderRadius: size / 2 }];
  const content = (
    <>
      <Icon name={icon} size={iconSize} color={variant === 'ink' ? colors.white : colors.ink} />
      {badge && <View style={styles.badge} />}
    </>
  );
  if (variant === 'glass') {
    return (
      <Glass
        radius={size / 2}
        onPress={onPress ?? (() => {})}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[shape, style]}>
        {content}
      </Glass>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[shape, variant === 'ink' && styles.ink, style]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  ink: { backgroundColor: colors.ink },
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
