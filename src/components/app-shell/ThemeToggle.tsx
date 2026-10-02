import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useAppTheme } from '@/contexts/theme-context';

type ThemeToggleProps = {
  compact?: boolean;
};

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { colors, isDark, toggleTheme } = useAppTheme();

  const onPress = () => {
    void toggleTheme().catch((error: unknown) => {
      console.error('[Theme] Theme changed for this session but could not be saved.', error);
    });
  };

  return (
    <Pressable
      accessibilityLabel={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      accessibilityRole="button"
      accessibilityHint="Changes the appearance across the app and saves your choice"
      onPress={onPress}
      style={({ pressed }) => [
        styles.control,
        {
          backgroundColor: compact ? colors.elevatedSurface : colors.sidebarActive,
          borderColor: colors.border,
        },
        pressed && styles.pressed,
      ]}>
      <SymbolView
        name={
          isDark
            ? { ios: 'sun.max.fill', android: 'light_mode', web: 'light_mode' }
            : { ios: 'moon.fill', android: 'dark_mode', web: 'dark_mode' }
        }
        size={18}
        tintColor={compact ? colors.primaryText : colors.sidebarText}
      />
      {!compact ? (
        <Text style={[styles.label, { color: colors.sidebarText }]}>
          {isDark ? 'Light mode' : 'Dark mode'}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  control: {
    minHeight: 44,
    minWidth: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
    paddingHorizontal: 12,
  },
  label: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
});
