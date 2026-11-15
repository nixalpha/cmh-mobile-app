import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { colors, fonts, type, type FontWeight, type TextColor, type TextVariant } from '@/constants/theme';

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  color?: TextColor;
  weight?: FontWeight;
};

export function Text({ variant = 'body', color = 'ink', weight, style, ...rest }: TextProps) {
  return (
    <RNText
      style={[type[variant], { color: colors[color] }, weight && { fontFamily: fonts[weight] }, style]}
      {...rest}
    />
  );
}
