import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ListRenderItem,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, ThemedTextInput } from '@/components/ui/primitives';
import { useAppShellContentScrollable } from '@/components/app-shell/AppShell';
import { MarkdownContent } from '@/components/topic-chat/MarkdownContent';
import { DesignTokens } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useAppTheme } from '@/contexts/theme-context';
import { askTopicQuestion } from '@/lib/api';
import { canSendTopicMessage, getSubtopicContext, getTopicContext } from '@/lib/learning-content';
import { supabase } from '@/lib/supabase';
import { createTopicLesson } from '@/lib/topic-lesson';
import type {
  LearningChatMessage,
  LearningConversation,
  TopicLesson,
} from '@/types/learning-chat';

type FeedItem =
  | { type: 'lesson'; key: 'lesson'; lesson: TopicLesson }
  | { type: 'message'; key: string; message: LearningChatMessage };

type RetryRequest = {
  question: string;
  history: { role: 'user' | 'assistant'; content: string }[];
};

type LearningPathNoteContext = {
  id: string;
  title: string;
  content: string;
  source_type: string;
};

export default function TopicLearningChatScreen() {
  const { categoryId, topicId, subtopicId } = useLocalSearchParams<{
    categoryId?: string;
    topicId: string;
    subtopicId?: string;
  }>();
  const context = getTopicContext(topicId);
  const resolvedCategoryId = categoryId ?? context?.category.id;
  const resolvedSubtopicId = subtopicId ?? context?.topic.subtopics[0]?.id;
  const selectedSubtopic =
    resolvedCategoryId && resolvedSubtopicId
      ? getSubtopicContext(resolvedCategoryId, topicId, resolvedSubtopicId)?.subtopic ?? null
      : null;

  if (context && selectedSubtopic && (!categoryId || categoryId === context.category.id)) {
    return (
      <TopicConversation
        key={`${context.category.id}:${context.topic.id}:${selectedSubtopic?.id ?? ''}`}
        context={context}
        selectedSubtopic={selectedSubtopic}
      />
    );
  }

  return <TopicUnavailable />;
}

function TopicUnavailable({ message = 'This topic could not be found.' }: { message?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.unavailable}>
      <Card>
        <Text style={[styles.title, { color: colors.primaryText }]}>
          {message}
        </Text>
        <Button onPress={() => router.push('/learning-path')} style={styles.returnButton}>
          Return to Learning Path
        </Button>
      </Card>
    </View>
  );
}

