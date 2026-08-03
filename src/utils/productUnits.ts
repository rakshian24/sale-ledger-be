type ProductUnitConfig = {
  name: string;
  defaultUnit: string;
  retailUnit?: string | null;
  unitsPerPurchaseUnit?: number | null;
};

export const getUnitsPerPurchaseUnit = (product: ProductUnitConfig) => {
  const configured = product.unitsPerPurchaseUnit ?? 1;
  if (configured > 1) return configured;
  if (!/^water\b/i.test(product.name)) return configured;

  const name = product.name
    .toLowerCase()
    .replace(/litres?|ltr/g, "l")
    .replace(/\s+/g, "");
  if (name.includes("500ml") || name.includes("1/2l") || name.includes("0.5l")) return 24;
  if (name.includes("2l")) return 9;
  if (name.includes("1l")) return 12;
  return configured;
};

export const getRetailUnit = (product: ProductUnitConfig) =>
  /^water\b/i.test(product.name)
    ? "bottle"
    : (product.retailUnit || product.defaultUnit).toLowerCase();

export const quantityToRetailUnits = (
  quantity: number,
  unit: string,
  product: ProductUnitConfig,
) => {
  const normalizedUnit = unit.toLowerCase();
  const retailUnit = getRetailUnit(product);
  const conversion = getUnitsPerPurchaseUnit(product);
  const isPurchaseUnit =
    normalizedUnit === "case" ||
    (normalizedUnit === product.defaultUnit.toLowerCase() &&
      normalizedUnit !== retailUnit);
  return isPurchaseUnit ? quantity * conversion : quantity;
};
