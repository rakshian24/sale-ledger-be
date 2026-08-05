export const getDairyLitres = (
  categoryName: string,
  productName: string,
  quantity: number,
  unit: string,
) => {
  if (
    categoryName.trim().toLocaleLowerCase("en-IN") !== "dairy" ||
    unit.trim().toLocaleLowerCase("en-IN") !== "packets"
  ) {
    return null;
  }

  const volumeMatch = productName.match(/\b(200|500)\s*ml\b/i);
  if (!volumeMatch) return null;

  return quantity * (Number(volumeMatch[1]) / 1000);
};
