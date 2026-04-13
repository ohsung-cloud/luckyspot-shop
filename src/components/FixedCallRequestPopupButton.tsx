"use client";

import { useToast } from "@wanteddev/wds";
import { usePathname } from "next/navigation";

import { useCartStore } from "@/stores/cartStore";
import { LuckyFillButton, LuckyWeakButton } from "./LuckyButton";
import { useConsultationModal } from "./modal/ConsultationModalProvider";

export default function FixedCallRequestPopupButton() {
  const cartItems = useCartStore((state) => state.items);
  const cartItemCount = cartItems.length;
  const pathname = usePathname();
  const { open } = useConsultationModal();
  const toast = useToast();

  const handleOpen = () => {
    if (!cartItemCount) {
      toast({
        content: "장바구니에 담긴 상품이 없습니다.",
        duration: "short",
        variant: "normal",
      });

      return;
    }

    open();
  };

  if (pathname !== "/") {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center pointer-events-none min-[1200px]:left-1/2 min-[1200px]:w-[480px] min-[1200px]:right-auto">
      <div className="relative w-full max-w-[480px]">
        <div className="flex w-full">
          <div className="pointer-events-auto flex-1">
            <LuckyWeakButton
              ariaLabel={cartItemCount ? `장바구니 (${cartItemCount})` : "장바구니"}
              fullWidth
              onClick={handleOpen}
              sx={{
                minHeight: "90px",
                borderRadius: "0px",
                backgroundColor: "#E7F7FF",
                color: "#0049AB",
                fontSize: "22px",
                fontWeight: 600,
                lineHeight: 1.3,
                "&:hover:not(:disabled), &:active:not(:disabled)": {
                  backgroundColor: "#E7F7FF",
                  color: "#0049AB",
                },
              }}
            >
              {cartItemCount ? `장바구니 (${cartItemCount})` : "장바구니"}
            </LuckyWeakButton>
          </div>

          <div className="pointer-events-auto flex-1">
            <LuckyFillButton
              ariaLabel="구매하기"
              fullWidth
              onClick={handleOpen}
              sx={{
                minHeight: "90px",
                borderRadius: "0px",
                backgroundColor: "#0049AB",
                color: "#FFFFFF",
                fontSize: "22px",
                fontWeight: 600,
                lineHeight: 1.3,
                "&:hover:not(:disabled), &:active:not(:disabled)": {
                  backgroundColor: "#0049AB",
                },
              }}
            >
              구매하기
            </LuckyFillButton>
          </div>
        </div>
      </div>
    </div>
  );
}
