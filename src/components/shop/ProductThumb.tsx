import type { ShopProduct } from "@/data/products";

const TONE: Record<string, string> = {
  bean: "from-[#EFE6D8] to-[#F8F4EC]",
  powder: "from-[#E6F2E7] to-[#F7FBF7]",
  syrup: "from-[#F3E9E3] to-[#FBF7F3]",
  cup: "from-[#E6EDF2] to-[#F5F9FB]",
  supply: "from-[#ECEDEE] to-[#F7F7F8]",
  furniture: "from-[#EFE9E1] to-[#F8F5F0]",
  plant: "from-[#E3EFE1] to-[#F3FAF1]",
  print: "from-[#EAEAEC] to-[#F6F6F7]",
};

/** 사진이 없는 품목은 규격을 큰 글자로 보여주는 타일로 대신한다(엉뚱한 사진을 쓰지 않는다). */
export default function ProductThumb({
  product,
  categoryKey,
}: {
  product: ShopProduct;
  categoryKey: string;
}) {
  if (product.imageSrc) {
    return (
      <div className="flex aspect-[3/2] w-full items-center justify-center overflow-hidden rounded-[10px] bg-[#F4F5F6]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={product.imageAlt ?? product.name}
          className="h-[80%] w-[80%] object-contain"
          src={product.imageSrc}
        />
      </div>
    );
  }

  const head = product.spec.split(/[·(]/)[0]?.trim() || product.unit;

  return (
    <div
      aria-hidden
      className={`flex aspect-[3/2] w-full items-center justify-center overflow-hidden rounded-[10px] bg-gradient-to-br ${
        TONE[categoryKey] ?? TONE.supply
      }`}
    >
      <span className="text-[21px] font-semibold leading-none tracking-[-0.05em] text-[#0F1412]/80">
        {head}
      </span>
    </div>
  );
}
