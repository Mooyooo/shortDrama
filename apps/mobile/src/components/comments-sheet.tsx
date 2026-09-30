import { SymbolView } from 'expo-symbols';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';

type Props = {
  visible: boolean;
  episode: number;
  onClose: () => void;
};

// Comments need viewer accounts and moderation (report, block, filtering) on the server,
// which Apple requires for user posts. Until then the sheet says so plainly.
export function CommentsSheet({ visible, episode, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.four }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Comments · EP {episode}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <SymbolView name="xmark" size={18} tintColor="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>
        <View style={styles.empty}>
          <SymbolView
            name="bubble.left.and.bubble.right"
            size={40}
            tintColor="rgba(255,255,255,0.4)"
          />
          <Text style={styles.emptyTitle}>Comments are coming soon</Text>
          <Text style={styles.emptyText}>
            {"You'll be able to comment once viewer accounts are live."}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    padding: Spacing.four,
    minHeight: '45%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
  },
});
