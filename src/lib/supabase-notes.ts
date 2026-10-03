import { supabase } from '@/lib/supabase';
import type { Note, NoteImportItem, NoteSource } from '@/types/notes';

export async function listUserNotes(
  userId: string,
  filters: { categoryId?: string; topicId?: string } = {},
): Promise<Note[]> {
  if (!supabase) {
    throw new Error('Notes storage is not configured. Please try again later.');
  }

  let query = supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (filters.categoryId && filters.categoryId !== 'all') {
    query = query.eq('category_id', filters.categoryId);
  }
  if (filters.topicId && filters.topicId !== 'all') {
    query = query.eq('topic_id', filters.topicId);
  }
  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as Note[];
}

export async function createUserNote(note: Note): Promise<Note> {
  if (!supabase) {
    throw new Error('Notes storage is not configured. Please try again later.');
  }

  const insertRecord = {
    user_id: note.user_id,
    category_id: note.category_id,
    module_id: note.module_id,
    topic_id: note.topic_id,
    subtopic_id: note.subtopic_id,
    title: note.title,
    content: note.content,
    source_type: note.source_type,
    source_id: note.source_id,
  };
  const { data, error } = await supabase.from('notes').insert(insertRecord).select().single();
  if (error) {
    throw error;
  }
  return data as Note;
}

export async function updateUserNote(noteId: string, updates: Partial<Note>): Promise<Note> {
  if (!supabase) {
    throw new Error('Notes storage is not configured. Please try again later.');
  }

  const { data, error } = await supabase
    .from('notes')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', noteId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as Note;
}

export async function deleteUserNote(noteId: string, userId?: string): Promise<void> {
  if (!supabase) {
    throw new Error('Notes storage is not configured. Please try again later.');
  }

  let query = supabase.from('notes').delete().eq('id', noteId);
  if (userId) {
    query = query.eq('user_id', userId);
  }
  const { error } = await query;
  if (error) {
    throw error;
  }
}

export async function createUserNoteSource(source: NoteSource): Promise<NoteSource> {
  if (!supabase) {
    throw new Error('Notes storage is not configured. Please try again later.');
  }

  const { data, error } = await supabase
    .from('note_sources')
    .insert({
      user_id: source.user_id,
      source_name: source.source_name,
      source_type: source.source_type,
      raw_content: source.raw_content,
      processing_status: source.processing_status,
    })
    .select()
    .single();
  if (error) {
    throw error;
  }
  return data as NoteSource;
}

export async function listUserNoteSources(userId: string): Promise<NoteSource[]> {
  if (!supabase) {
    throw new Error('Notes storage is not configured. Please try again later.');
  }

  const { data, error } = await supabase
    .from('note_sources')
    .select('*')
    .eq('user_id', userId)
    .order('upload_date', { ascending: false });

  if (error) {
    throw error;
  }
  return (data ?? []) as NoteSource[];
}

export async function listUserImportItems(
  _userId: string,
  sourceId?: string,
): Promise<NoteImportItem[]> {
  if (!supabase) {
    throw new Error('Notes storage is not configured. Please try again later.');
  }

  let query = supabase
    .from('note_import_items')
    .select('*')
    .order('created_at', { ascending: false });
  if (sourceId) {
    query = query.eq('source_id', sourceId);
  }
  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as NoteImportItem[];
}

export async function updateImportItem(itemId: string, updates: Partial<NoteImportItem>): Promise<NoteImportItem> {
  if (!supabase) {
    throw new Error('Notes storage is not configured. Please try again later.');
  }

  const { data, error } = await supabase
    .from('note_import_items')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as NoteImportItem;
}

export async function createUserImportItems(items: NoteImportItem[]): Promise<NoteImportItem[]> {
  if (!supabase) {
    throw new Error('Notes storage is not configured. Please try again later.');
  }
  if (items.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('note_import_items')
    .insert(items.map((item) => ({
      source_id: item.source_id,
      raw_chunk: item.raw_chunk,
      proposed_category_id: item.proposed_category_id,
      proposed_module_id: item.proposed_module_id,
      proposed_topic_id: item.proposed_topic_id,
      proposed_subtopic_id: item.proposed_subtopic_id,
      proposed_title: item.proposed_title,
      content: item.content ?? item.raw_chunk,
      confidence: item.confidence,
      mapping_reason: item.mapping_reason ?? '',
      duplicate_detected: item.duplicate_detected ?? false,
      review_status: item.review_status,
      final_category_id: item.final_category_id,
      final_module_id: item.final_module_id,
      final_topic_id: item.final_topic_id,
      final_subtopic_id: item.final_subtopic_id,
    })))
    .select();
  if (error) {
    throw error;
  }
  return (data ?? []) as NoteImportItem[];
}

export async function approveUserImportItem(itemId: string): Promise<string> {
  if (!supabase) {
    throw new Error('Notes storage is not configured. Please try again later.');
  }
  const { data, error } = await supabase.rpc('approve_note_import_item', { p_item_id: itemId });
  if (error) {
    throw error;
  }
  return data as string;
}

export async function rejectUserImportItem(itemId: string): Promise<void> {
  if (!supabase) {
    throw new Error('Notes storage is not configured. Please try again later.');
  }
  const { error } = await supabase.rpc('reject_note_import_item', { p_item_id: itemId });
  if (error) {
    throw error;
  }
}

export async function updateUserNoteSourceStatus(
  sourceId: string,
  status: NoteSource['processing_status'],
): Promise<void> {
  if (!supabase) {
    throw new Error('Notes storage is not configured. Please try again later.');
  }
  const { error } = await supabase
    .from('note_sources')
    .update({ processing_status: status, updated_at: new Date().toISOString() })
    .eq('id', sourceId);
  if (error) {
    throw error;
  }
}
