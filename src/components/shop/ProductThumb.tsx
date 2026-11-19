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

const BOILERPLATE =
  /(더캐럿|매일쓰는|찐찐|아이스크림맛|크림라떼|제로슈가|허니|파우더|베이스|시럽|원두|용지|화분|세트)/g;

/** 품목 이름에서 타일용 짧은 이름을 만든다. (예: "매일쓰는 초코 파우더" → "초코") */
function shortName(name: string) {
  return name
    .replace(/\([^)]*\)/g, " ")
    .replace(BOILERPLATE, " ")
    .replace(/[0-9,.]+(kg|g|ml|매|개|EA|파이|온즈)?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 사진이 없는 품목은 규격·이름을 글자로 보여주는 타일로 대신한다(엉뚱한 사진을 쓰지 않는다). */
export default function ProductThumb({
  product,
  categoryKey,
}: {
  product: ShopProduct;
  categoryKey: string;
}) {
  if (product.imageSrc) {
    return (
      <div className="flex h-[92px] w-full items-center justify-center overflow-hidden rounded-[10px] bg-[#F4F5F6]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={product.imageAlt ?? product.name}
          className="h-[82%] w-[82%] object-contain"
          src={product.imageSrc}
        />
      </div>
    );
  }

  const head = product.spec.split(/[·(]/)[0]?.trim() || product.unit;
  // 이름이 짧은 파우더·시럽·원두만 이름을 함께 보여준다(긴 이름은 잘려서 오히려 헷갈린다).
  const showFlavor = categoryKey === "powder" || categoryKey === "syrup" || categoryKey === "bean";
  const flavor = showFlavor ? shortName(product.name).slice(0, 8) : "";

  return (
    <div
      aria-hidden
      className={`flex h-[92px] w-full flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[10px] bg-gradient-to-br px-2 ${
        TONE[categoryKey] ?? TONE.supply
      }`}
    >
      <span className="text-[17px] font-semibold leading-none tracking-[-0.04em] text-[#0F1412]/85">
        {head}
      </span>
      {flavor ? (
        <span className="max-w-full truncate text-[10.5px] font-medium leading-none text-[#3B4740]/70">
          {flavor}
        </span>
      ) : null}
    </div>
  );
}
