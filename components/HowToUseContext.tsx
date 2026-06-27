import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import { HowToUseModal } from '@/components/HowToUseModal';

type HowToUseContextValue = {
  /** 使い方モーダルを開く */
  openHowToUse: () => void;
  /** 使い方モーダルを閉じる */
  closeHowToUse: () => void;
  /** 表示中かどうか */
  isHowToUseVisible: boolean;
};

const HowToUseContext = createContext<HowToUseContextValue>({
  openHowToUse: () => {},
  closeHowToUse: () => {},
  isHowToUseVisible: false,
});

/**
 * 使い方モーダルの表示状態を一元管理するプロバイダ。
 * アプリのルートに1つ置くことで、どの画面（記録・分析・設定）からでも
 * `useHowToUse().openHowToUse()` で同じモーダルを呼び出せる。
 */
export function HowToUseProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);

  const openHowToUse = useCallback(() => setVisible(true), []);
  const closeHowToUse = useCallback(() => setVisible(false), []);

  const value = useMemo(
    () => ({ openHowToUse, closeHowToUse, isHowToUseVisible: visible }),
    [openHowToUse, closeHowToUse, visible],
  );

  return (
    <HowToUseContext.Provider value={value}>
      {children}
      <HowToUseModal visible={visible} onClose={closeHowToUse} />
    </HowToUseContext.Provider>
  );
}

export function useHowToUse() {
  return useContext(HowToUseContext);
}
