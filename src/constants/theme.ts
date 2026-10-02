/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform, type ViewStyle } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export const DesignTokens = {
  colors: {
    navy: '#101C36',
    navyElevated: '#1A2948',
    navyMuted: '#A7B4CC',
    background: '#F4F7FB',
    surface: '#FFFFFF',
    surfaceMuted: '#F8FAFD',
    border: '#E5EAF2',
    text: '#17233B',
    textSecondary: '#65738B',
    textMuted: '#8B97AA',
    primary: '#3478F6',
    primarySoft: '#EAF1FF',
    cyan: '#16B8C8',
    cyanSoft: '#E5F9FA',
    green: '#1CA77A',
    greenSoft: '#E7F7F0',
    amber: '#D88A22',
    amberSoft: '#FFF4E2',
    violet: '#8065D8',
    violetSoft: '#F0EDFF',
    white: '#FFFFFF',
  },
  typography: {
    family: 'System',
    mono: 'monospace',
    pageTitle: 28,
    sectionTitle: 17,
    body: 14,
    caption: 12,
  },
  spacing: {
    xsmall: 4,
    small: 8,
    medium: 12,
    regular: 16,
    large: 24,
    xlarge: 32,
    section: 36,
  },
  radius: {
    small: 10,
    medium: 16,
    large: 22,
    pill: 999,
  },
  layout: {
    sidebarWidth: 264,
    contentMaxWidth: 1400,
    desktopBreakpoint: 980,
  },
  elevation: {
    card:
      Platform.select({
        web: {
          boxShadow: '0 6px 18px rgba(26, 49, 84, 0.045)',
        },
        ios: {
          shadowColor: '#1A3154',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.045,
          shadowRadius: 18,
        },
        android: { elevation: 2 },
        default: { elevation: 2 },
      }) ?? {},
  },
} as const;

export type AppTheme = 'light' | 'dark';

export type ThemePalette = {
  background: string;
  surface: string;
  elevatedSurface: string;
  surfaceMuted: string;
  primaryText: string;
  secondaryText: string;
  mutedText: string;
  border: string;
  primary: string;
  primarySoft: string;
  accent: string;
  accentSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  codeBackground: string;
  codeText: string;
  sidebarBackground: string;
  sidebarText: string;
  sidebarActive: string;
  sidebarCaption: string;
  white: string;
};

export const ThemeTokens: Record<AppTheme, ThemePalette> = {
  light: {
    background: '#F4F7FB',
    surface: '#FFFFFF',
    elevatedSurface: '#FFFFFF',
    surfaceMuted: '#F8FAFD',
    primaryText: '#17233B',
    secondaryText: '#53627A',
    mutedText: '#718098',
    border: '#DCE3ED',
    primary: '#2868D7',
    primarySoft: '#EAF1FF',
    accent: '#087F8C',
    accentSoft: '#E5F7F8',
    success: '#137B59',
    successSoft: '#E7F7F0',
    warning: '#935707',
    warningSoft: '#FFF4E2',
    danger: '#B43C48',
    dangerSoft: '#FCECEE',
    codeBackground: '#EEF2F7',
    codeText: '#213047',
    sidebarBackground: '#101C36',
    sidebarText: '#B6C2D7',
    sidebarActive: '#1A2948',
    sidebarCaption: '#8796AF',
    white: '#FFFFFF',
  },
  dark: {
    background: '#151C29',
    surface: '#1C2635',
    elevatedSurface: '#242F40',
    surfaceMuted: '#202B3B',
    primaryText: '#E7EDF6',
    secondaryText: '#B5C0D0',
    mutedText: '#93A1B5',
    border: '#354255',
    primary: '#82AEFF',
    primarySoft: '#263B5B',
    accent: '#72CFD4',
    accentSoft: '#203E48',
    success: '#6BD1A8',
    successSoft: '#203D39',
    warning: '#E7B86D',
    warningSoft: '#403728',
    danger: '#F08E98',
    dangerSoft: '#472E38',
    codeBackground: '#121A26',
    codeText: '#DAE4F2',
    sidebarBackground: '#101724',
    sidebarText: '#B5C0D0',
    sidebarActive: '#26364D',
    sidebarCaption: '#93A1B5',
    white: '#F3F6FB',
  },
};

export function getThemeColors(theme: AppTheme) {
  const palette = ThemeTokens[theme];
  return {
    ...DesignTokens.colors,
    ...palette,
    background: palette.background,
    surface: palette.surface,
    surfaceMuted: palette.surfaceMuted,
    border: palette.border,
    text: palette.primaryText,
    textSecondary: palette.secondaryText,
    textMuted: palette.mutedText,
    primary: palette.primary,
    primarySoft: palette.primarySoft,
    cyan: palette.accent,
    cyanSoft: palette.accentSoft,
    green: palette.success,
    greenSoft: palette.successSoft,
    amber: palette.warning,
    amberSoft: palette.warningSoft,
    violet: palette.primary,
    violetSoft: palette.primarySoft,
    white: palette.white,
    navy: palette.sidebarBackground,
    navyElevated: palette.sidebarActive,
    navyMuted: palette.sidebarText,
    codeBackground: palette.codeBackground,
    codeText: palette.codeText,
  };
}

export const SemanticElevation: Record<AppTheme, ViewStyle> = {
  light:
    Platform.select({
      web: { boxShadow: '0 6px 18px rgba(26, 49, 84, 0.045)' },
      ios: {
        shadowColor: '#1A3154',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.045,
        shadowRadius: 18,
      },
      android: { elevation: 2 },
      default: { elevation: 2 },
    }) ?? {},
  dark:
    Platform.select({
      web: { boxShadow: '0 8px 22px rgba(0, 0, 0, 0.16)' },
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: { elevation: 3 },
      default: { elevation: 3 },
    }) ?? {},
};

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
