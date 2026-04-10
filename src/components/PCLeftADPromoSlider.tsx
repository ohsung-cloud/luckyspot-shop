"use client";

import Link from "next/link";
import { useId } from "react";
import { Autoplay, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";

const machineImageSrc = "/assets/images/inquiry/pc-left-ad-machine-v2.png";
const cardInstallmentImageSrc =
  "/assets/images/inquiry/pc-left-ad-card-installment.png";
const promotionHref = "/franchise-inquiry#promotion";
const promoSlides = [
  {
    type: "machine",
  },
  {
    type: "installment",
  },
] as const;

type PCLeftADPromoSliderProps = {
  slideHeight?: number;
};

function FirstPromoSlide() {
  return (
    <article
      className="relative h-full w-full overflow-hidden rounded-[12px] border border-ui-gray-200 bg-base-white px-[30px] py-6"
      aria-label="10호점까지 무인커피머신 700만원 할인 프로모션"
    >
      <div className="flex w-[157px] flex-col gap-1">
        <p className="text-[16px] font-normal leading-[27.2px] tracking-[0.16px] text-brand-300">
          10호점 까지
        </p>
        <div className="text-ui-gray-900">
          <p className="text-[28px] font-medium leading-[36.4px] tracking-[-0.6px]">
            무인커피머신
          </p>
          <p className="text-[28px] font-medium leading-[36.4px] tracking-[-0.6px]">
            700만원 할인
          </p>
        </div>
      </div>

      <img
        src={machineImageSrc}
        alt="프로모션 대상 무인커피머신"
        className="pointer-events-none absolute right-[47px] top-[37px] h-[153px] w-auto select-none"
        style={{ transform: "scaleX(-1)" }}
        loading="eager"
      />
    </article>
  );
}

function SecondPromoSlide() {
  return (
    <article
      className="relative h-full w-full overflow-hidden rounded-[12px] border border-ui-gray-200 bg-base-white px-[30px] py-6"
      aria-label="삼성카드 할부 월 75만원 분할납부 가능 프로모션"
    >
      <div className="flex w-[157px] flex-col gap-1">
        <p className="text-[16px] font-normal leading-[27.2px] tracking-[0.16px] text-brand-300">
          삼성카드 할부
        </p>
        <div className="text-brand-900">
          <p className="text-[28px] font-medium leading-[36.4px] tracking-[-0.6px]">
            월 75만원
          </p>
          <p className="text-[28px] font-medium leading-[36.4px] tracking-[-0.6px]">
            분할납부 가능
          </p>
        </div>
      </div>

      <img
        src={cardInstallmentImageSrc}
        alt="삼성카드 할부 프로모션 카드 이미지"
        className="pointer-events-none absolute right-[8px] top-[58px] h-[137px] w-auto rotate-[6.21deg] select-none"
        loading="lazy"
      />
    </article>
  );
}

export function PCLeftADPromoSlider({
  slideHeight = 200,
}: PCLeftADPromoSliderProps) {
  const paginationId = useId().replace(/:/g, "");
  const paginationClassName = `pc-left-ad-promo-pagination-${paginationId}`;

  return (
    <div
      className="relative overflow-hidden rounded-[8px]"
      aria-label="럭키스팟 프로모션 카드 슬라이더"
    >
      <Swiper
        modules={[Autoplay, Pagination]}
        slidesPerView={1}
        loop
        speed={450}
        grabCursor
        autoplay={{
          delay: 3000,
          disableOnInteraction: false,
          pauseOnMouseEnter: false,
        }}
        pagination={{
          el: `.${paginationClassName}`,
          clickable: true,
          bulletClass: "pc-left-ad-promo-bullet",
          bulletActiveClass: "pc-left-ad-promo-bullet-active",
          renderBullet: (index, className) =>
            `<button type="button" class="${className}" aria-label="프로모션 카드 ${index + 1}로 이동"></button>`,
        }}
      >
        {promoSlides.map((slide) => (
          <SwiperSlide key={slide.type}>
            <Link
              href={promotionHref}
              className="block h-full cursor-pointer"
              style={{ height: `${slideHeight}px` }}
              aria-label="창업 문의 페이지의 프로모션 섹션으로 이동"
            >
              {slide.type === "machine" ? (
                <FirstPromoSlide />
              ) : (
                <SecondPromoSlide />
              )}
            </Link>
          </SwiperSlide>
        ))}
      </Swiper>

      <div
        className={`${paginationClassName} pointer-events-auto absolute bottom-[24px] left-[30px] z-10 flex items-center gap-2`}
      />

      <style jsx global>{`
        .pc-left-ad-promo-bullet {
          display: block;
          height: 10px;
          width: 10px;
          flex-shrink: 0;
          margin: 0 !important;
          cursor: pointer;
          border: 0;
          border-radius: 9999px;
          background: #e7e7e7;
          padding: 0;
          transition:
            width 200ms ease,
            height 200ms ease,
            background-color 200ms ease;
        }

        .pc-left-ad-promo-bullet-active {
          height: 12px;
          width: 12px;
          background: #0049ab;
        }
      `}</style>
    </div>
  );
}
