import type { ImageSourcePropType } from 'react-native';

/**
 * 使い方紹介（チュートリアル）モーダルの1枚分の定義。
 */
export type HowToUseSlide = {
  /** 一意なキー（FlatList / map 用） */
  key: string;
  /** 表示する画像（assets/images/howto/ 配下のローカル PNG） */
  image: ImageSourcePropType;
  /** アクセシビリティ用ラベル */
  accessibilityLabel: string;
};

/**
 * 全6枚のスライド構成。
 * ページ番号（X / 6 ページ）やナビゲーションボタンの最大枚数は、
 * この配列の長さから自動的に決まる。
 */
export const HOW_TO_USE_SLIDES: HowToUseSlide[] = [
  {
    key: 'howto_1',
    image: require('@/assets/images/howto/howto_1.png'),
    accessibilityLabel: '使い方 1ページ目',
  },
  {
    key: 'howto_2',
    image: require('@/assets/images/howto/howto_2.png'),
    accessibilityLabel: '使い方 2ページ目',
  },
  {
    key: 'howto_3',
    image: require('@/assets/images/howto/howto_3.png'),
    accessibilityLabel: '使い方 3ページ目',
  },
  {
    key: 'howto_4',
    image: require('@/assets/images/howto/howto_4.png'),
    accessibilityLabel: '使い方 4ページ目',
  },
  {
    key: 'howto_5',
    image: require('@/assets/images/howto/howto_5.png'),
    accessibilityLabel: '使い方 5ページ目',
  },
  {
    key: 'howto_6',
    image: require('@/assets/images/howto/howto_6.png'),
    accessibilityLabel: '使い方 6ページ目',
  },
];
