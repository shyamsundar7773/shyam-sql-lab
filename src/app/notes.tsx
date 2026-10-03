import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { SqlPracticedNotes } from '@/components/sql-practice/SqlPracticedNotes';
import { DesignTokens } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';

export default function NotesScreen() {
  const { colors } = useAppTheme();
  const [section, setSection] = useState<'learning' | 'practiced'>('learning');
  return (
    <View style={styles.screen}>
      <View style={[styles.tabs, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: section === 'learning' }}
          onPress={() => setSection('learning')}
          style={[
            styles.tab,
            section === 'learning' && { backgroundColor: colors.surface },
          ]}>
          <Text style={[styles.tabText, { color: colors.primaryText }]}>Learning Path Notes</Text>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: section === 'practiced' }}
          onPress={() => setSection('practiced')}
          style={[
            styles.tab,
            section === 'practiced' && { backgroundColor: colors.surface },
          ]}>
          <Text style={[styles.tabText, { color: colors.primaryText }]}>SQL Practiced Notes</Text>
        </Pressable>
      </View>
      {section === 'learning' ? (
        <PlaceholderScreen
          title="Learning Path Notes"
          description="Your structured SQL notes will appear here."
          icon={{ ios: 'note.text', android: 'description', web: 'description' }}
        />
      ) : (
        <SqlPracticedNotes />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minWidth: 0,
    gap: 16,
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.medium,
    padding: 5,
  },
  tab: {
    flex: 1,
    minWidth: 150,
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
