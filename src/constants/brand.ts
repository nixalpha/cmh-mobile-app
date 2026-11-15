import tokens from '../../assets/brand/tokens.json';

export const brand = {
  ...tokens,
  logoAspectRatio: 1454 / 537,
  description: 'Track your travels, rank favorite places, and discover destinations through friends.',
} as const;
