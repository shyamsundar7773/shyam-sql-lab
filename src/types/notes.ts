export type NoteSourceKind = 'TXT' | 'Paste';
export type NoteSourceType = 'Official' | 'Manual' | 'Imported';
export type NoteProcessingStatus =
  | 'Draft'
  | 'Analyzing'
  | 'Ready for Review'
  | 'Approved'
  | 'Rejected'
  | 'Partially Approved'
  | 'Failed';
export type NoteReviewStatus = 'Pending' | 'Needs Decision' | 'Approved' | 'Rejected';

export type Note = {
  id: string;
  user_id: string;
  category_id: string;
  module_id: string;
  topic_id: string;
  subtopic_id: string;
  title: string;
  content: string;
  source_type: NoteSourceType;
  source_id: string | null;
  created_at: string;
  updated_at: string;
};

export type NoteSource = {
  id: string;
  user_id: string;
  source_name: string;
  source_type: NoteSourceKind;
  raw_content: string;
  upload_date: string;
  processing_status: NoteProcessingStatus;
  created_at?: string;
  updated_at?: string;
};

export type NoteImportItem = {
  id: string;
  source_id: string;
  raw_chunk: string;
  proposed_category_id: string;
  proposed_module_id: string;
  proposed_topic_id: string;
  proposed_subtopic_id: string;
  proposed_title: string;
  mapping_reason?: string;
  duplicate_detected?: boolean;
  confidence: number;
  review_status: NoteReviewStatus;
  final_category_id?: string | null;
  final_module_id?: string | null;
  final_topic_id?: string | null;
  final_subtopic_id?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  content?: string;
  created_at?: string;
  updated_at?: string;
};

export type NoteLocation = {
  categoryId: string;
  moduleId: string;
  topicId: string;
  subtopicId: string;
};

export type NoteDraftInput = {
  userId: string;
  categoryId: string;
  moduleId: string;
  topicId: string;
  subtopicId: string;
  title: string;
  content: string;
  sourceType?: NoteSourceType;
  sourceId?: string | null;
};
