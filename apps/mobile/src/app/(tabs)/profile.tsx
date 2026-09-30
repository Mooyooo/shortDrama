import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useViewer } from '@/data/hooks';
import { deleteAccount } from '@/data/source';
import { invalidate } from '@/data/use-resource';
import { usingApi } from '@/lib/config';
import { clearLibrary } from '@/lib/library';

export default function ProfileScreen() {
  const viewer = useViewer();
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = () =>
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your coins, unlocked episodes, comments and watch history. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              clearLibrary();
              invalidate('');
              viewer.reload();
              Alert.alert('Account deleted', 'Your account and its data have been removed.');
            } catch {
              Alert.alert("Couldn't delete your account", 'Check your connection and try again.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Profile</ThemedText>

          {!usingApi ? (
            <ThemedText themeColor="textSecondary">
              Your wallet appears here once the app is connected to its server.
            </ThemedText>
          ) : viewer.loading ? (
            <ActivityIndicator />
          ) : viewer.error || !viewer.data ? (
            <Pressable onPress={viewer.reload}>
              <ThemedText themeColor="textSecondary">
                {"Couldn't load your profile. Tap to retry."}
              </ThemedText>
            </Pressable>
          ) : (
            <>
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="small" themeColor="textSecondary">
                  Coins
                </ThemedText>
                <ThemedText type="title">{viewer.data.coins}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Buying coins and VIP are coming soon.
                </ThemedText>
              </ThemedView>

              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="small" themeColor="textSecondary">
                  {viewer.data.isGuest ? 'Guest account' : 'Account'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Viewer ID (for support)
                </ThemedText>
                <ThemedText type="code" selectable>
                  {viewer.data.id}
                </ThemedText>
              </ThemedView>

              <View style={styles.danger}>
                <Pressable
                  onPress={confirmDelete}
                  disabled={deleting}
                  style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
                  {deleting ? (
                    <ActivityIndicator />
                  ) : (
                    <ThemedText type="smallBold" style={styles.deleteLabel}>
                      Delete account
                    </ThemedText>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.five,
    gap: Spacing.three,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
  danger: {
    marginTop: Spacing.four,
  },
  deleteButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  deleteLabel: {
    color: '#FF3B30',
  },
  pressed: {
    opacity: 0.7,
  },
});
