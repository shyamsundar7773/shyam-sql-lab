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

const mainSectionByPath: Record<string, string> = {
  '/topic': '/learning-path',
  '/sql-practice-evaluator': '/sql-practice',
  '/my-practiced-notes/editor': '/my-practiced-notes',
};

type NavigationLinkProps = {
  item: NavigationItem;
  onNavigate?: () => void;
  mobile?: boolean;
};

export function NavigationLink({ item, onNavigate, mobile = false }: NavigationLinkProps) {
  const pathname = usePathname();
  const { colors } = useAppTheme();
  const selectedMainPath = mainSectionByPath[pathname] ?? pathname;
  const isActive = item.href === '/' ? selectedMainPath === '/' : selectedMainPath === item.href;

  return (
    <Link href={item.href as any} asChild>
      <Pressable
        accessibilityLabel={item.label}
        accessibilityRole="link"
        accessibilityState={{ selected: isActive }}
        onPress={onNavigate}
        style={({ pressed }) => [
          viewStyles.link,
          mobile ? viewStyles.mobileLink : undefined,
          isActive && { backgroundColor: colors.sidebarActive },
          pressed && viewStyles.pressed,
        ]}>
          <View style={[viewStyles.contentRow, mobile ? viewStyles.mobileContentRow : undefined]}>
            <SymbolView
              name={icons[item.icon]}
              size={mobile ? 25 : 19}
              tintColor={isActive ? colors.white : colors.sidebarText}
              style={[viewStyles.icon, mobile ? viewStyles.mobileIcon : undefined]}
            />
            <Text
              style={[
                textStyles.label,
                mobile ? textStyles.mobileLabel : undefined,
                { color: isActive ? colors.white : colors.sidebarText },
                isActive && textStyles.activeLabel,
              ]}
              numberOfLines={1}>
              {item.label}
            </Text>
          </View>
          {isActive ? <View style={[viewStyles.activeIndicator, { backgroundColor: colors.accent }]} /> : null}
        </Pressable>
    </Link>
  );
}

const viewStyles = StyleSheet.create({
  link: {
    width: '100%',
    minWidth: 0,
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
    flexShrink: 0,
  },
  contentRow: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  mobileLink: {
    minHeight: 56,
    paddingHorizontal: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  mobileContentRow: {
    gap: 16,
  },
  mobileIcon: {
    width: 28,
    height: 28,
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

const textStyles = StyleSheet.create({
  label: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  mobileLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  activeLabel: {
    fontWeight: '700',
  },
});
