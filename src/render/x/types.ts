export type XMediaFit = 'contain' | 'cover';

export interface XMediaSlot {
  x: number;
  y: number;
  w: number;
  h: number;
  fit: XMediaFit;
  cornerRadius: number;
}

export interface XPostLayout {
  canvas: { width: number; height: number };
  mediaSlot: XMediaSlot;
  /** Content column width used for chrome (equals canvas.width for v1). */
  contentWidth: number;
  /** Horizontal padding inside the card. */
  padX: number;
  /** Measured/estimated vertical sections for chrome builders. */
  sections: {
    headerH: number;
    textH: number;
    mediaTop: number;
    quoteTop?: number;
    quoteH?: number;
  };
}
