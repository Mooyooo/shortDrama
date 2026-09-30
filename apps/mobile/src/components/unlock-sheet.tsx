import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import type { UnlockOutcome } from '@/data/source';

type Props = {
  visible: boolean;
  episodeNumber: number;
  coinPrice: number;
  // The viewer's balance; unknown on sample data.
  coins?: number;
  // Present when the API is connected: the server checks and charges the coins.
  onUnlock?: () => Promise<UnlockOutcome>;
  onClose: () => void;
};

export function UnlockSheet({
  visible,
  episodeNumber,
  coinPrice,
  coins,
  onUnlock,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const close = () => {
    setMessage(null);
    onClose();
  };

  const unlock = async () => {
    if (!onUnlock) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await onUnlock();
      if (result.ok) {
        close();
      } else if (result.reason === 'insufficient_coins') {
        setMessage(
          `You have ${result.coins} coins; this episode costs ${result.price}. Buying coins is coming soon.`,
        );
      } else {
        setMessage('Unlocking is not available yet.');
      }
    } catch {
      setMessage("Couldn't unlock right now. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.three }]}>
        <Text style={styles.title}>Unlock episode {episodeNumber}</Text>
        <Text style={styles.subtitle}>
          {coins === undefined
            ? 'Unlocking arrives with the coin wallet.'
            : `Your balance: ${coins} coins`}
        </Text>
        <Pressable
          disabled={!onUnlock || busy}
          onPress={unlock}
          style={({ pressed }) => [
            styles.option,
            styles.optionPrimary,
            !onUnlock && styles.optionDisabled,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.optionLabel}>Unlock for {coinPrice} coins</Text>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            !onUnlock && <Text style={styles.soon}>Coming soon</Text>
          )}
        </Pressable>
        {message && <Text style={styles.message}>{message}</Text>}
        <Option label="Watch an ad to unlock" />
        <Option label="Go VIP: every episode unlocked" />
        <Pressable onPress={close} style={styles.close}>
          <Text style={styles.closeLabel}>Not now</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function Option({ label }: { label: string }) {
  return (
    <View style={[styles.option, styles.optionDisabled]}>
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
    minHeight: 52,
    borderRadius: Spacing.three,
    backgroundColor: '#2C2C2E',
  },
  optionPrimary: {
    backgroundColor: '#FF3B5C',
  },
  optionDisabled: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.8,
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
  message: {
    color: '#FFC857',
    fontSize: 14,
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
