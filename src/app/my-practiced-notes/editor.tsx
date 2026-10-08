import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MyPracticedNotesWorkspace } from '@/components/my-practiced-notes/MyPracticedNotesWorkspace';
import { useAppTheme } from '@/contexts/theme-context';
import { resolveMyPracticedNotesSelection } from '@/lib/my-practiced-notes';

function normalizeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default function MyPracticedNotesEditorRoute() {
  const { colors } = useAppTheme();
  const params = useLocalSearchParams<{ categoryId?: string; topicId?: string; subtopicId?: string }>();
  const selection = resolveMyPracticedNotesSelection({
    categoryId: normalizeParam(params.categoryId),
    topicId: normalizeParam(params.topicId),
    subtopicId: normalizeParam(params.subtopicId),
  });

  if (!selection) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.primaryText }]}>My Practiced Notes</Text>
          <Text style={[styles.message, { color: colors.secondaryText }]}>
            This note location is invalid or no longer available. Please choose a valid category, topic, and subtopic.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose a valid My Practiced Notes path"
            onPress={() => router.replace('/my-practiced-notes' as any)}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.primary, borderColor: colors.primary },
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.buttonText, { color: colors.white }]}>Choose a different note</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <MyPracticedNotesWorkspace
      categoryId={selection.categoryId}
      topicId={selection.topicId}
      subtopicId={selection.subtopicId}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
});
