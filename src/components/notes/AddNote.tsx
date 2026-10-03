import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { MarkdownContent } from '@/components/topic-chat/MarkdownContent';
import { Badge, Button, Card, SectionHeader } from '@/components/ui/primitives';
import { DesignTokens } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useAppTheme } from '@/contexts/theme-context';
import {
  createManualNotePayload,
  getCategoryOptions,
  getModuleOptions,
  getSubtopicOptions,
  getTopicOptions,
} from '@/lib/notes-utils';
import { createUserNote } from '@/lib/supabase-notes';

const defaultTitle = 'My note';

export function AddNote() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const [categoryId, setCategoryId] = useState('sql-foundations');
  const [moduleId, setModuleId] = useState('query-basics');
  const [topicId, setTopicId] = useState('query-structure');
  const [subtopicId, setSubtopicId] = useState('select-list');
  const [title, setTitle] = useState(defaultTitle);
  const [content, setContent] = useState('# SQL learning note\n\nUse this space for your own notes.\n\n```sql\nSELECT id, name\nFROM customers;\n```');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const categoryOptions = useMemo(() => getCategoryOptions(), []);
  const moduleOptions = useMemo(() => getModuleOptions(categoryId), [categoryId]);
  const topicOptions = useMemo(() => getTopicOptions(moduleId), [moduleId]);
  const subtopicOptions = useMemo(() => getSubtopicOptions(topicId), [topicId]);

  const handleCategoryChange = (nextCategoryId: string) => {
    const nextModuleId = getModuleOptions(nextCategoryId)[0]?.value ?? moduleId;
    setCategoryId(nextCategoryId);
    setModuleId(nextModuleId);
    const nextTopicId = getTopicOptions(nextModuleId)[0]?.value ?? topicId;
    setTopicId(nextTopicId);
    setSubtopicId(getSubtopicOptions(nextTopicId)[0]?.value ?? subtopicId);
  };

  const handleModuleChange = (nextModuleId: string) => {
    const nextTopicId = getTopicOptions(nextModuleId)[0]?.value ?? topicId;
    setModuleId(nextModuleId);
    setTopicId(nextTopicId);
    setSubtopicId(getSubtopicOptions(nextTopicId)[0]?.value ?? subtopicId);
  };

  const handleTopicChange = (nextTopicId: string) => {
    setTopicId(nextTopicId);
    setSubtopicId(getSubtopicOptions(nextTopicId)[0]?.value ?? '');
  };

  const handleSave = async () => {
    setStatus('saving');
    setErrorMessage('');
    try {
      if (!user) {
        throw new Error('Sign in to save a learning path note.');
      }
      const noteInput = createManualNotePayload({
        userId: user.id,
        categoryId,
        moduleId,
        topicId,
        subtopicId,
        title,
        content,
      });

      await createUserNote(noteInput);
      setStatus('saved');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save the note.');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SectionHeader title="Add Note" subtitle="Manual notes stay attached to the learning path." />
      <Card style={styles.formCard}>
        <View style={styles.selectorGrid}>
          <Selector label="Category" value={categoryId} options={categoryOptions} onChange={handleCategoryChange} />
          <Selector label="Module" value={moduleId} options={moduleOptions} onChange={handleModuleChange} />
          <Selector label="Topic" value={topicId} options={topicOptions} onChange={handleTopicChange} />
          <Selector label="Subtopic" value={subtopicId} options={subtopicOptions} onChange={setSubtopicId} />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.primaryText }]}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Add a descriptive note title"
            style={[styles.input, { color: colors.primaryText, borderColor: colors.border, backgroundColor: colors.elevatedSurface }]}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.primaryText }]}>Content</Text>
          <TextInput
            value={content}
            onChangeText={setContent}
            multiline
            style={[styles.textArea, { color: colors.primaryText, borderColor: colors.border, backgroundColor: colors.elevatedSurface }]}
          />
        </View>

        <View style={styles.statusRow}>
          <Badge tone={status === 'saved' ? 'green' : status === 'error' ? 'amber' : 'blue'}>
            {status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved' : status === 'error' ? 'Error' : 'Ready'}
          </Badge>
        </View>

        {errorMessage ? <Text style={[styles.errorText, { color: colors.danger }]}>{errorMessage}</Text> : null}

        <Button onPress={handleSave} disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving...' : 'Save note'}
        </Button>
      </Card>

      <Card style={styles.previewCard}>
        <SectionHeader title="Preview" subtitle="Markdown is supported for headings, lists, bold, inline code, and SQL blocks." />
        <MarkdownContent content={content || 'Type some content to preview it here.'} compactContent={false} />
      </Card>
    </ScrollView>
  );
}

function Selector({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (nextValue: string) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.selectorBlock}>
      <Text style={[styles.label, { color: colors.primaryText }]}>{label}</Text>
      <View style={styles.selectorRow}>
        {options.map((option) => (
          <Button
            key={option.value}
            variant={value === option.value ? 'primary' : 'secondary'}
            style={styles.selectorButton}
            onPress={() => onChange(option.value)}>
            {option.label}
          </Button>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingBottom: 32,
  },
  formCard: {
    gap: 18,
  },
  selectorGrid: {
    gap: 16,
  },
  selectorBlock: {
    gap: 8,
  },
  selectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectorButton: {
    minHeight: 38,
    paddingHorizontal: 10,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.small,
    paddingHorizontal: DesignTokens.spacing.regular,
    paddingVertical: DesignTokens.spacing.medium,
  },
  textArea: {
    minHeight: 160,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.small,
    paddingHorizontal: DesignTokens.spacing.regular,
    paddingVertical: DesignTokens.spacing.medium,
    textAlignVertical: 'top',
  },
  statusRow: {
    alignItems: 'flex-start',
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
  },
  previewCard: {
    gap: 12,
  },
});
