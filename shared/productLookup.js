// Cart keys are matched without coercion, retaining Array.find's first result.
export const createProductLookup = products => {
  const byId = new Map();
  for (const product of products) {
    // Preserve lazy failure for null entries/holes in malformed historical catalogs.
    if (product == null) return id => products.find(item => item._id === id);
    const id = product._id;
    // Map treats NaN as equal to itself; strict equality never does.
    if (!Number.isNaN(id) && !byId.has(id)) byId.set(id, product);
  }
  return id => byId.get(id);
};
