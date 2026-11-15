import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { ArtName } from '@/art';
import { Art } from '@/components/ui/art';

const illustrations: Record<string, ArtName> = {
  'Paris|FR': 'tileParis', 'Tokyo|JP': 'tileTokyo', 'Rome|IT': 'tileRome',
  'New York City|US': 'tileNewYork', 'Reykjavík|IS': 'tileReykjavik',
  'Lisbon|PT': 'tileLisbon', 'Kyoto|JP': 'pinKyoto', 'Porto|PT': 'porto',
  'Cappadocia|TR': 'pinCappadocia', 'Santorini|GR': 'pinSantorini', 'Banff|CA': 'pinBanff',
};

export function PlaceIllustration({ place, size = 48 }: { place: { name: string; countryCode?: string }; size?: number }) {
  const name = illustrations[`${place.name}|${place.countryCode}`];
  if (name) return <Art name={name} width={size} height={size} />;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <Path d="M5 48L32 35l27 13-27 13z" fill="#C6D9A2" />
      <Path d="M17 22l13-7 13 7-13 7z" fill="#EBA57C" />
      <Path d="M17 22v24l13 7V29z" fill="#FFF3D3" />
      <Path d="M30 29l13-7v24l-13 7z" fill="#D9B68F" />
      <Path d="M22 30v5m0 5v5m13-13v5m0 5v5" stroke="#668A8D" strokeWidth={3} />
      <Rect x={49} y={36} width={2} height={15} rx={1} fill="#8B7657" />
      <Circle cx={50} cy={33} r={7} fill="#82AF83" />
    </Svg>
  );
}
