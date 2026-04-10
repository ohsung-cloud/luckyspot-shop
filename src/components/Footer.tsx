"use client";

import React from "react";

type FooterProps = {
  className?: string;
  instagramHref?: string;
  kakaoHref?: string;
  naverHref?: string;
  privacyHref?: string;
  termsHref?: string;
};

const defaultLinks = {
  instagram: "https://www.instagram.com/luckyspot_official/",
  kakao: "http://pf.kakao.com/_gqsfn/chat",
  naver: "http://cafe.naver.com/cafeluckyspot",
  privacy: "https://luckyspot.oopy.io/",
  terms: "https://luckyspot.oopy.io/",
} as const;

const bodyMdClassName =
  'font-paper text-[16px] font-normal leading-[1.7] tracking-[0.16px]';
const bodySmClassName =
  'font-paper text-[14px] font-normal leading-[1.7] tracking-[0.14px]';

const socialItems = [
  {
    key: "kakao",
    label: "카카오톡",
    icon: "/assets/images/footer/icn-kakao.svg",
  },
  {
    key: "naver",
    label: "네이버",
    icon: "/assets/images/footer/icn-naver.svg",
  },
  {
    key: "instagram",
    label: "인스타그램",
    icon: "/assets/images/footer/icn-instagram.svg",
  },
] as const;

export function Footer({
  className,
  instagramHref = defaultLinks.instagram,
  kakaoHref = defaultLinks.kakao,
  naverHref = defaultLinks.naver,
  privacyHref = defaultLinks.privacy,
  termsHref = defaultLinks.terms,
}: FooterProps) {
  const socialHrefs = {
    kakao: kakaoHref,
    naver: naverHref,
    instagram: instagramHref,
  } as const;

  return (
    <footer
      className={`overflow-hidden bg-white px-6 py-24 text-ui-gray-600 pb-[114px] ${className ?? ""}`}
    >
      <div className="flex flex-col">
        <section className="min-h-[170px]">
          <h2 className={bodyMdClassName}>고객센터</h2>
          <div className={`mt-6 ${bodySmClassName}`}>
            <p>운영시간: 평일 08:00 - 19:00</p>
            <p>(점심시간 12:00~13:00 미운영 / 주말 및 공휴일 휴무)</p>
            <p>전화: 1551-7157</p>
            <p>이메일: help@tychecompany.com</p>
          </div>
        </section>

        <section className="min-h-[129.35px]">
          <p className={bodyMdClassName}>
            Copyright ⓒ Lucky Spot. All Rights Reserved
          </p>
          <div className={`mt-[18px] max-w-[381px] ${bodySmClassName}`}>
            <p>사업자등록번호 : 202-03-08439 | 대표 : 권오성</p>
            <p>서울특별시 강남구 선릉로 714, 102호 보람빌딩</p>
          </div>
        </section>

        <section className="min-h-[100px]">
          <p className={bodyMdClassName}>럭키스팟 기본약관</p>
          <div className="mt-[14px]">
            <div
              className={`flex flex-wrap items-center gap-x-10 gap-y-2 ${bodySmClassName}`}
            >
              <a
                href={termsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-300 underline decoration-solid underline-offset-2 transition-opacity hover:opacity-80"
              >
                서비스 이용약관
              </a>
              <a
                href={privacyHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-300 underline decoration-solid underline-offset-2 transition-opacity hover:opacity-80"
              >
                개인정보 처리방침
              </a>
            </div>
          </div>
        </section>

        <section className="flex h-[42px] items-start gap-[8.4px]">
          {socialItems.map((item) => (
            <a
              key={item.key}
              href={socialHrefs[item.key]}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={item.label}
              className="block h-[37.8px] w-[37.8px] opacity-70 transition-opacity hover:opacity-100"
            >
              <img
                src={item.icon}
                alt=""
                aria-hidden="true"
                className="h-full w-full"
              />
            </a>
          ))}
        </section>
      </div>
    </footer>
  );
}

export type { FooterProps };
