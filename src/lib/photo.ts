/** A Wikimedia photo, fetched through the notebook's own server (see /api/img). */
export function photo(url: string | undefined, width?: number) {
  if (!url) return undefined;
  const sized = width ? url.replace(/width=\d+/, `width=${width}`) : url;
  return `/api/img?u=${encodeURIComponent(sized)}`;
}
