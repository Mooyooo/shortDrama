import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Episode } from '@/data/catalog';
import { useEpisodeUrl } from '@/data/hooks';

type Props = {
  episode: Episode;
  height: number;
  // Only the visible episode plays; neighbours stay mounted and paused so they buffer ahead.
  isActive: boolean;
  startAt?: number;
  onEnd: () => void;
  onProgress?: (seconds: number, duration: number) => void;
};

export function EpisodePlayer({
  episode,
  height,
  isActive,
  startAt = 0,
  onEnd,
  onProgress,
}: Props) {
  const [pausedByUser, setPausedByUser] = useState(false);
  const [wasActive, setWasActive] = useState(isActive);
  const [progress, setProgress] = useState(0);
  // With the API this fetches a signed link; the player starts once it arrives.
  const { data: url, error, reload } = useEpisodeUrl(episode, true);
  const player = useVideoPlayer(url ?? null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 1;
    p.currentTime = startAt;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  useEventListener(player, 'playToEnd', onEnd);
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (player.duration > 0) {
      setProgress(currentTime / player.duration);
      onProgress?.(currentTime, player.duration);
    }
  });

  // Swiping away clears a tap-to-pause, so coming back always plays.
  if (wasActive !== isActive) {
    setWasActive(isActive);
    if (!isActive) setPausedByUser(false);
  }

  useEffect(() => {
    if (isActive && !pausedByUser) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, pausedByUser, player]);

  return (
    <Pressable style={[styles.container, { height }]} onPress={() => setPausedByUser((v) => !v)}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />
      {error ? (
        <Pressable style={styles.center} onPress={reload}>
          <Text style={styles.errorText}>{"Couldn't load this episode. Tap to retry."}</Text>
        </Pressable>
      ) : null}
      {!error && (status === 'loading' || !url) && (
        <ActivityIndicator style={styles.center} color="#fff" size="large" />
      )}
      {pausedByUser && <Text style={[styles.center, styles.playIcon]}>▶</Text>}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#000',
  },
  center: {
    position: 'absolute',
    alignSelf: 'center',
    top: '45%',
  },
  errorText: {
    color: '#fff',
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  playIcon: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 64,
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  progressFill: {
    height: 3,
    backgroundColor: '#FF3B5C',
  },
});
