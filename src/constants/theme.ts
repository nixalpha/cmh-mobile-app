import type { TextStyle } from 'react-native';

import { brand } from '@/constants/brand';

export const colors = {
  ink: brand.ink,
  inkSoft: '#343C55',
  slate: '#49516A',
  muted: '#606981',
  white: '#FFFFFF',
  canvas: brand.mist,
  accent: brand.tile,
  accentForeground: brand.ink,
  accentText: brand.action,
  accentSoft: brand.mist,
  alert: '#D9533F',
  inkTint: 'rgba(36,42,61,0.08)',
  inkFaint: 'rgba(36,42,61,0.25)',
  inkLine: 'rgba(36,42,61,0.12)',
  tile: 'rgba(255,255,255,0.6)',
  tileStrong: 'rgba(255,255,255,0.7)',
} as const;

export type TextColor = 'ink' | 'inkSoft' | 'slate' | 'muted' | 'white' | 'accent' | 'accentText';

export const washes = {
  lavender: brand.tile,
  paper: brand.paper,
  mist: brand.mist,
} as const;

export const glass = {
  regular: {
    fill: 'linear-gradient(135deg, rgba(255,255,255,0.66), rgba(255,255,255,0.28))',
    border: 'rgba(255,255,255,0.9)',
    blur: 28,
  },
  dim: {
    fill: 'linear-gradient(135deg, rgba(255,255,255,0.28), rgba(255,255,255,0.28))',
    border: 'rgba(255,255,255,0.45)',
    blur: 18,
  },
} as const;

export const shadows = {
  glass: '0 18px 44px rgba(40,60,100,0.12)',
  card: '0 18px 40px rgba(30,45,70,0.18)',
  cardSmall: '0 14px 30px rgba(30,45,70,0.14)',
} as const;

// Shared geometry: compact surfaces with a smaller inset for nested controls.
export const radius = {
  control: 8,
  inner: 4,
  tile: 8,
  field: 8,
  card: 8,
  panel: 8,
  hero: 8,
  sheet: 8,
} as const;

export const space = {
  gutter: 20,
  screenMaxWidth: 560,
  screenTop: 16,
  stack: 8,
  inset: 12,
  inline: 4,
  fine: 2,
  tabBarHeight: 68,
  tabBarBottom: 12,
  scrollBottom: 120,
} as const;

export const fonts = {
  regular: 'Nunito_400Regular',
  medium: 'Nunito_500Medium',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extrabold: 'Nunito_800ExtraBold',
} as const;

export type FontWeight = keyof typeof fonts;

export const type = {
  display: { fontFamily: fonts.extrabold, fontSize: 40, lineHeight: 44, letterSpacing: -0.8 },
  hero: { fontFamily: fonts.extrabold, fontSize: 38, lineHeight: 42, letterSpacing: -0.8 },
  title: { fontFamily: fonts.extrabold, fontSize: 32, lineHeight: 36, letterSpacing: -0.5 },
  title2: { fontFamily: fonts.extrabold, fontSize: 26, lineHeight: 29, letterSpacing: -0.8 },
  title3: { fontFamily: fonts.extrabold, fontSize: 22, lineHeight: 28, letterSpacing: -0.6 },
  heading: { fontFamily: fonts.extrabold, fontSize: 20, lineHeight: 26, letterSpacing: -0.5 },
  subheading: { fontFamily: fonts.extrabold, fontSize: 18, lineHeight: 24, letterSpacing: -0.4 },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 16, lineHeight: 21 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22.5 },
  bodySmall: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  label: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19 },
  meta: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  micro: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 15 },
  eyebrow: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 15, letterSpacing: 1.5 },
} as const satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof type;
