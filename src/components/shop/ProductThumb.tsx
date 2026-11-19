import type { ShopProduct } from "@/data/products";

const TONE: Record<string, string> = {
  bean: "from-[#EFE6D8] to-[#F7F3EA]",
  powder: "from-[#E8F3E9] to-[#F6FBF6]",
  syrup: "from-[#F3E9E3] to-[#FBF6F2]",
  cup: "from-[#E7EEF3] to-[#F5F9FB]",
  supply: "from-[#EDEDEF] to-[#F7F7F8]",
  furniture: "from-[#EFE9E1] to-[#F8F5F0]",
  plant: "from-[#E4EFE2] to-[#F3FAF1]",
  print: "from-[#EBEBED] to-[#F6F6F7]",
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
      <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-[12px] bg-[#F4F5F6]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={product.imageAlt ?? product.name}
          className="h-[78%] w-[78%] object-contain"
          src={product.imageSrc}
        />
      </div>
    );
  }

  const head = product.spec.split(/[·(]/)[0]?.trim() || product.unit;

  return (
    <div
      aria-hidden
      className={`flex aspect-[4/3] w-full flex-col justify-between overflow-hidden rounded-[12px] bg-gradient-to-br p-2.5 ${
        TONE[categoryKey] ?? TONE.supply
      }`}
    >
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#6b746d]">
        {product.vendor}
      </span>
      <span className="text-[17px] font-semibold leading-none tracking-[-0.04em] text-[#0F1412]">
        {head}
      </span>
    </div>
  );
}
