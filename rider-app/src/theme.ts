/** Colours and spacing. Amla green and beetroot magenta, readable in sunlight. */
export const colors = {
  bg: '#F6F7F4',
  surface: '#FFFFFF',
  border: '#E2E5DD',
  text: '#1C2416',
  textMuted: '#5F6B55',
  primary: '#2F7D3A', // amla green
  primaryDark: '#215C29',
  beetroot: '#8E2A5B',
  amla: '#2F7D3A',
  warning: '#B8681A',
  danger: '#B3261E',
  success: '#2F7D3A',
  pending: '#8A7B4F',
  disabled: '#B9C0B2',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 };

export const productColor = (product: 'amla' | 'beetroot'): string =>
  product === 'amla' ? colors.amla : colors.beetroot;

export const productLabel = (product: 'amla' | 'beetroot'): string =>
  product === 'amla' ? 'Amla' : 'Beetroot';
