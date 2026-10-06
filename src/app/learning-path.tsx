import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/primitives';
import { DesignTokens } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useAppTheme } from '@/contexts/theme-context';
import { learningCategories } from '@/data/learningPath';
import {
  buildSubtopicProgressMap,
  getSubtopicProgressKey,
  getSubtopicProgressLabels,
} from '@/lib/learning-progress';
import {
  getLearningPathOptions,
  selectLearningPathCategory,
  selectLearningPathSubtopic,
  selectLearningPathTopic,
} from '@/lib/learning-path-selection';
import { supabase } from '@/lib/supabase';

export default function LearningPathScreen() {
  const { categoryId, topicId, subtopicId } = useLocalSearchParams<{
    categoryId?: string;
    topicId?: string;
    subtopicId?: string;
  }>();
  const { colors } = useAppTheme();
  const { user, loading: authLoading } = useAuth();
  const [openSelector, setOpenSelector] = useState<'Category' | 'Topic' | 'Subtopic' | null>(null);
  const [progressCounts, setProgressCounts] = useState<Record<string, number>>({});
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState('');
  const selection = {
    categoryId: categoryId ?? '',
    topicId: topicId ?? '',
    subtopicId: subtopicId ?? '',
  };
  const { category, topics, topic, subtopics, choices } = getLearningPathOptions(
    learningCategories,
    selection,
  );
  const categoryOptions = useMemo(
    () => learningCategories.map((item) => ({ label: item.title, value: item.id })),
    [],
  );
  const topicOptions = topics.map((item) => ({
    label: item.title,
    value: item.id,
  }));
  const subtopicOptions = subtopics.map((item) => ({
    label: item.title,
    value: item.id,
  }));
  const userId = user?.id;
  useFocusEffect(useCallback(() => {
    let active = true;
    const loadProgress = async () => {
      const progressCategoryId = categoryId ?? '';
      const progressTopicId = topicId ?? '';
      const progressContext = getLearningPathOptions(learningCategories, {
        categoryId: progressCategoryId,
        topicId: progressTopicId,
        subtopicId: '',
      });
      if (progressContext.choices.level !== 'subtopics') {
        return;
      }
      setProgressCounts({});
      setProgressError('');
      if (authLoading) {
        setProgressLoading(true);
        return;
      }
      if (!userId || !supabase) {
        setProgressLoading(false);
        setProgressError(userId
          ? 'Progress storage is not configured.'
          : 'Sign in to view your Subtopic learning progress.');
        return;
      }
      setProgressLoading(true);
      try {
        const { data, error } = await supabase
          .from('learning_subtopic_progress')
          .select('category_id,topic_id,subtopic_id,follow_up_count')
          .eq('user_id', userId)
          .eq('category_id', progressCategoryId)
          .eq('topic_id', progressTopicId)
          .in('subtopic_id', progressContext.subtopics.map((item) => item.id));
        if (error) {
          throw error;
        }
        if (active) {
          setProgressCounts(buildSubtopicProgressMap(userId, data ?? []));
        }
      } catch (error) {
        if (active) {
          setProgressCounts({});
          setProgressError(
            error instanceof Error && error.message
              ? error.message
              : 'Subtopic progress could not be loaded.',
          );
        }
      } finally {
        if (active) {
          setProgressLoading(false);
        }
      }
    };
    void loadProgress();
    return () => {
      active = false;
    };
  }, [
    authLoading,
    categoryId,
    topicId,
    userId,
  ]));

  const selectCategory = (nextCategoryId: string) => {
    const next = selectLearningPathCategory(nextCategoryId);
    router.replace({ pathname: '/learning-path', params: { categoryId: next.categoryId } });
  };

  const selectTopic = (nextTopicId: string) => {
    const next = selectLearningPathTopic(selection, nextTopicId);
    router.replace({
      pathname: '/learning-path',
      params: { categoryId: next.categoryId, topicId: next.topicId },
    });
  };

  const openSubtopic = (nextSubtopicId: string) => {
    if (category && topic?.subtopics.some((subtopic) => subtopic.id === nextSubtopicId)) {
      const next = selectLearningPathSubtopic(selection, nextSubtopicId);
      router.push({
        pathname: '/topic',
        params: {
          categoryId: next.categoryId,
          topicId: next.topicId,
          subtopicId: next.subtopicId,
        },
      });
    }
  };

  const returnToPath = () => {
    router.replace('/learning-path');
  };

  return (
    <View style={styles.screen}>
      {category ? (
        <View style={styles.breadcrumbs} accessibilityLabel="Learning path breadcrumb">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Learning Path"
            onPress={returnToPath}
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && styles.pressed,
            ]}>
            <SymbolView
              name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
              size={20}
              tintColor={colors.primaryText}
            />
          </Pressable>
          <Crumb label="Learning Path" onPress={returnToPath} colors={colors} />
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            size={13}
            tintColor={colors.mutedText}
          />
          <Crumb
            label={category.title}
            onPress={() =>
              router.push({
                pathname: '/learning-path',
                params: { categoryId: category.id },
              })
            }
            colors={colors}
          />
        </View>
      ) : null}

      <PageHeader
        eyebrow="STRUCTURED SQL CURRICULUM"
        title="Learning Path"
        subtitle="Choose a category, then a topic and subtopic to start learning with AI."
      />

      <Card style={styles.selectorCard}>
        <Text style={[styles.selectorTitle, { color: colors.primaryText }]}>
          Choose your learning path
        </Text>
        <LearningPathSelect
          label="Category"
          value={category?.title ?? ''}
          placeholder="Select Category"
          options={categoryOptions}
          selectedValue={category?.id}
          onChange={selectCategory}
          colors={colors}
          open={openSelector === 'Category'}
          onToggle={() =>
            setOpenSelector((current) => current === 'Category' ? null : 'Category')
          }
          onClose={() => setOpenSelector(null)}
        />
        {category ? (
          <LearningPathSelect
            label="Topic"
            value={topic?.title ?? ''}
            placeholder="Select Topic"
            options={topicOptions}
            selectedValue={topic?.id}
            onChange={selectTopic}
            colors={colors}
            open={openSelector === 'Topic'}
            onToggle={() =>
              setOpenSelector((current) => current === 'Topic' ? null : 'Topic')
            }
            onClose={() => setOpenSelector(null)}
          />
        ) : null}
        {topic ? (
          <LearningPathSelect
            label="Subtopic"
            value={subtopics.find((item) => item.id === selection.subtopicId)?.title ?? ''}
            placeholder="Select Subtopic"
            options={subtopicOptions}
            selectedValue={selection.subtopicId}
            onChange={openSubtopic}
            colors={colors}
            open={openSelector === 'Subtopic'}
            onToggle={() =>
              setOpenSelector((current) => current === 'Subtopic' ? null : 'Subtopic')
            }
            onClose={() => setOpenSelector(null)}
          />
        ) : null}
      </Card>

      {choices.items.length > 0 ? (
        <CurriculumChoices
          title={choices.level[0].toUpperCase() + choices.level.slice(1)}
          items={choices.items.map((item) => ({
            ...item,
            ...(choices.level === 'subtopics' && user
              ? {
                  followUpCount: progressCounts[getSubtopicProgressKey({
                    userId: user.id,
                    categoryId: category?.id ?? '',
                    topicId: topic?.id ?? '',
                    subtopicId: item.id,
                  })] ?? 0,
                }
              : {}),
          }))}
          colors={colors}
          progressLoading={choices.level === 'subtopics' && (progressLoading || authLoading)}
          progressError={choices.level === 'subtopics' ? progressError : ''}
          onSelect={
            choices.level === 'categories'
              ? selectCategory
              : choices.level === 'topics'
                ? selectTopic
                : openSubtopic
          }
        />
      ) : null}
    </View>
  );
}

