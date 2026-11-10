/** Property photo helpers shared by server and browser code. */

export const MEDIA_BUCKET = "property-media";
export const MAX_PHOTOS = 20;
export const MAX_INPUT_BYTES = 20 * 1024 * 1024; // what we accept from the camera roll, before resizing
export const FULL_EDGE = 1600; // longest edge of the stored photo
export const THUMB_EDGE = 480; // longest edge of the list thumbnail

/** Public URL for a stored photo path. */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${MEDIA_BUCKET}/${encoded}`;
}

/** Where a new photo for a property is stored. The database checks this shape. */
export function photoPaths(businessId: string, propertyId: string, id: string) {
  const base = `${businessId}/${propertyId}/${id}`;
  return { full: `${base}.jpg`, thumb: `${base}-thumb.jpg` };
}

/** Size that fits inside `edge` × `edge`, never enlarging. */
export function fitWithin(width: number, height: number, edge: number) {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
