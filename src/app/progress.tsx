import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export default function ProgressScreen() {
  return (
    <PlaceholderScreen
      title="Progress"
      description="Your learning analytics will appear here."
      icon={{ ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' }}
    />
  );
}