function CurriculumChoices({
  title,
  items,
  colors,
  progressLoading = false,
  progressError = '',
  onSelect,
}: {
  title: string;
  items: { id: string; title: string; description: string; followUpCount?: number }[];
  colors: ReturnType<typeof import('@/constants/theme').getThemeColors>;
  progressLoading?: boolean;
  progressError?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={styles.choicesSection}>
      <Text style={[styles.choicesTitle, { color: colors.primaryText }]}>{title}</Text>
      {progressError ? (
        <Text accessibilityRole="alert" style={[styles.progressError, { color: colors.danger }]}>
          {progressError}
        </Text>
      ) : null}
      <View style={styles.choicesList}>
        {items.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}. ${item.description}`}
            onPress={() => onSelect(item.id)}
            style={({ pressed }) => [
              styles.choiceCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && styles.pressed,
            ]}>
            <View style={styles.choiceContent}>
              <Text style={[styles.choiceTitle, { color: colors.primaryText }]}>
                {item.title}
              </Text>
              {item.description ? (
                <Text style={[styles.choiceDescription, { color: colors.secondaryText }]}>
                  {item.description}
                </Text>
              ) : null}
            </View>
            {title === 'Subtopics' ? (
              <View
                accessibilityLabel={
                  progressError
                    ? 'Progress unavailable'
                    : progressLoading
                      ? 'Loading progress'
                      : item.followUpCount
                        ? `Progress, ${getSubtopicProgressLabels(item.followUpCount).count}`
                        : 'Not yet started'
                }
                style={[
                  styles.progressStatus,
                  {
                    backgroundColor: item.followUpCount
                      ? colors.primarySoft
                      : colors.surfaceMuted,
                  },
                ]}>
                <Text
                  style={[
                    styles.progressStatusTitle,
                    { color: item.followUpCount ? colors.primary : colors.secondaryText },
                  ]}>
                  {progressError
                    ? 'UNAVAILABLE'
                    : progressLoading
                      ? 'LOADING'
                      : getSubtopicProgressLabels(item.followUpCount).status}
                </Text>
                {!progressLoading && !progressError && item.followUpCount ? (
                  <Text style={[styles.progressCount, { color: colors.primary }]}>
                    {getSubtopicProgressLabels(item.followUpCount).count}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function LearningPathSelect({
  label,
  value,
  placeholder,
  options,
  selectedValue,
  onChange,
  colors,
  open,
  onToggle,
  onClose,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: { label: string; value: string }[];
  selectedValue?: string;
  onChange: (value: string) => void;
  colors: ReturnType<typeof import('@/constants/theme').getThemeColors>;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.selectorField}>
      <Text style={[styles.selectorLabel, { color: colors.primaryText }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || placeholder}. Choose ${label}`}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={({ pressed }) => [
          styles.selectorButton,
          { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
          pressed && styles.pressed,
        ]}>
        <Text style={[styles.selectorValue, { color: value ? colors.primaryText : colors.secondaryText }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Text style={[styles.selectorChevron, { color: colors.secondaryText }]}>{open ? '−' : '+'}</Text>
      </Pressable>
      {open ? (
        <View style={[styles.selectorOptions, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ScrollView nestedScrollEnabled contentContainerStyle={styles.selectorOptionsContent} style={styles.selectorOptionsScroll}>
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
                <Text
                  style={[
                    styles.selectorOptionText,
                    { color: option.value === selectedValue ? colors.primary : colors.primaryText },
                  ]}>
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

function Crumb({
  label,
  onPress,
  colors,
}: {
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof import('@/constants/theme').getThemeColors>;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={6}>
      <Text style={[styles.crumb, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    width: '100%',
  },
  breadcrumbs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  backButton: {
    width: 42,
    height: 42,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crumb: {
    fontSize: 12,
    fontWeight: '700',
  },
  selectorCard: {
    gap: 12,
    marginBottom: 20,
  },
  choicesSection: {
    gap: 10,
    marginBottom: 24,
  },
  choicesTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  choicesList: {
    gap: 10,
  },
  choiceCard: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 12,
    rowGap: 10,
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.medium,
    ...DesignTokens.elevation.card,
  },
  choiceContent: {
    flexGrow: 1,
    flexBasis: 220,
    gap: 6,
  },
  choiceTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  choiceDescription: {
    fontSize: 13,
    lineHeight: 19,
  },
  progressStatus: {
    minWidth: 132,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: DesignTokens.radius.small,
    alignItems: 'flex-start',
  },
  progressStatusTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.25,
  },
  progressCount: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: '800',
  },
  progressError: {
    fontSize: 12,
    lineHeight: 18,
  },
  selectorTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  selectorField: {
    gap: 6,
  },
  selectorLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  selectorButton: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.small,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  selectorValue: {
    flex: 1,
    fontSize: 14,
  },
  selectorChevron: {
    fontSize: 17,
    fontWeight: '800',
  },
  selectorOptions: {
    maxHeight: 220,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.small,
    overflow: 'hidden',
    ...DesignTokens.elevation.card,
  },
  selectorOptionsScroll: {
    maxHeight: 220,
  },
  selectorOptionsContent: {
    padding: 8,
    gap: 8,
  },
  selectorOption: {
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.small,
  },
  selectorOptionText: {
    fontSize: 14,
  },
  pressed: {
    opacity: 0.76,
  },
});
