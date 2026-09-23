import { useColorScheme } from 'react-native';

import type { Category, NoticeStatus } from './lib/types';

const light = {
  bg: '#F3F5F9',
  card: '#FFFFFF',
  cardAlt: '#F7F8FB',
  text: '#131926',
  sub: '#556070',
  faint: '#8A94A6',
  border: '#E3E7EE',
  primary: '#2F6BFF',
  primarySoft: '#E8EFFF',
  onPrimary: '#FFFFFF',
  accent: '#FF6B1A',
  accentSoft: '#FFF0E6',
  danger: '#E5484D',
  success: '#12A150',
  tabBar: '#FFFFFF',
};

const dark: typeof light = {
  bg: '#0D1016',
  card: '#161A22',
  cardAlt: '#1C212B',
  text: '#E8ECF3',
  sub: '#A2ABBB',
  faint: '#6E7889',
  border: '#262C37',
  primary: '#6B93FF',
  primarySoft: '#1B2640',
  onPrimary: '#0D1016',
  accent: '#FF8A45',
  accentSoft: '#35231A',
  danger: '#FF6B6F',
  success: '#3DD68C',
  tabBar: '#12151C',
};

export type Palette = typeof light;

export function useColors(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

/** 공고 종류 · 상태별 색 (배경은 투명도로 만든다) */
export const CATEGORY_COLOR: Record<Category, string> = {
  APT: '#2F6BFF',
  REMNDR: '#E5484D',
  RESUPPLY: '#E8590C',
  URBTY: '#8E4EC6',
  PBLPVT: '#0E9F8E',
  OPT: '#B7791F',
};

export const STATUS_COLOR: Record<NoticeStatus, string> = {
  open: '#12A150',
  upcoming: '#2F6BFF',
  waiting: '#8E4EC6',
  closed: '#8A94A6',
};

export function tint(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}
