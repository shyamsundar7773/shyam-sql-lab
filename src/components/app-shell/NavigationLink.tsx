import { Link, usePathname } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { NavigationItem } from '@/constants/navigation';
import { useAppTheme } from '@/contexts/theme-context';

const icons = {
  home: { ios: 'square.grid.2x2.fill', android: 'dashboard', web: 'dashboard' },
  learning: { ios: 'map.fill', android: 'map', web: 'map' },
  practice: {
    ios: 'chevron.left.forwardslash.chevron.right',
    android: 'code',
    web: 'code',
  },
  projects: { ios: 'folder.fill', android: 'folder', web: 'folder' },
  interview: { ios: 'person.2.fill', android: 'groups', web: 'groups' },
  notes: { ios: 'note.text', android: 'description', web: 'description' },
  addNotes: { ios: 'square.and.pencil', android: 'edit_note', web: 'edit_note' },
  progress: { ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' },
  profile: { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' },
} as const satisfies Record<NavigationItem['icon'], SymbolViewProps['name']>;

type NavigationLinkProps = {
  item: NavigationItem;
  onNavigate?: () => void;
};

export function NavigationLink({ item, onNavigate }: NavigationLinkProps) {
  const pathname = usePathname();
  const { colors } = useAppTheme();
  const isActive = item.href === '/' ? pathname === '/' : pathname === item.href;

  return (
    <Link href={item.href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityState={{ selected: isActive }}
        onPress={onNavigate}
        style={({ pressed }) => [
          styles.link,
          isActive && { backgroundColor: colors.sidebarActive },
          pressed && styles.pressed,
        ]}>
        <SymbolView
          name={icons[item.icon]}
          size={19}
          tintColor={isActive ? colors.white : colors.sidebarText}
          style={styles.icon}
        />
        <Text
          style={[
            styles.label,
            { color: isActive ? colors.white : colors.sidebarText },
            isActive && styles.activeLabel,
          ]}>
          {item.label}
        </Text>
        {isActive ? <View style={[styles.activeIndicator, { backgroundColor: colors.accent }]} /> : null}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  link: {
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    position: 'relative',
  },
  pressed: {
    opacity: 0.76,
  },
  icon: {
    width: 21,
    height: 21,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  activeLabel: {
    fontWeight: '700',
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    width: 3,
    height: 24,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
});