function TopicConversation({
  context,
  selectedSubtopic,
}: {
  context: NonNullable<ReturnType<typeof getTopicContext>>;
  selectedSubtopic: NonNullable<ReturnType<typeof getSubtopicContext>>['subtopic'];
}) {
  const { category, topic, previousTopic, nextTopic } = context;
  const { user, session } = useAuth();
  const userId = user?.id;
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const shellContentScrollable = useAppShellContentScrollable();
  const stylesForTheme = useMemo(() => makeStyles(colors), [colors]);
  const localLesson = useMemo(
    () => createTopicLesson(topic, selectedSubtopic ?? undefined),
    [selectedSubtopic, topic],
  );
  const [conversation, setConversation] = useState<LearningConversation | null>(null);
  const [lesson, setLesson] = useState<TopicLesson>(localLesson);
  const [messages, setMessages] = useState<LearningChatMessage[]>([]);
  const [learningNotes, setLearningNotes] = useState<LearningPathNoteContext[]>([]);
  const [notesContextError, setNotesContextError] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sendError, setSendError] = useState('');
  const [retryRequest, setRetryRequest] = useState<RetryRequest | null>(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const listRef = useRef<FlatList<FeedItem>>(null);
  const isNearLatestRef = useRef(true);
  const draftBeforeSend = useRef('');
  const canSend = canSendTopicMessage({
    categoryId: category.id,
    topicId: topic.id,
    subtopicId: selectedSubtopic?.id,
    conversationReady: Boolean(conversation),
    sessionReady: Boolean(supabase && session?.access_token),
    loading,
    loadError,
    sending,
    message: draft,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadConversation() {
      setLoading(true);
      setLoadError('');
      setConversation(null);
      setMessages([]);

      if (!userId || !supabase) {
        setLoadError(
          userId
            ? 'Conversation storage is not configured. Check the Supabase client settings.'
            : 'Sign in to save and continue this learning conversation.',
        );
        setLoading(false);
        return;
      }

      try {
        const client = supabase;
        const query = (moduleId: string | null) => {
          let conversationQuery = client
            .from('learning_conversations')
            .select('*')
            .eq('user_id', userId)
            .eq('category_id', category.id)
            .eq('topic_id', topic.id);
          conversationQuery =
            moduleId === null
              ? conversationQuery.is('module_id', null)
              : conversationQuery.eq('module_id', moduleId);
          return conversationQuery.maybeSingle();
        };

        let { data, error } = await query(null);
        if (error) {
          throw error;
        }

        if (!data) {
          const legacyResult = await query(category.id);
          if (legacyResult.error) {
            throw legacyResult.error;
          }
          data = legacyResult.data;
        }

        if (!data) {
          const insertConversation = (moduleId: string | null) =>
            client
              .from('learning_conversations')
              .insert({
                user_id: userId,
                category_id: category.id,
                ...(moduleId === null ? {} : { module_id: moduleId }),
                topic_id: topic.id,
                lesson_content: localLesson,
              })
              .select('*')
              .single();

          let created = await insertConversation(null);
          if (created.error?.code === '23502') {
            created = await insertConversation(category.id);
          }
          if (created.error?.code === '23505') {
            ({ data, error } = await query(null));
            if (!error && !data) {
              ({ data, error } = await query(category.id));
            }
          } else {
            data = created.data;
            error = created.error;
          }
          if (error) {
            throw error;
          }
        }

        if (!data) {
          throw new Error('The learning conversation could not be loaded.');
        }

        const currentConversation = data as LearningConversation;
        const result = await client
          .from('learning_chat_messages')
          .select('id, conversation_id, role, content, created_at')
          .eq('conversation_id', currentConversation.id)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true });

        if (result.error) {
          throw result.error;
        }

        if (!cancelled) {
          setConversation(currentConversation);
          setLesson(localLesson);
          setMessages((result.data ?? []) as LearningChatMessage[]);
          setLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(getErrorMessage(
            error,
            'Could not load this conversation. Check your connection and try again.',
          ));
          setLoading(false);
        }
      }
    }

    void loadConversation();
    return () => {
      cancelled = true;
    };
  }, [
    category.id,
    loadAttempt,
    localLesson,
    topic.id,
    userId,
  ]);

  useEffect(() => {
    let active = true;
    const loadLearningNotes = async () => {
      if (!userId || !supabase) {
        setLearningNotes([]);
        return;
      }
      try {
        const result = await supabase
          .from('notes')
          .select('id,title,content,source_type')
          .eq('user_id', userId)
          .eq('category_id', category.id)
          .eq('topic_id', topic.id)
          .order('created_at', { ascending: true })
          .limit(20);
        if (result.error) {
          throw result.error;
        }
        if (active) {
          setLearningNotes((result.data ?? []) as LearningPathNoteContext[]);
          setNotesContextError('');
        }
      } catch (error) {
        if (active) {
          setLearningNotes([]);
          setNotesContextError(
            getErrorMessage(error, 'Saved notes could not be loaded for this topic.'),
          );
        }
      }
    };
    void Promise.resolve().then(loadLearningNotes);
    return () => {
      active = false;
    };
  }, [category.id, topic.id, userId]);

  const addAssistantReply = useCallback(
    async (request: RetryRequest, currentConversation: LearningConversation) => {
      const accessToken = session?.access_token;
      if (!accessToken || !supabase) {
        throw new Error('Your session is unavailable. Sign in again before requesting a reply.');
      }

      const result = await askTopicQuestion({
        accessToken,
        categoryId: category.id,
        topicId: topic.id,
        subtopicId: selectedSubtopic.id,
        category: category.title,
        topic: topic.title,
        officialContent: JSON.stringify({
          canonicalPath: {
            categoryId: category.id,
            topicId: topic.id,
            subtopicId: selectedSubtopic.id,
          },
          officialLesson: lesson,
          savedLearningNotes: learningNotes.slice(-3).map((note) => ({
            title: note.title,
            source: note.source_type,
            content: note.content.slice(0, 1_200),
          })),
        }),
        history: request.history,
        question: request.question,
      });

      const inserted = await supabase
        .from('learning_chat_messages')
        .insert({
          conversation_id: currentConversation.id,
          role: 'assistant',
          content: result.reply,
        })
        .select('id, conversation_id, role, content, created_at')
        .single();

      if (inserted.error) {
        throw new Error(`The reply was received but could not be saved: ${inserted.error.message}`);
      }

      setMessages((current) => [...current, inserted.data as LearningChatMessage]);
      setRetryRequest(null);
      setSendError('');
    },
    [
      category.id,
      category.title,
      learningNotes,
      lesson,
      selectedSubtopic.id,
      session?.access_token,
      topic.id,
      topic.title,
    ],
  );

  const submitQuestion = useCallback(async () => {
    const question = draft.trim();
    if (!question || !conversation || !selectedSubtopic || !session?.access_token || !supabase || sendingRef.current) {
      return;
    }

    sendingRef.current = true;
    setSending(true);
    setSendError('');
    draftBeforeSend.current = draft;
    const request: RetryRequest = {
      question,
      history: messages
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .slice(-20)
        .map(({ role, content }) => ({ role, content: content.slice(0, 4000) })),
    };
    let userMessageSaved = false;

    try {
      const inserted = await supabase
        .from('learning_chat_messages')
        .insert({
          conversation_id: conversation.id,
          role: 'user',
          content: question,
        })
        .select('id, conversation_id, role, content, created_at')
        .single();

      if (inserted.error) {
        throw inserted.error;
      }

      userMessageSaved = true;
      setMessages((current) => [...current, inserted.data as LearningChatMessage]);
      setDraft('');
      await addAssistantReply(request, conversation);
    } catch (error) {
      setSendError(getErrorMessage(
        error,
        'Your message could not be sent. Check your connection and try again.',
      ));

      if (userMessageSaved) {
        setRetryRequest(request);
      } else {
        setDraft(draftBeforeSend.current);
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [addAssistantReply, conversation, draft, messages, selectedSubtopic, session?.access_token]);

  const retryReply = useCallback(async () => {
    if (!retryRequest || !conversation || sendingRef.current) {
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setSendError('');
    try {
      await addAssistantReply(retryRequest, conversation);
    } catch (error) {
      setSendError(getErrorMessage(error, 'The reply could not be retrieved. Please try again.'));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [addAssistantReply, conversation, retryRequest]);

  const feedItems = useMemo<FeedItem[]>(
    () => [
      { type: 'lesson', key: 'lesson', lesson },
      ...messages.map((message) => ({
        type: 'message' as const,
        key: message.id,
        message,
      })),
    ],
    [lesson, messages],
  );

  useEffect(() => {
    if (loading || loadError || shellContentScrollable) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      if (isNearLatestRef.current) {
        listRef.current?.scrollToEnd({ animated: false });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [loadError, loading, messages.length, shellContentScrollable]);

  const updateLatestVisibility = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromLatest =
        contentSize.height - layoutMeasurement.height - contentOffset.y;
      const isNearLatest = distanceFromLatest <= 120;
      isNearLatestRef.current = isNearLatest;
    },
    [],
  );

  const renderItem = useCallback<ListRenderItem<FeedItem>>(
    ({ item }) =>
      item.type === 'lesson' ? (
        <LessonMessage lesson={item.lesson} />
      ) : (
        <ChatMessage message={item.message} />
      ),
    [],
  );

  const returnToCategory = () =>
    router.push({
      pathname: '/learning-path',
      params: { categoryId: category.id },
    });

  const openTopic = (nextTopicId: string) =>
    router.push({ pathname: '/topic', params: { topicId: nextTopicId } });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
      keyboardVerticalOffset={Platform.OS === 'android' ? insets.top + 64 + 22 : 0}
      style={stylesForTheme.screen}>
      <View style={stylesForTheme.compactHeader}>
        <Pressable
          accessibilityLabel={`Back to ${category.title}`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={returnToCategory}
          style={({ pressed }) => [stylesForTheme.backButton, pressed && stylesForTheme.pressed]}>
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
            size={18}
            tintColor={colors.primary}
          />
        </Pressable>
        <Text numberOfLines={1} style={stylesForTheme.compactTitle}>{topic.title}</Text>
      </View>

      {shellContentScrollable ? (
        <View style={stylesForTheme.messageList} />
      ) : (
        <View style={stylesForTheme.listContainer}>
          <FlatList
            ref={listRef}
            data={feedItems}
            keyExtractor={(item) => item.key}
            renderItem={renderItem}
            style={stylesForTheme.messageList}
            contentContainerStyle={stylesForTheme.feed}
            keyboardShouldPersistTaps="handled"
            onScroll={updateLatestVisibility}
            onMomentumScrollEnd={updateLatestVisibility}
            onScrollEndDrag={updateLatestVisibility}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator
            ListFooterComponent={
              <View style={stylesForTheme.feedFooter}>
                {notesContextError ? (
                  <Text accessibilityRole="alert" style={stylesForTheme.errorText}>
                    {notesContextError}
                  </Text>
                ) : learningNotes.length > 0 ? (
                  <Text style={stylesForTheme.stateText}>
                    {learningNotes.length} saved Learning Path note{learningNotes.length === 1 ? '' : 's'} available to the tutor.
                  </Text>
                ) : null}
                {loading ? (
                  <View style={stylesForTheme.thinking}>
                    <ActivityIndicator color={colors.primary} size="small" />
                    <Text style={stylesForTheme.stateText}>Restoring your conversation…</Text>
                  </View>
                ) : null}
                {loadError ? (
                  <View style={stylesForTheme.loadError}>
                    <Text accessibilityRole="alert" style={stylesForTheme.errorText}>{loadError}</Text>
                    {user && supabase ? (
                      <Button
                        onPress={() => setLoadAttempt((attempt) => attempt + 1)}
                        style={stylesForTheme.retryButton}>
                        Retry loading
                      </Button>
                    ) : null}
                  </View>
                ) : null}
                <TopicNavigation
                  previousTitle={previousTopic?.title}
                  nextTitle={nextTopic?.title}
                  onPrevious={() => previousTopic && openTopic(previousTopic.id)}
                  onNext={() => nextTopic && openTopic(nextTopic.id)}
                />
              </View>
            }
          />
          <View style={stylesForTheme.scrollControls}>
            <Pressable
              accessibilityLabel="Scroll topic content to top"
              accessibilityRole="button"
              onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
              style={({ pressed }) => [
                stylesForTheme.scrollControl,
                pressed && stylesForTheme.pressed,
              ]}>
              <SymbolView
                name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }}
                size={19}
                tintColor={colors.white}
              />
            </Pressable>
            <Pressable
              accessibilityLabel="Jump to latest message"
              accessibilityRole="button"
              onPress={() => listRef.current?.scrollToEnd({ animated: true })}
              style={({ pressed }) => [
                stylesForTheme.scrollControl,
                pressed && stylesForTheme.pressed,
              ]}>
              <SymbolView
                name={{ ios: 'arrow.down', android: 'arrow_downward', web: 'arrow_downward' }}
                size={19}
                tintColor={colors.white}
              />
            </Pressable>
          </View>
        </View>
      )}

      {sendError ? (
        <View style={stylesForTheme.sendError}>
          <Text accessibilityRole="alert" style={stylesForTheme.errorText}>{sendError}</Text>
          {retryRequest ? (
            <Pressable
              accessibilityRole="button"
              disabled={sending}
              onPress={() => void retryReply()}
              style={stylesForTheme.retryLink}>
              <Text style={stylesForTheme.retryText}>
                {sending ? 'Retrying…' : 'Retry AI reply'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {sending ? (
        <View style={stylesForTheme.thinking}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={stylesForTheme.stateText}>Shyam is thinking…</Text>
        </View>
      ) : null}

      <View style={[stylesForTheme.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <ThemedTextInput
          accessibilityLabel={`Ask anything about ${topic.title}`}
          editable={!sending}
          maxLength={4000}
          multiline
          onChangeText={setDraft}
          onSubmitEditing={() => void submitQuestion()}
          placeholder={`Ask anything about ${topic.title}...`}
          returnKeyType="send"
          style={stylesForTheme.input}
          value={draft}
        />
        <Pressable
          accessibilityLabel="Send message"
          accessibilityRole="button"
          disabled={
            !canSend
          }
          onPress={() => void submitQuestion()}
          style={({ pressed }) => [
            stylesForTheme.sendButton,
            !canSend && stylesForTheme.sendDisabled,
            pressed && stylesForTheme.pressed,
          ]}>
          {sending ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <SymbolView
              name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }}
              size={19}
              tintColor={colors.white}
            />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function LessonMessage({ lesson }: { lesson: TopicLesson }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.lessonRow}>
      <View style={[styles.assistantMark, { backgroundColor: colors.primarySoft }]}>
        <SymbolView
          name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }}
          size={16}
          tintColor={colors.primary}
        />
      </View>
      <View style={styles.lessonContent}>
        <Text style={[styles.sender, { color: colors.primary }]}>Shyam SQL Lab · LESSON</Text>
        <Card style={styles.lessonCard}>
          <Text style={[styles.lessonTitle, { color: colors.primaryText }]}>{lesson.title}</Text>
          <Text style={[styles.lessonSummary, { color: colors.secondaryText }]}>{lesson.summary}</Text>
          <MaterialSection title="What you’ll learn" items={lesson.explanation} />
          {lesson.examples.map((example, index) => (
            <View key={`${example.title}-${index}`} style={styles.lessonSection}>
              <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>{example.title}</Text>
              <Text style={[styles.bodyText, { color: colors.secondaryText }]}>{example.explanation}</Text>
              <View style={[styles.codeCard, { backgroundColor: colors.codeBackground, borderColor: colors.border }]}>
                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <Text selectable style={[styles.code, { color: colors.codeText }]}>{example.code}</Text>
                </ScrollView>
              </View>
            </View>
          ))}
          {lesson.subtopics.map((subtopic) => (
            <View key={subtopic.id} style={styles.lessonSection}>
              <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>{subtopic.title}</Text>
              {subtopic.explanation.map((paragraph, index) => (
                <Text key={`${subtopic.id}-${index}`} style={[styles.bodyText, { color: colors.secondaryText }]}>
                  {paragraph}
                </Text>
              ))}
              {subtopic.examples.map((example, index) => (
                <View key={`${subtopic.id}-${example.title}-${index}`} style={styles.subtopicExample}>
                  <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>{example.title}</Text>
                  <Text style={[styles.bodyText, { color: colors.secondaryText }]}>{example.explanation}</Text>
                  <View style={[styles.codeCard, { backgroundColor: colors.codeBackground, borderColor: colors.border }]}>
                    <ScrollView horizontal showsHorizontalScrollIndicator>
                      <Text selectable style={[styles.code, { color: colors.codeText }]}>{example.code}</Text>
                    </ScrollView>
                  </View>
                </View>
              ))}
            </View>
          ))}
          <MaterialSection title="Key points" items={lesson.keyPoints} />
          <MaterialSection title="Common mistakes" items={lesson.commonMistakes} />
          <MaterialSection title="Practice questions" items={lesson.practiceQuestions} />
          <MaterialSection title="Interview points" items={lesson.interviewQuestions} />
          {lesson.subtopics.map((subtopic) => (
            <View key={`${subtopic.id}-review`} style={styles.lessonSection}>
              <MaterialSection title={`${subtopic.title} · Key points`} items={subtopic.keyPoints} />
              <MaterialSection title={`${subtopic.title} · Common mistakes`} items={subtopic.commonMistakes} />
              <MaterialSection title={`${subtopic.title} · Practice`} items={subtopic.practiceQuestions} />
              <MaterialSection title={`${subtopic.title} · Interview`} items={subtopic.interviewQuestions} />
            </View>
          ))}
        </Card>
      </View>
    </View>
  );
}

function MaterialSection({ title, items }: { title: string; items: string[] }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (items.length === 0) {
    return null;
  }
  return (
    <View style={styles.lessonSection}>
      <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>{title}</Text>
      {items.map((item, index) => (
        <View key={`${title}-${index}`} style={styles.bulletRow}>
          <Text style={[styles.bullet, { color: colors.primary }]}>•</Text>
          <Text style={[styles.bodyText, styles.bulletText, { color: colors.secondaryText }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function ChatMessage({ message }: { message: LearningChatMessage }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isUser = message.role === 'user';
  return (
    <View style={[styles.messageRow, isUser && styles.userMessageRow]}>
      {!isUser ? (
        <View style={[styles.assistantMark, { backgroundColor: colors.primarySoft }]}>
          <SymbolView
            name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }}
            size={15}
            tintColor={colors.primary}
          />
        </View>
      ) : null}
      <View
        style={[
          styles.messageBubble,
          isUser
            ? { backgroundColor: colors.primary }
            : { backgroundColor: colors.surface, borderColor: colors.border },
          isUser && styles.userBubble,
        ]}>
        <Text style={[styles.messageSender, { color: isUser ? colors.white : colors.primary }]}>
          {isUser ? 'You' : 'Shyam SQL Lab'}
        </Text>
        {isUser ? (
          <Text style={[styles.messageText, { color: colors.white }]}>{message.content}</Text>
        ) : (
          <MarkdownContent content={message.content} />
        )}
      </View>
    </View>
  );
}

function TopicNavigation({
  previousTitle,
  nextTitle,
  onPrevious,
  onNext,
}: {
  previousTitle?: string;
  nextTitle?: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!previousTitle && !nextTitle) {
    return null;
  }
  return (
    <View style={styles.topicNavigation}>
      {previousTitle ? (
        <Pressable accessibilityRole="button" onPress={onPrevious} style={[styles.topicNavButton, { borderColor: colors.border }]}>
          <Text style={[styles.navCaption, { color: colors.primary }]}>PREVIOUS TOPIC</Text>
          <Text numberOfLines={2} style={[styles.navTitle, { color: colors.primaryText }]}>{previousTitle}</Text>
        </Pressable>
      ) : <View style={styles.topicNavSpacer} />}
      {nextTitle ? (
        <Pressable accessibilityRole="button" onPress={onNext} style={[styles.topicNavButton, styles.nextNav, { borderColor: colors.border }]}>
          <Text style={[styles.navCaption, { color: colors.primary }]}>NEXT TOPIC</Text>
          <Text numberOfLines={2} style={[styles.navTitle, styles.nextText, { color: colors.primaryText }]}>{nextTitle}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof import('@/constants/theme').getThemeColors>) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      minHeight: 0,
      maxWidth: 920,
      width: '100%',
      alignSelf: 'center',
    },
    messageList: {
      flex: 1,
      minHeight: 0,
    },
    compactHeader: {
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingBottom: 6,
    },
    backButton: {
      width: 42,
      height: 42,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 21,
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    compactTitle: {
      flex: 1,
      color: colors.primaryText,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
    },
    listContainer: {
      flex: 1,
      minHeight: 0,
      position: 'relative',
    },
    feed: {
      flexGrow: 1,
      paddingTop: 8,
      paddingBottom: 18,
      gap: 18,
    },
    feedFooter: {
      gap: 12,
    },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      padding: 20,
    },
    stateText: {
      color: colors.secondaryText,
      fontSize: 12,
    },
    errorText: {
      color: colors.danger,
      fontSize: 12,
      lineHeight: 18,
      flexShrink: 1,
    },
    retryButton: {
      minHeight: 40,
      marginTop: 4,
    },
    loadError: {
      gap: 8,
      alignItems: 'flex-start',
      paddingHorizontal: 8,
      paddingTop: 8,
    },
    lessonRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    assistantMark: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
      flexShrink: 0,
    },
    lessonContent: {
      flex: 1,
      minWidth: 0,
    },
    sender: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.45,
      marginBottom: 7,
    },
    lessonCard: {
      padding: 18,
      gap: 12,
    },
    lessonTitle: {
      fontSize: 20,
      lineHeight: 27,
      fontWeight: '800',
    },
    lessonSummary: {
      fontSize: 15,
      lineHeight: 23,
      marginTop: -6,
    },
    lessonSection: {
      gap: 7,
      marginTop: 2,
    },
    sectionTitle: {
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '800',
    },
    bodyText: {
      fontSize: 16,
      lineHeight: 25,
      flexShrink: 1,
    },
    bulletRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 7,
    },
    bullet: {
      fontSize: 14,
      lineHeight: 19,
    },
    bulletText: {
      flex: 1,
    },
    codeCard: {
      alignSelf: 'stretch',
      maxWidth: '100%',
      borderWidth: 1,
      borderRadius: 9,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 2,
    },
    code: {
      fontFamily: DesignTokens.typography.mono,
      fontSize: 14,
      lineHeight: 22,
      flexShrink: 1,
    },
    subtopicExample: {
      gap: 6,
      marginTop: 5,
    },
    messageRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 9,
    },
    userMessageRow: {
      justifyContent: 'flex-end',
    },
    messageBubble: {
      maxWidth: '88%',
      minWidth: 80,
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    userBubble: {
      borderBottomRightRadius: 5,
    },
    messageSender: {
      fontSize: 9,
      lineHeight: 13,
      fontWeight: '800',
      marginBottom: 4,
    },
    messageText: {
      fontSize: 16,
      lineHeight: 24,
      flexShrink: 1,
    },
    sendError: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingHorizontal: 12,
      paddingTop: 6,
    },
    retryLink: {
      minHeight: 36,
      justifyContent: 'center',
      paddingHorizontal: 5,
    },
    retryText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '800',
    },
    thinking: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingTop: 5,
    },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 9,
      flexShrink: 0,
      paddingTop: 10,
      paddingHorizontal: 2,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    input: {
      flex: 1,
      minHeight: 48,
      maxHeight: 140,
      paddingTop: 13,
      paddingBottom: 12,
      lineHeight: 19,
      borderRadius: 16,
    },
    sendButton: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    sendDisabled: {
      opacity: 0.45,
    },
    pressed: {
      opacity: 0.8,
    },
    scrollControls: {
      position: 'absolute',
      right: 12,
      bottom: 14,
      gap: 8,
    },
    scrollControl: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    topicNavigation: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 10,
      paddingTop: 10,
    },
    topicNavButton: {
      flex: 1,
      minWidth: 0,
      minHeight: 60,
      justifyContent: 'center',
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    topicNavSpacer: {
      flex: 1,
    },
    nextNav: {
      alignItems: 'flex-end',
    },
    navCaption: {
      fontSize: 8,
      letterSpacing: 0.7,
      fontWeight: '800',
      marginBottom: 4,
    },
    navTitle: {
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '700',
    },
    nextText: {
      textAlign: 'right',
    },
    unavailable: {
      width: '100%',
      maxWidth: 520,
      alignSelf: 'center',
      paddingTop: 24,
    },
    title: {
      fontSize: 16,
      fontWeight: '800',
    },
    returnButton: {
      alignSelf: 'flex-start',
      marginTop: 16,
    },
    breadcrumb: {
      fontSize: 10,
      fontWeight: '700',
    },
  });
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.trim()
  ) {
    return error.message;
  }
  return fallback;
}

const styles = StyleSheet.create({
  unavailable: {
    flex: 1,
    justifyContent: 'center',
  },
  returnButton: {
    marginTop: 14,
    alignSelf: 'flex-start',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  breadcrumb: {
    fontSize: 10,
    fontWeight: '700',
  },
});
