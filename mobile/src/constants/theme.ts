/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Beanie Xchange brand palette — mirrors the CSS variables in the web app's
// globals.css (--bx-*). Keep in sync by hand; the web app is the source of
// truth for brand color values.
export const Brand = {
  pink: '#e8479a', // --bx-red (accent role): prices, primary CTAs
  pinkDark: '#cf3a85',
  purple: '#8b66d9',
  green: '#1f9e8d', // verified / success
  blue: '#3f86df', // verified-authentic badge
  ink: '#201c2b',
  cream: '#faf5ec', // --bx-bg page background
  line: '#ece5d9',
  lineStrong: '#ddd4c5',
} as const;

export const Colors = {
  light: {
    text: Brand.ink,
    background: Brand.cream,
    backgroundElement: '#ffffff', // --bx-surface: cards on the cream page
    backgroundSelected: Brand.line,
    textSecondary: '#8b8597', // --bx-muted
  },
  dark: {
    text: '#ffffff',
    background: '#161320',
    backgroundElement: '#232030',
    backgroundSelected: '#2e2a3d',
    textSecondary: '#b0aabf',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
