import type { ShopProduct } from "@/data/products";

type ShopProductImageProps = {
  product: Pick<ShopProduct, "imageAlt" | "imageSrc" | "imageVariant">;
};

export default function ShopProductImage({ product }: ShopProductImageProps) {
  if (product.imageVariant === "bag") {
    return (
      <div className="flex size-[125.5px] shrink-0 items-center justify-center rounded-[8px] bg-ui-gray-100 px-[10px] py-2">
        <img
          alt={product.imageAlt}
          className="h-[90px] w-[66px] object-contain"
          src={product.imageSrc}
        />
      </div>
    );
  }

  if (product.imageVariant === "icon") {
    return (
      <div className="flex size-[125px] shrink-0 items-center justify-center rounded-[8px] bg-white">
        <img
          alt={product.imageAlt}
          className="size-[82px] object-contain"
          src={product.imageSrc}
        />
      </div>
    );
  }

  if (product.imageVariant === "tile") {
    return (
      <div className="flex size-[125.5px] shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-ui-gray-100">
        <img
          alt={product.imageAlt}
          className="size-[125px] object-contain"
          src={product.imageSrc}
        />
      </div>
    );
  }

  return (
    <div className="flex size-[125px] shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-white">
      <img
        alt={product.imageAlt}
        className="size-full object-cover"
        src={product.imageSrc}
      />
    </div>
  );
}
