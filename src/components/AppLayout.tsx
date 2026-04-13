import React from "react";
import FixedCallRequestPopupButton from "./FixedCallRequestPopupButton";
import ConsultationBottomSheet from "./modal/ConsultationBottomSheet";

type Props = {
  left?: React.ReactNode;
  center: React.ReactNode;
  right?: React.ReactNode;
  floating?: React.ReactNode;
  className?: string;
};

export default function AppLayout({
  left,
  center,
  right,
  floating,
  className,
}: Props) {
  return (
    <div className={`layout-stage ${className ?? ""}`}>
      <div className="relative mx-auto min-h-screen max-w-[1680px]">
        <div className="flex min-h-screen justify-center">
          {/* table 이하 사이즈는 display none */}
          <aside className="desktop-side-panel hidden h-[calc(100vh-48px)] w-[480px] shrink-0 self-start justify-end px-0 py-6 lg:sticky lg:top-6 lg:flex">
            <div className="w-full items-end">
              {left}
              {floating ? <div className="mt-4">{floating}</div> : null}
            </div>
          </aside>

          <div className="w-full md:min-w-[480px] md:max-w-[480px] ">
            <div className="content-container app-layout-content">
              {center}
              <div className="app-layout-fixed-call-button">
                <FixedCallRequestPopupButton />
              </div>
              <ConsultationBottomSheet />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
