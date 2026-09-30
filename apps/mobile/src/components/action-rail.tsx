import * as Linking from 'expo-linking';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { likeKey, toggleLiked, toggleSaved, useLibrary } from '@/lib/library';

type Props = {
  seriesId: string;
  seriesTitle: string;
  episode: number;
  onComments: () => void;
};

// The DramaBox-style column on the right edge of a playing episode: like, save, comments, share.
export function ActionRail({ seriesId, seriesTitle, episode, onComments }: Props) {
  const library = useLibrary();
  const liked = library.likes.includes(likeKey(seriesId, episode));
  const saved = library.saved.includes(seriesId);

  const share = () => {
    // Opens this exact episode. In Expo Go this is an exp:// link; in the real app, shortdrama://.
    const url = Linking.createURL(`/watch/${seriesId}`, { queryParams: { ep: String(episode) } });
    Share.share({ message: `Watch "${seriesTitle}", episode ${episode}: ${url}`, url }).catch(
      () => {},
    );
  };

  return (
    <View style={styles.rail} pointerEvents="box-none">
      <Action
        icon={liked ? 'heart.fill' : 'heart'}
        tint={liked ? '#FF3B5C' : '#fff'}
        label={liked ? 'Liked' : 'Like'}
        onPress={() => toggleLiked(seriesId, episode)}
      />
      <Action
        icon={saved ? 'bookmark.fill' : 'bookmark'}
        tint={saved ? '#FFC857' : '#fff'}
        label={saved ? 'Saved' : 'Save'}
        onPress={() => toggleSaved(seriesId)}
      />
      <Action icon="bubble.right" label="Comments" onPress={onComments} />
      <Action icon="arrowshape.turn.up.right" label="Share" onPress={share} />
    </View>
  );
}

function Action({
  icon,
  label,
  tint = '#fff',
  onPress,
}: {
  icon: SymbolViewProps['name'];
  label: string;
  tint?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <SymbolView name={icon} size={30} tintColor={tint} style={styles.icon} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Positioned by the screen that shows it.
  rail: {
    marginRight: Spacing.two,
    gap: Spacing.four,
    alignItems: 'center',
  },
  action: {
    alignItems: 'center',
    gap: Spacing.one,
    minWidth: 56,
  },
  icon: {
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  label: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },
  pressed: {
    opacity: 0.6,
  },
});
