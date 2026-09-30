import type { EpisodeComment, ReportReason } from '@shortdrama/shared';
import Storage from 'expo-sqlite/kv-store';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import type { Episode } from '@/data/catalog';
import {
  blockUser,
  commentsAvailable,
  deleteComment,
  fetchComments,
  postComment,
  reportComment,
} from '@/data/source';

type Props = {
  visible: boolean;
  // null while the episode is still loading (the feed fetches it when comments open).
  episode: Episode | null;
  episodeNumber: number;
  onClose: () => void;
};

// Apple guideline 1.2: before posting, viewers agree to rules with zero tolerance for abuse.
const RULES_KEY = 'comment-rules.v1';
const RULES =
  'No harassment, hate, sexual content, spam or links. Comments that break these rules are ' +
  'removed, and accounts that keep breaking them are banned.';

const MAX_LENGTH = 500;

export function CommentsSheet({ visible, episode, episodeNumber, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.two }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Comments · EP {episodeNumber}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <SymbolView name="xmark" size={18} tintColor="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>
        {!commentsAvailable ? (
          <ComingSoon />
        ) : visible && episode ? (
          <Thread episode={episode} />
        ) : (
          <View style={styles.empty}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ComingSoon() {
  return (
    <View style={styles.empty}>
      <SymbolView name="bubble.left.and.bubble.right" size={40} tintColor="rgba(255,255,255,0.4)" />
      <Text style={styles.emptyTitle}>Comments are coming soon</Text>
      <Text style={styles.emptyText}>
        {"You'll be able to comment once the app is connected to its server."}
      </Text>
    </View>
  );
}

function Thread({ episode }: { episode: Episode }) {
  const [comments, setComments] = useState<EpisodeComment[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchComments(episode).then(
      (page) => {
        if (cancelled) return;
        setComments(page.comments);
        setNextBefore(page.nextBefore);
      },
      () => !cancelled && setLoadError(true),
    );
    return () => {
      cancelled = true;
    };
  }, [episode]);

  const loadMore = async () => {
    if (!nextBefore) return;
    const page = await fetchComments(episode, nextBefore).catch(() => null);
    if (!page) return;
    setComments((current) => [...(current ?? []), ...page.comments]);
    setNextBefore(page.nextBefore);
  };

  const agreeToRules = () =>
    new Promise<boolean>((resolve) => {
      if (Storage.getItemSync(RULES_KEY) === 'agreed') return resolve(true);
      Alert.alert('Community rules', RULES, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'I agree',
          onPress: () => {
            Storage.setItemSync(RULES_KEY, 'agreed');
            resolve(true);
          },
        },
      ]);
    });

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    if (!(await agreeToRules())) return;
    setSending(true);
    setNotice(null);
    try {
      const comment = await postComment(episode, body);
      setComments((current) => [comment, ...(current ?? [])]);
      setDraft('');
    } catch (err) {
      setNotice(postErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const remove = (id: string) =>
    setComments((current) => current?.filter((c) => c.id !== id) ?? null);

  const openMenu = (comment: EpisodeComment) => {
    if (comment.isMine) {
      Alert.alert('Your comment', undefined, [
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            deleteComment(comment.id).then(
              () => remove(comment.id),
              () => {},
            ),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    Alert.alert(comment.author.name, undefined, [
      { text: 'Report comment', onPress: () => chooseReportReason(comment) },
      {
        text: `Block ${comment.author.name}`,
        style: 'destructive',
        onPress: () =>
          blockUser(comment.author.id).then(
            () => {
              // Their comments disappear from this viewer's list right away.
              setComments(
                (current) => current?.filter((c) => c.author.id !== comment.author.id) ?? null,
              );
            },
            () => {},
          ),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const chooseReportReason = (comment: EpisodeComment) => {
    const report = (reason: ReportReason) =>
      reportComment(comment.id, reason).then(
        () => {
          remove(comment.id);
          setNotice('Thanks. We review reports within 24 hours.');
        },
        () => setNotice("Couldn't send the report. Try again."),
      );
    Alert.alert('Why are you reporting this?', undefined, [
      { text: 'Spam', onPress: () => report('spam') },
      { text: 'Harassment or hate', onPress: () => report('abuse') },
      { text: 'Sexual content', onPress: () => report('sexual') },
      { text: 'Spoiler', onPress: () => report('spoiler') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <>
      {comments === null ? (
        <View style={styles.empty}>
          {loadError ? (
            <Text style={styles.emptyText}>{"Couldn't load comments."}</Text>
          ) : (
            <ActivityIndicator color="#fff" />
          )}
        </View>
      ) : (
        <FlatList
          data={comments}
          keyExtractor={(c) => c.id}
          style={styles.list}
          contentContainerStyle={comments.length === 0 ? styles.emptyList : styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>Be the first to comment.</Text>}
          onEndReached={loadMore}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              onLongPress={() => openMenu(item)}
              style={styles.comment}
              accessibilityHint="Long-press for report, block or delete">
              <View style={styles.commentHead}>
                <Text style={styles.author}>
                  {item.isMine ? 'You' : item.author.name} · {timeAgo(item.createdAt)}
                </Text>
                <Pressable onPress={() => openMenu(item)} hitSlop={12} accessibilityLabel="More">
                  <SymbolView name="ellipsis" size={16} tintColor="rgba(255,255,255,0.5)" />
                </Pressable>
              </View>
              <Text style={styles.body}>{item.body}</Text>
            </Pressable>
          )}
        />
      )}
      {notice && <Text style={styles.notice}>{notice}</Text>}
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Add a comment"
          placeholderTextColor="rgba(255,255,255,0.4)"
          style={styles.input}
          maxLength={MAX_LENGTH}
          multiline
        />
        <Pressable
          onPress={send}
          disabled={!draft.trim() || sending}
          style={({ pressed }) => [
            styles.send,
            (!draft.trim() || sending) && styles.sendDisabled,
            pressed && styles.pressed,
          ]}
          accessibilityLabel="Send">
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <SymbolView name="arrow.up" size={18} tintColor="#fff" />
          )}
        </Pressable>
      </View>
    </>
  );
}

function postErrorMessage(err: unknown) {
  const error = (err as { body?: { error?: string } }).body?.error;
  switch (error) {
    case 'profanity':
      return 'Please keep it friendly.';
    case 'link':
      return "Links aren't allowed in comments.";
    case 'slow_down':
      return "You're commenting too fast. Try again in a minute.";
    case 'banned':
      return "You can't comment right now.";
    case 'too_long':
      return 'Comments can be up to 500 characters.';
    default:
      return "Couldn't post your comment. Try again.";
  }
}

function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
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
    height: '65%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  emptyList: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comment: {
    gap: Spacing.one,
  },
  commentHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  author: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '600',
  },
  body: {
    color: '#fff',
    fontSize: 15,
  },
  notice: {
    color: '#FFC857',
    fontSize: 13,
    paddingVertical: Spacing.one,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    maxHeight: 100,
    backgroundColor: '#2C2C2E',
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingTop: 10,
    paddingBottom: 10,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B5C',
  },
  sendDisabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.7,
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
