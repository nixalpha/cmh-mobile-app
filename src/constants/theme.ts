import type { TextStyle } from 'react-native';

export const colors = {
  ink: '#0E1116',
  inkSoft: '#1E2530',
  slate: '#3A4250',
  muted: '#4A5361',
  white: '#FFFFFF',
  canvas: '#E8EDF3',
  alert: '#D9533F',
  inkTint: 'rgba(14,17,22,0.08)',
  inkFaint: 'rgba(14,17,22,0.25)',
  inkLine: 'rgba(14,17,22,0.12)',
  tile: 'rgba(255,255,255,0.6)',
  tileStrong: 'rgba(255,255,255,0.7)',
} as const;

export type TextColor = 'ink' | 'inkSoft' | 'slate' | 'muted' | 'white';

export const washes = {
  peach: '255,219,180',
  butter: '255,243,117',
  sky: '199,226,255',
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

export const radius = {
  tile: 16,
  field: 18,
  card: 24,
  panel: 30,
  hero: 32,
  sheet: 34,
} as const;

export const space = {
  gutter: 20,
  stack: 16,
  tabBarHeight: 68,
  tabBarBottom: 24,
  scrollBottom: 120,
} as const;

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

export type FontWeight = keyof typeof fonts;

export const type = {
  display: { fontFamily: fonts.extrabold, fontSize: 40, lineHeight: 41, letterSpacing: -1.6 },
  hero: { fontFamily: fonts.extrabold, fontSize: 38, lineHeight: 40, letterSpacing: -1.6 },
  title: { fontFamily: fonts.extrabold, fontSize: 32, lineHeight: 35, letterSpacing: -1.2 },
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
