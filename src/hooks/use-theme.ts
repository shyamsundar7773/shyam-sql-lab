/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { useAppTheme } from '@/contexts/theme-context';

export function useTheme() {
  const { colors } = useAppTheme();

  return {
    text: colors.primaryText,
    background: colors.background,
    backgroundElement: colors.surface,
    backgroundSelected: colors.surfaceMuted,
    textSecondary: colors.secondaryText,
    primary: colors.primary,
    border: colors.border,
  };
}
