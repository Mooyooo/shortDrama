import { SymbolView } from 'expo-symbols';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import type { Episode } from '@/data/catalog';

const COLUMNS = 6;

type Props = {
  visible: boolean;
  title: string;
  episodes: Episode[];
  current: number;
  onSelect: (episodeNumber: number) => void;
  onClose: () => void;
};

export function EpisodeDrawer({ visible, title, episodes, current, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const cellSize = (width - Spacing.four * 2 - Spacing.two * (COLUMNS - 1)) / COLUMNS;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { maxHeight: height * 0.6, paddingBottom: insets.bottom }]}>
        <Text style={styles.title}>{title}</Text>
        <ScrollView contentContainerStyle={styles.grid}>
          {episodes.map((episode) => {
            const isCurrent = episode.number === current;
            return (
              <Pressable
                key={episode.number}
                onPress={() => onSelect(episode.number)}
                style={[
                  styles.cell,
                  { width: cellSize, height: cellSize },
                  isCurrent && styles.cellCurrent,
                ]}>
                <Text style={styles.cellLabel}>{episode.number}</Text>
                {!episode.free && (
                  <SymbolView
                    name="lock.fill"
                    size={10}
                    tintColor="rgba(255,255,255,0.6)"
                    style={styles.lock}
                  />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
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
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.two,
    backgroundColor: '#2C2C2E',
  },
  cellCurrent: {
    backgroundColor: '#FF3B5C',
  },
  cellLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  lock: {
    position: 'absolute',
    top: Spacing.one,
    right: Spacing.one,
  },
});
