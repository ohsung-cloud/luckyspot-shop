import { LuckyOutlineButton } from "@/components/LuckyButton";
import { PCLeftADPromoSlider } from "@/components/PCLeftADPromoSlider";

const ASSET_PATH = "/assets/images/adsection";

const videoThumbnailSrc = `${ASSET_PATH}/video-thumbnail.png`;
const videoPlayIconSrc = `${ASSET_PATH}/video-play-icon.svg`;

const brochureHref =
  "https://drive.google.com/file/d/1xB8Vd_XhCI1Pto6SveNLONDIVXb0IX3X/view?usp=drive_link";
const shortsHref = "https://luckyspot.oopy.io/2681c5bd-037b-8045-8218-cc5127abe7ca";
const phoneHref = "tel:15517157";

export const PCLeftADSection = () => {
  return (
    <div className="flex min-h-[calc(100vh-48px)] w-full flex-col justify-end py-10 pr-[122px]">
      <div className="flex w-full flex-col gap-[200px]">
        <div className="flex w-[400px] flex-col gap-4">
          <p className="text-[20px] leading-[30px] font-normal text-ui-gray-600">
            26년 4월, 럭키스팟 가맹점 모집 시작
          </p>

          <a
            href={shortsHref}
            target="_blank"
            rel="noreferrer"
            className="group relative block overflow-hidden rounded-[8px] border border-ui-gray-200"
            aria-label="럭키스팟 사장님 채널 소개 영상으로 이동"
          >
            <img
              src={videoThumbnailSrc}
              alt="럭키스팟 사장님 채널 소개 영상 썸네일"
              className="block h-[225px] w-[400px] object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex size-[102.5px] items-center justify-center rounded-full bg-overlay-gray-900-50 backdrop-blur-[1.25px] transition-transform duration-200 group-hover:scale-[1.03]">
                <img
                  src={videoPlayIconSrc}
                  alt=""
                  aria-hidden="true"
                  className="size-[50px] translate-x-[5px]"
                />
              </div>
            </div>
          </a>

          <PCLeftADPromoSlider />

          <a
            href={phoneHref}
            className="flex h-[84px] w-[400px] items-center justify-between rounded-[12px] border border-ui-gray-200 bg-brand-100 px-[30px] py-6"
            aria-label="창업 및 제휴 문의 1551-7157로 전화하기"
          >
            <span className="text-[16px] font-normal leading-[27.2px] tracking-[0.16px] text-brand-300">
              창업 및 제휴 문의
            </span>
            <span className="text-[22px] font-semibold leading-[28.6px] text-brand-300">
              1551-7157
            </span>
          </a>
        </div>

        <div className="flex items-center gap-3">
          <LuckyOutlineButton
            href={brochureHref}
            target="_blank"
            rel="noreferrer"
            sx={{
              minHeight: "48px",
              paddingInline: "24px",
              borderRadius: "16px",
              fontSize: "16px",
              fontWeight: 400,
              lineHeight: "27.2px",
              letterSpacing: "0.16px",
            }}
          >
            럭키스팟 소개서 보기
          </LuckyOutlineButton>

          <LuckyOutlineButton
            href={shortsHref}
            target="_blank"
            rel="noreferrer"
            sx={{
              minHeight: "48px",
              paddingInline: "24px",
              borderRadius: "16px",
              fontSize: "16px",
              fontWeight: 400,
              lineHeight: "27.2px",
              letterSpacing: "0.16px",
            }}
          >
            사장님 채널
          </LuckyOutlineButton>
        </div>
      </div>
    </div>
  );
};
