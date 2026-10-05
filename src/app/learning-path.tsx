import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { PageHeader } from '@/components/PageHeader';
import { Badge, Card } from '@/components/ui/primitives';
import { DesignTokens } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';
import { learningCategories } from '@/data/learningPath';

export default function LearningPathScreen() {
  const { width } = useWindowDimensions();
  const { categoryId } = useLocalSearchParams<{
    categoryId?: string;
  }>();
  const { colors } = useAppTheme();
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const overview = learningCategories.map((item) => ({
    category: item,
    topicCount: item.topics.length,
  }));
  const category = learningCategories.find((item) => item.id === categoryId) ?? null;
  const isCategoryView = Boolean(category);
  const isNarrow = width < 360;
  const pickerCategory =
    learningCategories.find((item) => item.id === (category?.id ?? selectedCategoryId)) ?? null;
  const categoryOptions = useMemo(
    () => learningCategories.map((item) => ({ label: item.title, value: item.id })),
    [],
  );
  const topicOptions = (pickerCategory?.topics ?? []).map((topic) => ({
    label: topic.title,
    value: topic.id,
  }));
  const pickerTopic =
    pickerCategory?.topics.find((topic) => topic.id === selectedTopicId) ?? null;
  const subtopicOptions = (pickerTopic?.subtopics ?? []).map((subtopic) => ({
    label: subtopic.title,
    value: subtopic.id,
  }));

  const selectCategory = (nextCategoryId: string) => {
    setSelectedCategoryId(nextCategoryId);
    setSelectedTopicId('');
    router.replace({ pathname: '/learning-path', params: { categoryId: nextCategoryId } });
  };

  const selectTopic = (nextTopicId: string) => {
    setSelectedTopicId(nextTopicId);
  };

  const openTopic = (topicId: string) => {
    if (pickerCategory) {
      router.push({
        pathname: '/topic',
        params: { topicId, categoryId: pickerCategory.id },
      });
    }
  };

  const openSubtopic = (subtopicId: string) => {
    if (pickerCategory && pickerTopic?.subtopics.some((subtopic) => subtopic.id === subtopicId)) {
      router.push({
        pathname: '/topic',
        params: {
          categoryId: pickerCategory.id,
          topicId: pickerTopic.id,
          subtopicId,
        },
      });
    }
  };

  const returnToPath = () => {
    router.replace('/learning-path');
  };

  return (
    <View style={styles.screen}>
      {isCategoryView ? (
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
          {category ? (
            <>
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
            </>
          ) : null}
        </View>
      ) : null}

      <PageHeader
        eyebrow="STRUCTURED SQL CURRICULUM"
        title={category?.title ?? 'Learning Path'}
        subtitle={category?.description ?? 'Choose a category, then a topic and its subtopics.'}
      />

      <Card style={styles.selectorCard}>
        <Text style={[styles.selectorTitle, { color: colors.primaryText }]}>Choose a learning topic</Text>
        <LearningPathSelect
          label="Category"
          value={pickerCategory?.title ?? ''}
          placeholder="Select a category"
          options={categoryOptions}
          selectedValue={pickerCategory?.id}
          onChange={selectCategory}
          colors={colors}
        />
        <LearningPathSelect
          label="Topic"
          value={pickerTopic?.title ?? ''}
          placeholder={pickerCategory ? 'Select a topic' : 'Select a category first'}
          options={topicOptions}
          selectedValue={selectedTopicId}
          onChange={selectTopic}
          colors={colors}
          disabled={!pickerCategory}
        />
        <LearningPathSelect
          label="Subtopic"
          value=""
          placeholder={pickerTopic ? 'Select a subtopic' : 'Select a topic first'}
          options={subtopicOptions}
          onChange={openSubtopic}
          colors={colors}
          disabled={!pickerTopic}
        />
      </Card>

      {!category ? (
        <View style={styles.content}>
          <View style={[styles.introCard, { backgroundColor: colors.sidebarBackground }]}>
            <View style={styles.introCopy}>
              <Badge tone="cyan">YOUR SQL JOURNEY</Badge>
              <Text style={[styles.introTitle, { color: colors.white }]}>
                Learn concepts in a clear sequence.
              </Text>
              <Text style={[styles.introDescription, { color: colors.sidebarText }]}>
                Start by selecting and filtering query results, then learn to summarize data.
              </Text>
            </View>
            <View style={[styles.pathIcon, { backgroundColor: colors.primarySoft }]}>
              <SymbolView
                name={{ ios: 'map.fill', android: 'map', web: 'map' }}
                size={26}
                tintColor={colors.primary}
              />
            </View>
          </View>
          <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>Learning categories</Text>
          <View style={styles.grid}>
            {overview.map(({ category: item, topicCount }, index) => (
              <Card
                key={item.id}
                style={[styles.listCard, isNarrow && styles.singleColumnCard]}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => selectCategory(item.id)}
                  style={({ pressed }) => [styles.cardPressable, pressed && styles.pressed]}>
                  <View style={styles.cardTop}>
                    <View
                      style={[
                        styles.iconBadge,
                        { backgroundColor: item.accent === 'cyan' ? colors.accentSoft : colors.primarySoft },
                      ]}>
                      <SymbolView
                        name={
                          index === 0
                            ? { ios: 'square.stack.3d.up.fill', android: 'layers', web: 'layers' }
                            : { ios: 'arrow.triangle.branch', android: 'schema', web: 'schema' }
                        }
                        size={21}
                        tintColor={item.accent === 'cyan' ? colors.accent : colors.primary}
                      />
                    </View>
                    <SymbolView
                      name={{ ios: 'arrow.up.right', android: 'north_east', web: 'north_east' }}
                      size={17}
                      tintColor={colors.mutedText}
                    />
                  </View>
                  <Text style={[styles.cardTitle, { color: colors.primaryText }]}>{item.title}</Text>
                  <Text style={[styles.cardDescription, { color: colors.secondaryText }]}>
                    {item.description}
                  </Text>
                  <View style={styles.cardMeta}>
                    <Badge tone={item.accent === 'cyan' ? 'cyan' : 'blue'}>
                      {`${topicCount} topics`}
                    </Badge>
                  </View>
                </Pressable>
              </Card>
            ))}
          </View>
          <Card style={styles.calloutCard}>
            <Text style={[styles.cardTitle, { color: colors.primaryText }]}>
              A steady path, one topic at a time
            </Text>
            <Text style={[styles.cardDescription, { color: colors.secondaryText }]}>
              Begin with any category and read each topic at your own pace.
            </Text>
          </Card>
        </View>
      ) : isCategoryView ? (
        <View style={styles.grid}>
          {category.topics.map((item, index) => (
            <Card
              key={item.id}
              style={[styles.listCard, isNarrow && styles.singleColumnCard]}>
              <Pressable
                accessibilityRole="button"
                onPress={() => openTopic(item.id)}
                style={({ pressed }) => [styles.cardPressable, pressed && styles.pressed]}>
                <View style={styles.cardTop}>
                  <View style={[styles.numberBadge, { backgroundColor: colors.primarySoft }]}>
                    <Text style={[styles.numberText, { color: colors.primary }]}>
                      {String(index + 1).padStart(2, '0')}
                    </Text>
                  </View>
                  <Text style={[styles.metaText, { color: colors.mutedText }]}>
                    {`${item.subtopics.length} subtopics`}
                  </Text>
                </View>
                <Text style={[styles.cardTitle, { color: colors.primaryText }]}>{item.title}</Text>
                <Text style={[styles.cardDescription, { color: colors.secondaryText }]}>
                  {item.summary}
                </Text>
                <Text style={[styles.actionText, { color: colors.primary }]}>Explore topic →</Text>
                <View style={styles.cardMeta}>
                  <Badge tone="blue">{`${item.subtopics.length} subtopics`}</Badge>
                </View>
              </Pressable>
            </Card>
          ))}
        </View>
      ) : (
        <Card>
          <Text style={[styles.cardTitle, { color: colors.primaryText }]}>
            This learning section is unavailable.
          </Text>
          <Pressable onPress={returnToPath} accessibilityRole="button">
            <Text style={[styles.actionText, { color: colors.primary }]}>Return to Learning Path</Text>
          </Pressable>
        </Card>
      )}
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
  disabled = false,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: { label: string; value: string }[];
  selectedValue?: string;
  onChange: (value: string) => void;
  colors: ReturnType<typeof import('@/constants/theme').getThemeColors>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.selectorField}>
      <Text style={[styles.selectorLabel, { color: colors.primaryText }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || placeholder}. Choose ${label}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen((current) => !current)}
        style={({ pressed }) => [
          styles.selectorButton,
          { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
          disabled && styles.selectorDisabled,
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
                  setOpen(false);
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
  currentCrumb: {
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    gap: 24,
  },
  selectorCard: {
    gap: 12,
    marginBottom: 20,
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
  selectorDisabled: {
    opacity: 0.6,
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
  introCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
    padding: 24,
    borderRadius: DesignTokens.radius.large,
  },
  introCopy: {
    flex: 1,
    gap: 10,
  },
  introTitle: {
    maxWidth: 560,
    fontSize: 22,
    lineHeight: 29,
    fontWeight: '800',
  },
  introDescription: {
    maxWidth: 620,
    fontSize: 13,
    lineHeight: 20,
  },
  pathIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: -10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  listCard: {
    flexGrow: 1,
    flexBasis: 300,
    maxWidth: 620,
    padding: 0,
    overflow: 'hidden',
  },
  singleColumnCard: {
    flexBasis: '100%',
    maxWidth: '100%',
  },
  cardPressable: {
    minHeight: 190,
    padding: 22,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberBadge: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    fontSize: 13,
    fontWeight: '800',
  },
  cardTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
  },
  cardDescription: {
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 17,
  },
  metaText: {
    fontSize: 11,
    fontWeight: '600',
  },
  calloutCard: {
    gap: 8,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 16,
  },
  topicList: {
    gap: 12,
  },
  topicCard: {
    padding: 0,
    overflow: 'hidden',
  },
  topicPressable: {
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
  },
  topicCopy: {
    flex: 1,
    minWidth: 0,
  },
  topicMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 12,
  },
  deleteAction: {
    alignSelf: 'flex-start',
    paddingHorizontal: 22,
    paddingBottom: 16,
  },
  deleteText: {
    fontSize: 12,
    fontWeight: '700',
  },
  deleteConfirmation: {
    gap: 10,
    marginTop: 12,
  },
  deleteButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  deleteCancel: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  deleteConfirm: {
    minWidth: 88,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: DesignTokens.radius.small,
    paddingHorizontal: 14,
  },
  deleteConfirmText: {
    fontSize: 13,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.76,
  },
});
