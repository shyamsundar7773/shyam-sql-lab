import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export default function NotesScreen() {
  return (
    <PlaceholderScreen
      title="Notes"
      description="Your structured SQL notes will appear here."
      icon={{ ios: 'note.text', android: 'description', web: 'description' }}
    />
  );
}
