import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/primitives';
import { useAppTheme } from '@/contexts/theme-context';
import { sqlLearningCategories } from '@/data/sqlLearningContent';
import {
  getLearningPathOptions,
  selectLearningPathCategory,
  selectLearningPathSubtopic,
} from '@/lib/learning-path-selection';

export default function MyPracticedNotesSelectionScreen() {
  const { colors } = useAppTheme();
  const [openSelector, setOpenSelector] = useState<'Category' | 'Topic' | 'Subtopic' | null>(null);
  const [selection, setSelection] = useState({
    categoryId: '',
    topicId: '',
    subtopicId: '',
  });

  const { category, topic, subtopics } = getLearningPathOptions(sqlLearningCategories, selection);
  const categoryOptions = sqlLearningCategories.map((item) => ({ label: item.title, value: item.id }));
  const topicOptions = (category?.topics ?? []).map((item) => ({ label: item.title, value: item.id }));
  const subtopicOptions = (topic?.subtopics ?? []).map((item) => ({ label: item.title, value: item.id }));
  const canOpen = Boolean(selection.categoryId && selection.topicId && selection.subtopicId);

  const selectCategory = (nextCategoryId: string) => {
    const next = selectLearningPathCategory(nextCategoryId);
    setSelection({
      categoryId: next.categoryId,
      topicId: '',
      subtopicId: '',
    });
  };

  const selectTopic = (nextTopicId: string) => {
    setSelection((current) => ({
      ...current,
      categoryId: current.categoryId,
      topicId: nextTopicId,
      subtopicId: '',
    }));
  };

  const onOpen = () => {
    if (!selection.categoryId || !selection.topicId || !selection.subtopicId) {
      return;
    }
    const next = selectLearningPathSubtopic(selection, selection.subtopicId);
    router.push({
      pathname: '/my-practiced-notes/editor' as any,
      params: {
        categoryId: next.categoryId,
        topicId: next.topicId,
        subtopicId: next.subtopicId,
      },
    });
  };

  return (
    <View style={styles.screen}>
      <PageHeader
        eyebrow="PERSONAL NOTEBOOK"
        title="My Practiced Notes"
        subtitle="Choose where you want to write and practice."
      />

      <Card style={styles.selectorCard}>
        <Text style={[styles.selectorTitle, { color: colors.primaryText }]}>Choose where you want to write and practice.</Text>
        <SelectField
          label="Category"
          value={category?.title ?? ''}
          options={categoryOptions}
          selectedValue={selection.categoryId}
          open={openSelector === 'Category'}
          colors={colors}
          onToggle={() => setOpenSelector((current) => (current === 'Category' ? null : 'Category'))}
          onClose={() => setOpenSelector(null)}
          onChange={selectCategory}
        />
        {category ? (
          <SelectField
            label="Topic"
            value={topic?.title ?? ''}
            options={topicOptions}
            selectedValue={selection.topicId}
            open={openSelector === 'Topic'}
            colors={colors}
            onToggle={() => setOpenSelector((current) => (current === 'Topic' ? null : 'Topic'))}
            onClose={() => setOpenSelector(null)}
            onChange={selectTopic}
          />
        ) : null}
        {topic ? (
          <SelectField
            label="Subtopic"
            value={subtopics.find((item) => item.id === selection.subtopicId)?.title ?? ''}
            options={subtopicOptions}
            selectedValue={selection.subtopicId}
            open={openSelector === 'Subtopic'}
            colors={colors}
            onToggle={() => setOpenSelector((current) => (current === 'Subtopic' ? null : 'Subtopic'))}
            onClose={() => setOpenSelector(null)}
            onChange={(nextSubtopicId) =>
              setSelection((current) => ({
                ...current,
                subtopicId: nextSubtopicId,
              }))
            }
          />
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open My Practiced Notes"
          disabled={!canOpen}
          onPress={onOpen}
          style={({ pressed }) => [
            styles.openButton,
            {
              backgroundColor: canOpen ? colors.primary : colors.surfaceMuted,
              borderColor: canOpen ? colors.primary : colors.border,
              opacity: canOpen ? 1 : 0.65,
            },
            pressed && canOpen && styles.pressed,
          ]}>
          <Text style={[styles.openButtonText, { color: canOpen ? colors.white : colors.secondaryText }]}>Open My Practiced Notes</Text>
        </Pressable>
      </Card>
    </View>
  );
}

function SelectField({
  label,
  value,
  options,
  selectedValue,
  open,
  colors,
  onToggle,
  onClose,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  selectedValue?: string;
  open: boolean;
  colors: ReturnType<typeof import('@/constants/theme').getThemeColors>;
  onToggle: () => void;
  onClose: () => void;
  onChange: (nextValue: string) => void;
}) {
  return (
    <View style={styles.selectorField}>
      <Text style={[styles.selectorLabel, { color: colors.primaryText }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || 'Select'} `}
        onPress={onToggle}
        style={({ pressed }) => [
          styles.selectorButton,
          { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
          pressed && styles.pressed,
        ]}>
        <Text style={[styles.selectorValue, { color: value ? colors.primaryText : colors.secondaryText }]}
          numberOfLines={1}>
          {value || `Select ${label}`}
        </Text>
        <Text style={[styles.selectorChevron, { color: colors.secondaryText }]}>{open ? '−' : '+'}</Text>
      </Pressable>
      {open ? (
        <View style={[styles.selectorOptions, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ScrollView nestedScrollEnabled style={styles.selectorScroll} contentContainerStyle={styles.selectorOptionsContent}>
            {options.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: option.value === selectedValue }}
                onPress={() => {
                  onChange(option.value);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.selectorOption,
                  {
                    backgroundColor: option.value === selectedValue ? colors.primarySoft : colors.surfaceMuted,
                    borderColor: option.value === selectedValue ? colors.primary : colors.border,
                  },
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.selectorOptionText, { color: option.value === selectedValue ? colors.primary : colors.primaryText }]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    width: '100%',
  },
  selectorCard: {
    gap: 12,
  },
  selectorTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  selectorField: {
    gap: 8,
  },
  selectorLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  selectorButton: {
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectorValue: {
    fontSize: 15,
    flex: 1,
    marginRight: 12,
  },
  selectorChevron: {
    fontSize: 22,
    fontWeight: '700',
  },
  selectorOptions: {
    borderWidth: 1,
    borderRadius: 14,
    maxHeight: 220,
    overflow: 'hidden',
  },
  selectorScroll: {
    maxHeight: 220,
  },
  selectorOptionsContent: {
    gap: 8,
    padding: 8,
  },
  selectorOption: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectorOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  openButton: {
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
});
