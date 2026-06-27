import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HOW_TO_USE_SLIDES } from '@/constants/howToUseSlides';

type HowToUseModalProps = {
  visible: boolean;
  onClose: () => void;
};

const TOTAL = HOW_TO_USE_SLIDES.length;

/**
 * 全6枚の画像をスワイプ／タップでめくれる「使い方紹介」モーダル。
 * - カルーセルが画面全体を占有し、画像を端末いっぱいに表示する。
 * - ページ番号・閉じる・戻る/次への各ボタンは前面の透過オーバーレイとして重ねる。
 */
export function HowToUseModal({ visible, onClose }: HowToUseModalProps) {
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [index, setIndex] = useState(0);

  // モーダルを開くたびに先頭ページへ戻す
  useEffect(() => {
    if (visible) {
      setIndex(0);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x: 0, animated: false });
      });
    }
  }, [visible]);

  // 画面サイズが変わった場合（回転など）も現在ページの位置を保つ
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: index * screenWidth, animated: false });
  }, [screenWidth, index]);

  const goToPage = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(TOTAL - 1, next));
      setIndex(clamped);
      scrollRef.current?.scrollTo({ x: clamped * screenWidth, animated: true });
    },
    [screenWidth],
  );

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (screenWidth <= 0) return;
      const next = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
      setIndex(Math.max(0, Math.min(TOTAL - 1, next)));
    },
    [screenWidth],
  );

  const isFirst = index === 0;
  const isLast = index === TOTAL - 1;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* 画像カルーセル（画面全体を占有・横スワイプ） */}
        <ScrollView
          ref={scrollRef}
          style={StyleSheet.absoluteFill}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleMomentumEnd}
          scrollEventThrottle={16}
        >
          {HOW_TO_USE_SLIDES.map((slide) => (
            <View
              key={slide.key}
              style={[styles.page, { width: screenWidth, height: screenHeight }]}
            >
              <Image
                source={slide.image}
                style={{ width: screenWidth, height: screenHeight }}
                resizeMode="contain"
                accessibilityRole="image"
                accessibilityLabel={slide.accessibilityLabel}
              />
            </View>
          ))}
        </ScrollView>

        {/* 右上オーバーレイ: 閉じる（✕） */}
        <View
          style={[styles.topBar, { paddingTop: insets.top + 8 }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="使い方を閉じる"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* 下部オーバーレイ: 左=戻る / 中央=ページ数 / 右=次へ（最終ページは閉じる） */}
        <View
          style={[styles.bottomControls, { paddingBottom: insets.bottom + 12 }]}
          pointerEvents="box-none"
        >
          <View style={styles.navRow} pointerEvents="box-none">
            {/* 左: 戻る（1ページ目のみ非表示） */}
            <View style={[styles.navSlot, styles.navSlotLeft]} pointerEvents="box-none">
              {!isFirst ? (
                <TouchableOpacity
                  style={styles.navButton}
                  onPress={() => goToPage(index - 1)}
                  accessibilityRole="button"
                  accessibilityLabel="前のページに戻る"
                >
                  <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
                  <Text style={styles.navButtonText}>戻る</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* 中央: ページ番号バッジ */}
            <View style={styles.pageIndicatorBadge}>
              <Text style={styles.pageIndicatorText}>
                {index + 1} / {TOTAL} ページ
              </Text>
            </View>

            {/* 右: 次へ（最終ページでは閉じる） */}
            <View style={[styles.navSlot, styles.navSlotRight]} pointerEvents="box-none">
              {isLast ? (
                <TouchableOpacity
                  style={styles.navButton}
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="使い方を閉じる"
                >
                  <Text style={styles.navButtonText}>閉じる</Text>
                  <Ionicons name="close" size={22} color="#FFFFFF" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.navButton}
                  onPress={() => goToPage(index + 1)}
                  accessibilityRole="button"
                  accessibilityLabel="次のページへ進む"
                >
                  <Text style={styles.navButtonText}>次へ</Text>
                  <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  page: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingTop: 6,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  navSlot: {
    flex: 1,
  },
  navSlotLeft: {
    alignItems: 'flex-start',
  },
  navSlotRight: {
    alignItems: 'flex-end',
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 18,
  },
  navButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginHorizontal: 4,
  },
  pageIndicatorBadge: {
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageIndicatorText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
