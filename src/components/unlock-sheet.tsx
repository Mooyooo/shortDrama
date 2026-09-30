import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';

type Props = {
  visible: boolean;
  episodeNumber: number;
  coinPrice: number;
  onClose: () => void;
};

// Placeholder until the backend exists: coins, ads and VIP are decided server-side (Phase 3).
export function UnlockSheet({ visible, episodeNumber, coinPrice, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.three }]}>
        <Text style={styles.title}>Unlock episode {episodeNumber}</Text>
        <Text style={styles.subtitle}>Unlocking arrives with the coin wallet.</Text>
        <Option label={`Unlock for ${coinPrice} coins`} primary />
        <Option label="Watch an ad to unlock" />
        <Option label="Go VIP: every episode unlocked" />
        <Pressable onPress={onClose} style={styles.close}>
          <Text style={styles.closeLabel}>Not now</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function Option({ label, primary }: { label: string; primary?: boolean }) {
  return (
    <View style={[styles.option, primary && styles.optionPrimary]}>
      <Text style={styles.optionLabel}>{label}</Text>
      <Text style={styles.soon}>Coming soon</Text>
    </View>
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
    gap: Spacing.two,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginBottom: Spacing.two,
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.three,
    backgroundColor: '#2C2C2E',
    opacity: 0.6,
  },
  optionPrimary: {
    backgroundColor: '#FF3B5C',
  },
  optionLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  soon: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  close: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  closeLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
  },
});
