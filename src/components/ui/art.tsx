import type { StyleProp, ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { art, type ArtName } from '@/art';

export type ArtProps = {
  name: ArtName;
  width?: number | `${number}%`;
  height?: number | `${number}%`;
  style?: StyleProp<ViewStyle>;
};

export function Art({ name, width = '100%', height = '100%', style }: ArtProps) {
  return <SvgXml xml={art[name]} width={width} height={height} style={style} />;
}
