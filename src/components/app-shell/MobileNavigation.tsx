import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Sidebar } from '@/components/app-shell/Sidebar';
import { useAppTheme } from '@/contexts/theme-context';

type MobileNavigationProps = {
  visible: boolean;
  onClose: () => void;
};

export function MobileNavigation({ visible, onClose }: MobileNavigationProps) {
  const { colors } = useAppTheme();

  return (
    <Modal
      accessibilityViewIsModal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}>
      <SafeAreaView style={styles.modal}>
        <Pressable
          accessibilityLabel="Close navigation"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View style={[styles.menu, { backgroundColor: colors.sidebarBackground }]}>
          <Sidebar mobile onNavigate={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(9, 20, 39, 0.52)',
  },
  menu: {
    width: '88%',
    maxWidth: 360,
    height: '100%',

    ...Platform.select({
      web: { boxShadow: '8px 0 20px rgba(9, 20, 39, 0.2)' },
      ios: {
        shadowColor: '#091427',
        shadowOffset: { width: 8, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
      },
      android: { elevation: 16 },
      default: { elevation: 16 },
    }),
  },
});
