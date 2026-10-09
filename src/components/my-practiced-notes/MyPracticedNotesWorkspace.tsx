import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { router } from 'expo-router';

import { MarkdownContent } from '@/components/topic-chat/MarkdownContent';
import { askPracticeEvaluator, runPracticeSql } from '@/lib/api';
import {
  buildPracticeQuestionContext,
  createBlankMyPracticedNote,
  getDisplayNoteTitle,
  loadMyPracticedNotes,
  resolveMyPracticedNotesSelection,
  saveMyPracticedNotes,
  type MyPracticedNote,
  type MyPracticedNoteSqlBlock,
} from '@/lib/my-practiced-notes';
import { useAuth } from '@/contexts/auth-context';
import { useAppTheme } from '@/contexts/theme-context';
import { sqlLearningCategories } from '@/data/sqlLearningContent';
import type { PracticeEvaluatorExecution } from '@/lib/sql-practice-notes';
import type { SqlPracticeExecutionResult } from '@/types/sql-practice';

const storageDebounceMs = 450;

export function MyPracticedNotesWorkspace({
  categoryId,
  topicId,
  subtopicId,
}: {
  categoryId: string;
  topicId: string;
  subtopicId: string;
}) {
  const { colors } = useAppTheme();
  const { session } = useAuth();
  const [notes, setNotes] = useState<MyPracticedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectionMap, setSelectionMap] = useState<Record<string, { start: number; end: number }>>({});
  const [inputHeights, setInputHeights] = useState<Record<string, number>>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validSelection = useMemo(
    () => resolveMyPracticedNotesSelection({ categoryId, topicId, subtopicId }),
    [categoryId, topicId, subtopicId],
  );

  const category = useMemo(
    () => (validSelection ? sqlLearningCategories.find((item) => item.id === validSelection.categoryId) ?? null : null),
    [validSelection],
  );
  const topic = useMemo(
    () => (validSelection ? category?.topics.find((item) => item.id === validSelection.topicId) ?? null : null),
    [category, validSelection],
  );
  const subtopic = useMemo(
    () => (validSelection ? topic?.subtopics.find((item) => item.id === validSelection.subtopicId) ?? null : null),
    [topic, validSelection],
  );

  useEffect(() => {
    if (!validSelection) {
      return;
    }

    let active = true;
    void (async () => {
      const nextNotes = await loadMyPracticedNotes(
        validSelection.categoryId,
        validSelection.topicId,
        validSelection.subtopicId,
      );
      if (!active) {
        return;
      }
      setNotes(nextNotes);
      setActiveNoteId(nextNotes[0]?.id ?? null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [validSelection]);

  useEffect(() => {
    if (!validSelection || loading) {
      return;
    }
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      setSaving(true);
      void saveMyPracticedNotes(
        validSelection.categoryId,
        validSelection.topicId,
        validSelection.subtopicId,
        notes,
      ).finally(() => {
        setSaving(false);
      });
    }, storageDebounceMs);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [loading, notes, validSelection]);

  const updateNote = (noteId: string, updater: (note: MyPracticedNote) => MyPracticedNote) => {
    setNotes((current) =>
      current.map((note) => (note.id === noteId ? updater(note) : note)),
    );
  };

  const createNote = () => {
    if (!validSelection) {
      return;
    }
    const nextNote = createBlankMyPracticedNote(
      validSelection.categoryId,
      validSelection.topicId,
      validSelection.subtopicId,
    );
    setNotes((current) => [nextNote, ...current]);
    setActiveNoteId(nextNote.id);
    setOpenMenuId(null);
  };

  const confirmAndDeleteNote = (noteId: string) => {
    setNotes((current) => current.filter((note) => note.id !== noteId));
    if (activeNoteId === noteId) {
      setActiveNoteId(null);
    }
    setOpenMenuId(null);
  };

  const deleteNote = (noteId: string) => {
    const title = 'Delete note';
    const message = 'This will remove the full note and its SQL blocks. Continue?';
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (window.confirm(`${title}\n\n${message}`)) {
        confirmAndDeleteNote(noteId);
      }
      return;
    }

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => confirmAndDeleteNote(noteId),
      },
    ]);
  };

  const copyNote = async (note: MyPracticedNote) => {
    const text = [
      note.title,
      note.content,
      ...note.sqlBlocks.map((block) => `SQL:\n${block.sql}\n${block.output ? JSON.stringify(block.output, null, 2) : ''}`),
    ]
      .filter(Boolean)
      .join('\n\n');

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
    setOpenMenuId(null);
  };

  const insertNoteFormatting = (
    noteId: string,
    kind: 'bold' | 'italic' | 'underline' | 'strike' | 'bullet' | 'numbered' | 'heading' | 'link',
  ) => {
    updateNote(noteId, (note) => {
      const selection = selectionMap[note.id] ?? { start: note.content.length, end: note.content.length };
      const before = note.content.slice(0, selection.start);
      const selected = note.content.slice(selection.start, selection.end) || 'text';
      const after = note.content.slice(selection.end);
      let formattedText = selected;
      let insertion = '';

      switch (kind) {
        case 'bold':
          formattedText = `**${selected}**`;
          break;
        case 'italic':
          formattedText = `*${selected}*`;
          break;
        case 'underline':
          formattedText = `<u>${selected}</u>`;
          break;
        case 'strike':
          formattedText = `~~${selected}~~`;
          break;
        case 'bullet':
          insertion = '\n- ';
          formattedText = selected || 'bullet point';
          break;
        case 'numbered':
          insertion = '\n1. ';
          formattedText = selected || 'list item';
          break;
        case 'heading':
          formattedText = `\n## ${selected || 'Heading'}\n`;
          break;
        case 'link':
          formattedText = `[${selected || 'link text'}](https://example.com)`;
          break;
        default:
          break;
      }

      return {
        ...note,
        content: `${before}${insertion}${formattedText}${after}`,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const insertSqlBlock = (noteId: string) => {
    updateNote(noteId, (note) => {
      const nextBlock: MyPracticedNoteSqlBlock = {
        id: `sql-block-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        question: '',
        sql: 'SELECT *\nFROM employees;',
        attemptId: null,
        status: 'idle',
        output: null,
        evaluation: null,
        followUpText: '',
      };
      return {
        ...note,
        sqlBlocks: [...note.sqlBlocks, nextBlock],
        updatedAt: new Date().toISOString(),
      };
    });
    setOpenMenuId(null);
  };

  const handleSelectionChange = (noteId: string, event: { start: number; end: number }) => {
    setSelectionMap((current) => ({
      ...current,
      [noteId]: event,
    }));
  };

  const updateInputHeight = (inputId: string, minHeight: number, contentHeight: number) => {
    const height = Math.max(minHeight, Math.ceil(contentHeight));
    setInputHeights((current) =>
      current[inputId] === height ? current : { ...current, [inputId]: height },
    );
  };

  const runSqlBlock = async (noteId: string, blockId: string) => {
    const targetNote = notes.find((note) => note.id === noteId);
    const targetBlock = targetNote?.sqlBlocks.find((block) => block.id === blockId);
    if (!targetNote || !targetBlock || !session?.access_token) {
      return;
    }

    const attemptId = `${noteId}:${blockId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    updateNote(noteId, (note) => ({
      ...note,
      sqlBlocks: note.sqlBlocks.map((block) =>
        block.id === blockId
          ? { ...block, attemptId, status: 'running', output: null, evaluation: null }
          : block,
      ),
    }));

    const blockSql = targetBlock.sql;

    try {
      const payload = buildPracticeQuestionContext(targetNote, targetBlock.question);
      const result = await runPracticeSql(
        session.access_token,
        payload,
        blockSql,
      );

      const context = {
        category: category?.title ?? targetNote.categoryId,
        topic: topic?.title ?? targetNote.topicId,
        subtopic: subtopic?.title ?? targetNote.subtopicId,
        categoryId: targetNote.categoryId,
        topicId: targetNote.topicId,
        subtopicId: targetNote.subtopicId,
      };

      const evaluationMessage = targetBlock.question.trim()
        ? `Evaluate whether this SQL satisfies the requirement: ${targetBlock.question}`
        : 'Evaluate this SQL query against the requirement and execution result.';

      const execution = {
        status: result.ok ? 'succeeded' : 'failed',
        sql: blockSql,
        result,
        attemptId,
      } satisfies PracticeEvaluatorExecution;

      let evaluation: string | null = null;
      if (result.errorType !== 'policy') {
        try {
          evaluation = await askPracticeEvaluator({
            accessToken: session.access_token,
            context,
            question: payload,
            draftSql: blockSql,
            execution,
            history: [],
            message: evaluationMessage,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Gemini evaluation failed.';
          evaluation = `Gemini evaluation unavailable: ${message}`;
        }
      }

      updateNote(noteId, (note) => ({
        ...note,
        sqlBlocks: note.sqlBlocks.map((block) =>
          block.id === blockId
            ? { ...block, attemptId, status: result.ok ? 'success' : 'error', output: result, evaluation }
            : block,
        ),
        updatedAt: new Date().toISOString(),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SQL execution failed';
      updateNote(noteId, (note) => ({
        ...note,
        sqlBlocks: note.sqlBlocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                attemptId,
                status: 'error',
                output: {
                  ok: false,
                  columns: [],
                  rows: [],
                  error: message,
                },
                evaluation: message,
              }
            : block,
        ),
        updatedAt: new Date().toISOString(),
      }));
    }
  };

  const renderOutput = (output: SqlPracticeExecutionResult | null) => {
    if (!output) {
      return null;
    }
    if (output.error) {
      const isPolicyRejection = output.errorType === 'policy';
      return (
        <View style={[styles.outputCard, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
          <Text style={[styles.outputHeader, { color: colors.primaryText }]}>OUTPUT</Text>
          <Text style={[styles.errorText, { color: colors.danger }]}>
            {isPolicyRejection ? '⚠ Practice query rejected' : '✕ SQL execution failed'}
          </Text>
          <Text style={[styles.outputText, { color: colors.primaryText }]}>{output.error}</Text>
        </View>
      );
    }
    if (!output.ok) {
      return (
        <View style={[styles.outputCard, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
          <Text style={[styles.outputHeader, { color: colors.primaryText }]}>OUTPUT</Text>
          <Text style={[styles.errorText, { color: colors.danger }]}>✕ SQL execution failed</Text>
          <Text style={[styles.outputText, { color: colors.primaryText }]}>The query did not return valid results.</Text>
        </View>
      );
    }
    return (
      <View style={[styles.outputCard, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
        <Text style={[styles.outputHeader, { color: colors.primaryText }]}>OUTPUT</Text>
        {output.rowsAffected !== undefined ? (
          <Text style={[styles.outputText, { color: colors.primaryText }]}>
            {output.rowsAffected} row(s) affected
          </Text>
        ) : null}
        <ScrollView horizontal style={styles.outputTableWrap} contentContainerStyle={styles.outputTableContent}>
          <View style={styles.outputTable}>
            {output.columns.length > 0 ? (
              <View style={styles.outputRow}>
                {output.columns.map((column) => (
                  <Text key={column} style={[styles.outputCellHeader, { color: colors.primaryText }]}>{column}</Text>
                ))}
              </View>
            ) : null}
            {output.rows.map((row, rowIndex) => (
              <View key={`${rowIndex}-row`} style={styles.outputRow}>
                {output.columns.map((column) => (
                  <Text key={`${rowIndex}-${column}`} style={[styles.outputCell, { color: colors.primaryText }]}>
                    {row[column] == null ? 'NULL' : String(row[column])}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
        <Text style={[styles.successText, { color: colors.success }]}>✓ Query executed successfully</Text>
      </View>
    );
  };

  if (!validSelection) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <Text style={[styles.loadingText, { color: colors.primaryText }]}>This note context is no longer valid.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Return to My Practiced Notes selection"
          onPress={() => router.replace('/my-practiced-notes' as any)}
          style={({ pressed }) => [
            styles.newNoteButton,
            { backgroundColor: colors.primary, borderColor: colors.primary },
            pressed && styles.pressed,
          ]}>
          <Text style={[styles.newNoteText, { color: colors.white }]}>Return to selection</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <Text style={[styles.loadingText, { color: colors.primaryText }]}>Loading notes…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to My Practiced Notes selection"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: colors.surface, borderColor: colors.border },
            pressed && styles.pressed,
          ]}>
          <ChevronLeft size={18} color={colors.primaryText} />
        </Pressable>
        <Text style={[styles.title, { color: colors.primaryText }]}>My Practiced Notes</Text>
      </View>

      <Text style={[styles.pathLabel, { color: colors.secondaryText }]}>{category?.title ?? 'SQL'}</Text>
      <Text style={[styles.pathValue, { color: colors.primaryText }]}>
        {topic?.title ?? 'Topic'} / {subtopic?.title ?? 'Subtopic'}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create a My Practiced Notes entry"
        onPress={createNote}
        style={({ pressed }) => [
          styles.newNoteButton,
          { backgroundColor: colors.surface, borderColor: colors.border },
          pressed && styles.pressed,
        ]}>
        <Text style={[styles.newNoteText, { color: colors.secondaryText }]}>Take a note...</Text>
      </Pressable>

      <View style={styles.noteList}>
        {notes.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.secondaryText }]}>No notes yet for this subtopic.</Text>
        ) : null}
        {notes.map((note) => {
          const isEditing = activeNoteId === note.id;
          return (
            <View key={note.id} style={[styles.noteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.noteHeaderRow}>
                <View style={styles.headerTitleContainer}>
                  {isEditing ? (
                    <TextInput
                      value={note.title}
                      onChangeText={(text) =>
                        updateNote(note.id, (current) => ({
                          ...current,
                          title: text,
                          updatedAt: new Date().toISOString(),
                        }))
                      }
                      style={[styles.titleInput, { color: colors.primaryText, backgroundColor: colors.background }]}
                      placeholder="Untitled"
                      placeholderTextColor={colors.secondaryText}
                    />
                  ) : (
                    <Text style={[styles.noteTitle, { color: colors.primaryText }]} numberOfLines={1}>
                      {getDisplayNoteTitle(note.title)}
                    </Text>
                  )}
                </View>
                <View style={styles.noteMetaRow}>
                  <Text style={[styles.savedText, { color: colors.secondaryText }]}>
                    {saving ? 'Saving...' : '✓ Saved'}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isEditing ? `Collapse note ${getDisplayNoteTitle(note.title)}` : `Expand note ${getDisplayNoteTitle(note.title)}`}
                    accessibilityState={{ expanded: isEditing }}
                    onPress={() => setActiveNoteId(isEditing ? null : note.id)}
                    style={({ pressed }) => [styles.collapseButton, pressed && styles.pressed]}>
                    <Text style={[styles.collapseButtonText, { color: colors.primary }]}>
                      {isEditing ? 'Collapse' : 'Expand'}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open note actions for ${note.title}`}
                    onPress={() => setOpenMenuId((current) => (current === note.id ? null : note.id))}
                    style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}>
                    <Text style={[styles.menuButtonText, { color: colors.primaryText }]}>⋮</Text>
                  </Pressable>
                </View>
              </View>

              {openMenuId === note.id ? (
                <View style={[styles.menu, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                  <Pressable onPress={() => void copyNote(note)} style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}>
                    <Text style={[styles.menuItemText, { color: colors.primaryText }]}>Copy note</Text>
                  </Pressable>
                  <Pressable onPress={() => insertSqlBlock(note.id)} style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}>
                    <Text style={[styles.menuItemText, { color: colors.primaryText }]}>Add SQL</Text>
                  </Pressable>
                  <Pressable onPress={() => deleteNote(note.id)} style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}>
                    <Text style={[styles.menuItemText, { color: colors.danger }]}>Delete note</Text>
                  </Pressable>
                </View>
              ) : null}

              {isEditing ? (
                <View style={styles.noteBodyContainer}>
                  <ScrollView
                    style={styles.noteBodyScroller}
                    contentContainerStyle={styles.noteBodyContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator
                    nestedScrollEnabled>
                    <View style={styles.editorContent}>
                      <TextInput
                        value={note.content}
                        onChangeText={(value) =>
                          updateNote(note.id, (current) => ({
                            ...current,
                            content: value,
                            updatedAt: new Date().toISOString(),
                          }))
                        }
                        onSelectionChange={(event) =>
                          handleSelectionChange(note.id, {
                            start: event.nativeEvent.selection.start,
                            end: event.nativeEvent.selection.end,
                          })
                        }
                        onContentSizeChange={(event) =>
                          updateInputHeight(
                            `${note.id}:content`,
                            120,
                            event.nativeEvent.contentSize.height,
                          )
                        }
                        multiline
                        scrollEnabled={false}
                        style={[
                          styles.contentInput,
                          {
                            height: inputHeights[`${note.id}:content`] ?? 120,
                            color: colors.primaryText,
                            backgroundColor: colors.background,
                          },
                        ]}
                        placeholder="Write your learning notes here..."
                        placeholderTextColor={colors.secondaryText}
                      />

                      <View style={styles.toolbar}>
                        {[
                          ['Bold', 'bold'],
                          ['Italic', 'italic'],
                          ['Underline', 'underline'],
                          ['Strike', 'strike'],
                          ['•', 'bullet'],
                          ['1.', 'numbered'],
                          ['H', 'heading'],
                          ['Link', 'link'],
                        ].map(([label, action]) => (
                          <Pressable
                            key={`${note.id}-${label}`}
                            accessibilityRole="button"
                            accessibilityLabel={`Format note with ${label}`}
                            onPress={() => insertNoteFormatting(note.id, action as 'bold' | 'italic' | 'underline' | 'strike' | 'bullet' | 'numbered' | 'heading' | 'link')}
                            style={({ pressed }) => [styles.toolbarButton, pressed && styles.pressed]}>
                            <Text style={[styles.toolbarText, { color: colors.primaryText }]}>{label}</Text>
                          </Pressable>
                        ))}
                        <Pressable onPress={() => void copyNote(note)} style={({ pressed }) => [styles.toolbarButton, pressed && styles.pressed]}>
                          <Text style={[styles.toolbarText, { color: colors.primaryText }]}>Copy</Text>
                        </Pressable>
                      </View>

                      {note.sqlBlocks.map((block) => (
                        <View key={block.id} style={[styles.sqlBlock, { backgroundColor: colors.background, borderColor: colors.border }]}>
                          <Text style={[styles.blockLabel, { color: colors.secondaryText }]}>Question / Requirement</Text>
                          <TextInput
                            value={block.question}
                            onChangeText={(value) =>
                              updateNote(note.id, (current) => ({
                                ...current,
                                sqlBlocks: current.sqlBlocks.map((entry) =>
                                  entry.id === block.id ? { ...entry, question: value } : entry,
                                ),
                                updatedAt: new Date().toISOString(),
                              }))
                            }
                            onContentSizeChange={(event) =>
                              updateInputHeight(
                                `${block.id}:question`,
                                64,
                                event.nativeEvent.contentSize.height,
                              )
                            }
                            multiline
                            scrollEnabled={false}
                            style={[
                              styles.questionInput,
                              {
                                height: inputHeights[`${block.id}:question`] ?? 64,
                                color: colors.primaryText,
                                backgroundColor: colors.surfaceMuted,
                              },
                            ]}
                            placeholder="Find all employees who belong to the Sales department."
                            placeholderTextColor={colors.secondaryText}
                          />

                          <Text style={[styles.blockLabel, { color: colors.secondaryText }]}>SQL Query</Text>
                          <TextInput
                            value={block.sql}
                            onChangeText={(value) =>
                              updateNote(note.id, (current) => ({
                                ...current,
                                sqlBlocks: current.sqlBlocks.map((entry) =>
                                  entry.id === block.id ? { ...entry, sql: value } : entry,
                                ),
                                updatedAt: new Date().toISOString(),
                              }))
                            }
                            onContentSizeChange={(event) =>
                              updateInputHeight(
                                `${block.id}:sql`,
                                80,
                                event.nativeEvent.contentSize.height,
                              )
                            }
                            multiline
                            scrollEnabled={false}
                            style={[
                              styles.sqlInput,
                              {
                                height: inputHeights[`${block.id}:sql`] ?? 80,
                                color: colors.primaryText,
                                backgroundColor: colors.surfaceMuted,
                              },
                            ]}
                            placeholder="SELECT *\nFROM employees;"
                            placeholderTextColor={colors.secondaryText}
                          />
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Run SQL in note"
                            onPress={() => void runSqlBlock(note.id, block.id)}
                            style={({ pressed }) => [
                              styles.runSqlButton,
                              { backgroundColor: colors.primary, borderColor: colors.primary },
                              pressed && styles.pressed,
                            ]}>
                            <Text style={[styles.runSqlText, { color: colors.white }]}>
                              {block.status === 'running' ? 'Running SQL…' : '▶ Run SQL'}
                            </Text>
                          </Pressable>
                          {renderOutput(block.output)}
                          {block.evaluation ? (
                            <View style={[styles.outputCard, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                              <Text style={[styles.outputHeader, { color: colors.primaryText }]}>EVALUATION</Text>
                              <MarkdownContent content={block.evaluation} compactContent />
                            </View>
                          ) : null}
                          <TextInput
                            value={block.followUpText}
                            onChangeText={(value) =>
                              updateNote(note.id, (current) => ({
                                ...current,
                                sqlBlocks: current.sqlBlocks.map((entry) =>
                                  entry.id === block.id ? { ...entry, followUpText: value } : entry,
                                ),
                                updatedAt: new Date().toISOString(),
                              }))
                            }
                            onContentSizeChange={(event) =>
                              updateInputHeight(
                                `${block.id}:follow-up`,
                                120,
                                event.nativeEvent.contentSize.height,
                              )
                            }
                            multiline
                            scrollEnabled={false}
                            style={[
                              styles.contentInput,
                              {
                                height: inputHeights[`${block.id}:follow-up`] ?? 120,
                                color: colors.primaryText,
                                backgroundColor: colors.background,
                              },
                            ]}
                            placeholder="Continue writing after this SQL block..."
                            placeholderTextColor={colors.secondaryText}
                          />
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
  },
  pathLabel: {
    fontSize: 13,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  pathValue: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 18,
  },
  newNoteButton: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 18,
  },
  newNoteText: {
    fontSize: 16,
  },
  noteList: {
    gap: 16,
  },
  noteCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    overflow: 'hidden',
  },
  notePressable: {
    gap: 12,
  },
  noteHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
    zIndex: 2,
    backgroundColor: 'transparent',
  },
  noteBodyContainer: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'transparent',
    overflow: 'hidden',
  },
  noteBodyScroller: {
    maxHeight: 560,
    minHeight: 220,
  },
  noteBodyContent: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  headerTitleContainer: {
    flex: 1,
    minWidth: 0,
  },
  noteMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  savedText: {
    fontSize: 12,
    fontWeight: '600',
  },
  collapseButton: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  collapseButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  menuButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonText: {
    fontSize: 24,
    lineHeight: 24,
  },
  menu: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 6,
    marginTop: 8,
  },
  menuItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '600',
  },
  editorContent: {
    gap: 12,
  },
  titleInput: {
    width: '100%',
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: '700',
  },
  contentInput: {
    minHeight: 120,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  blockLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  questionInput: {
    minHeight: 64,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  toolbarButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  toolbarText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sqlBlock: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 10,
  },
  sqlInput: {
    minHeight: 80,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  runSqlButton: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runSqlText: {
    fontSize: 14,
    fontWeight: '700',
  },
  outputCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  outputHeader: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  successText: {
    fontSize: 13,
    fontWeight: '700',
  },
  errorText: {
    fontSize: 13,
    fontWeight: '700',
  },
  outputText: {
    fontSize: 13,
  },
  outputTableWrap: {
    maxWidth: '100%',
  },
  outputTableContent: {
    paddingBottom: 4,
  },
  outputTable: {
    minWidth: 200,
  },
  outputRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: 4,
  },
  outputCellHeader: {
    flex: 1,
    minWidth: 80,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  outputCell: {
    flex: 1,
    minWidth: 80,
    fontSize: 12,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  noteTitle: {
    fontSize: 18,
    fontWeight: '700',
    flexShrink: 1,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  pressed: {
    opacity: 0.8,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 20,
  },
});
