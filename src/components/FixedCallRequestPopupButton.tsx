"use client";

import { LuckyFillButton, LuckyWeakButton } from "./LuckyButton";
import { useConsultationModal } from "./modal/ConsultationModalProvider";

export default function FixedCallRequestPopupButton() {
  const { open } = useConsultationModal();

  const handlePhoneClick = () => {
    if (typeof navigator !== "undefined" && !/Android|iPhone/i.test(navigator.userAgent)) {
      navigator.clipboard?.writeText("15517157");
      alert("전화번호가 복사되었습니다: 1551-7157");
      return;
    }

    window.open("tel:15517157");
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center pointer-events-none min-[1200px]:left-1/2 min-[1200px]:w-[480px] min-[1200px]:right-auto">
      <div className="relative w-full max-w-[480px]">
        <div className="flex w-full">
          <div className="pointer-events-auto flex-1">
            <LuckyWeakButton
              ariaLabel="전화상담"
              fullWidth
              onClick={handlePhoneClick}
              leadingContent={
                <img
                  src="/assets/icons/phone-fill.svg"
                  alt=""
                  aria-hidden="true"
                  className="h-8 w-8"
                />
              }
              sx={{
                minHeight: "90px",
                borderRadius: "0px",
                color: "#0049AB",
                fontSize: "22px",
                lineHeight: 1.3,
                "&:hover:not(:disabled), &:active:not(:disabled)": {
                  backgroundColor: "#D7EEFF",
                  color: "#0049AB",
                },
              }}
            >
              전화상담
            </LuckyWeakButton>
          </div>

          <div className="pointer-events-auto flex-1">
            <LuckyFillButton
              ariaLabel="창업문의"
              fullWidth
              onClick={open}
              leadingContent={
                <img
                  src="/assets/icons/message-fill.svg"
                  alt=""
                  aria-hidden="true"
                  className="h-8 w-8"
                />
              }
              sx={{
                minHeight: "90px",
                borderRadius: "0px",
                backgroundColor: "#0049AB",
                color: "#FFFFFF",
                fontSize: "22px",
                lineHeight: 1.3,
                "&:hover:not(:disabled), &:active:not(:disabled)": {
                  backgroundColor: "#09264C",
                },
              }}
            >
              창업문의
            </LuckyFillButton>
          </div>
        </div>
      </div>
    </div>
  );
}
