"use client";

import { useEffect, useState } from "react";

import { LuckyFillButton, LuckyWeakButton } from "@/components/LuckyButton";
import { useConsultationModal } from "./ConsultationModalProvider";

export default function ConsultationBottomSheet() {
  const { isOpen, close } = useConsultationModal();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setVisible(true));
      return;
    }

    setVisible(false);
  }, [isOpen]);

  const handleClose = () => {
    setVisible(false);
    window.setTimeout(() => {
      close();
    }, 300);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <div
        className="fixed inset-0 z-30"
        style={{
          backgroundColor: visible ? "rgba(0,0,0,0.4)" : "transparent",
          transition: "background-color 0.3s ease",
        }}
        onClick={handleClose}
      />

      <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center pointer-events-none min-[1200px]:left-1/2 min-[1200px]:w-[480px] min-[1200px]:right-auto">
        <div
          className="pointer-events-auto w-full max-w-[480px] bg-white"
          style={{
            borderTopLeftRadius: "28px",
            borderTopRightRadius: "28px",
            paddingBottom: "20px",
            transform: visible ? "translateY(0)" : "translateY(100%)",
            transition: "transform 0.3s ease",
          }}
        >
          <div className="flex justify-center pb-1 pt-3">
            <div className="h-1 w-10 rounded-full bg-gray-300" />
          </div>

          <div className="px-6 pb-4 pt-[21px]">
            <h2
              className="text-[22px] font-semibold leading-[1.3] text-[#171717]"
              style={{ fontFamily: "Paperozi, sans-serif" }}
            >
              shop 프로젝트에서도 같은
              <br />
              하단 문의 레이어를 바로 붙일 수 있어요
            </h2>
            <p className="mt-3 text-[16px] leading-[1.7] tracking-[0.16px] text-[#777777]">
              필요하면 여기서 실제 주문 문의 폼이나 고객센터 연결 흐름으로
              확장하면 됩니다.
            </p>
          </div>

          <div className="space-y-2 px-6 py-[10px]">
            <LuckyFillButton
              fullWidth
              onClick={() => {
                window.open("tel:15517157");
              }}
            >
              전화 연결하기
            </LuckyFillButton>

            <LuckyWeakButton fullWidth onClick={handleClose}>
              닫기
            </LuckyWeakButton>
          </div>
        </div>
      </div>
    </>
  );
}
