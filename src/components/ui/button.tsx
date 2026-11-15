import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Glass } from '@/components/ui/glass';
import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors } from '@/constants/theme';

export type ButtonProps = {
  label: string;
  variant?: 'primary' | 'secondary' | 'glass' | 'link';
  height?: number;
  fontSize?: number;
  icon?: IconName;
  trailingIcon?: IconName;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  variant = 'primary',
  height = 56,
  fontSize = 16,
  icon,
  trailingIcon,
  onPress,
  style,
}: ButtonProps) {
  const tint = variant === 'primary' ? colors.white : colors.ink;
  const content = (
    <>
      {icon && <Icon name={icon} color={tint} />}
      <Text
        variant="label"
        weight={variant === 'link' ? 'semibold' : 'bold'}
        style={{ fontSize, lineHeight: fontSize * 1.35, color: tint }}>
        {label}
      </Text>
      {trailingIcon && <Icon name={trailingIcon} color={tint} size={fontSize + 2} />}
    </>
  );
  const shape = [styles.base, { height, borderRadius: height / 2 }];

  if (variant === 'glass') {
    return (
      <Glass radius={height / 2} onPress={onPress} accessibilityRole="button" style={[shape, style]}>
        {content}
      </Glass>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        shape,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        pressed && styles.pressed,
        style,
      ]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  primary: { backgroundColor: colors.ink },
  secondary: {
    backgroundColor: colors.tileStrong,
    borderWidth: 1,
    borderColor: colors.inkLine,
  },
  pressed: { opacity: 0.85 },
});
