import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export default function AddNotesScreen() {
  return (
    <PlaceholderScreen
      title="Add Notes"
      description="Create and organize your learning content here."
      icon={{ ios: 'square.and.pencil', android: 'edit_note', web: 'edit_note' }}
    />
  );
}
