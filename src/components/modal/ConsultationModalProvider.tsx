"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type Ctx = {
  isOpen: boolean;
  close: () => void;
  open: () => void;
};

const ConsultationModalContext = createContext<Ctx | null>(null);

export function ConsultationModalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ isOpen, open, close }),
    [close, isOpen, open]
  );

  return (
    <ConsultationModalContext.Provider value={value}>
      {children}
    </ConsultationModalContext.Provider>
  );
}

export function useConsultationModal() {
  const ctx = useContext(ConsultationModalContext);
  if (!ctx)
    throw new Error(
      "useConsultationModal must be used within ConsultationModalProvider"
    );
  return ctx;
}
