import { Image, type ImageStyle, type StyleProp } from 'react-native';

import { brand } from '@/constants/brand';

const logos = {
  color: require('../../assets/brand/logo-color.png'),
  white: require('../../assets/brand/logo-white.png'),
  dark: require('../../assets/brand/logo-dark.png'),
};
const marks = {
  color: require('../../assets/brand/mark-color.png'),
  white: require('../../assets/brand/mark-white.png'),
  dark: require('../../assets/brand/mark-dark.png'),
};

/** Use the supplied artwork; never recreate the wordmark with a font. */
export function BrandLogo({ height = 28, symbol = false, variant = 'color', decorative = false, style }: {
  height?: number;
  symbol?: boolean;
  variant?: keyof typeof logos;
  decorative?: boolean;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={symbol ? marks[variant] : logos[variant]}
      resizeMode="contain"
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : brand.name}
      style={[{ width: symbol ? height : height * brand.logoAspectRatio, height, flexShrink: 0 }, style]}
    />
  );
}
