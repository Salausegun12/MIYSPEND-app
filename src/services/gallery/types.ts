/**
 * A single receipt photo shown in the expense gallery. Everything a tile or
 * the photo viewer needs is captured here so screens never touch storage or
 * query the database again to render the list.
 */
export interface GalleryPhoto {
  /** Expense row id; also the stable key of the gallery item. */
  id: number;
  /** Absolute local URI of the stored photo file. */
  uri: string;
  /** YYYY-MM-DD date of the linked expense (the attachment date). */
  expenseDate: string;
  description: string;
  amountKobo: number;
  categoryName: string;
  paymentMethod: string;
  note: string;
}

/**
 * Verifies that a photo file still exists on the device. The on-device
 * checker is registered at startup by the gallery hook; tests register an
 * in-memory responder instead.
 */
export interface AttachmentExistence {
  exists(uri: string): boolean;
}