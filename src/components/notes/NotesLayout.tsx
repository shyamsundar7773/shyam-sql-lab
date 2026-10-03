import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AddNote } from '@/components/notes/AddNote';
import { BrowseNotes } from '@/components/notes/BrowseNotes';
import { BulkImport } from '@/components/notes/BulkImport';
import { DesignTokens } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';

export type NotesTab = 'browse' | 'add' | 'bulk';

export function NotesLayout({ initialTab = 'browse' }: { initialTab?: NotesTab }) {
  const { colors } = useAppTheme();
  const [activeTab, setActiveTab] = useState<NotesTab>(initialTab);

  return (
    <View style={styles.screen}>
      <View style={[styles.tabBar, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
        {[
          { key: 'browse', label: 'Browse Notes' },
          { key: 'add', label: 'Add Note' },
          { key: 'bulk', label: 'Bulk Import' },
        ].map((tab) => (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab.key }}
            onPress={() => setActiveTab(tab.key as NotesTab)}
            style={[
              styles.tab,
              activeTab === tab.key && { backgroundColor: colors.surface },
            ]}>
            <Text style={[styles.tabText, { color: colors.primaryText }]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === 'browse' ? <BrowseNotes /> : activeTab === 'add' ? <AddNote /> : <BulkImport />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minWidth: 0,
    gap: 16,
  },
  tabBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.medium,
    padding: 5,
  },
  tab: {
    flex: 1,
    minWidth: 120,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: DesignTokens.radius.small,
    paddingHorizontal: 10,
  },
  tabText: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
  },
});
