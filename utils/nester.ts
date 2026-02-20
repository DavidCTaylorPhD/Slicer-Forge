
import { Slice, Sheet, PlacedSlice, MaterialSettings } from '../types';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface NestResult {
    sheets: Sheet[];
    oversized: Slice[];
}

/**
 * A Bin represents a single material sheet.
 * Uses a Guillotine Packing algorithm with Best-Short-Side-Fit heuristic.
 */
class Bin {
  width: number;
  height: number;
  freeRects: Rect[];
  items: PlacedSlice[];
  sheetId: number;

  constructor(id: number, width: number, height: number) {
    this.sheetId = id;
    this.width = width;
    this.height = height;
    this.items = [];
    // Initial free space is the entire sheet
    this.freeRects = [{ x: 0, y: 0, width: width, height: height }];
  }

  /**
   * Scores how well a rectangle fits into the free spaces.
   * Lower score is better. Uses Best Short Side Fit (BSSF).
   */
  score(w: number, h: number): { score1: number; score2: number; rect: Rect } | null {
    let bestScore1 = Number.MAX_VALUE; // Primary score (Short Side Fit)
    let bestScore2 = Number.MAX_VALUE; // Secondary score (Long Side Fit)
    let bestRect: Rect | null = null;

    for (const rect of this.freeRects) {
      // Check if fits
      if (rect.width >= w && rect.height >= h) {
        const leftoverHoriz = Math.abs(rect.width - w);
        const leftoverVert = Math.abs(rect.height - h);
        const shortSideFit = Math.min(leftoverHoriz, leftoverVert);
        const longSideFit = Math.max(leftoverHoriz, leftoverVert);

        // Best Short Side Fit Rule: Minimize the smaller leftover dimension
        if (shortSideFit < bestScore1 || (shortSideFit === bestScore1 && longSideFit < bestScore2)) {
          bestScore1 = shortSideFit;
          bestScore2 = longSideFit;
          bestRect = rect;
        }
      }
    }

    if (bestRect) {
      return { score1: bestScore1, score2: bestScore2, rect: bestRect };
    }
    return null;
  }

  /**
   * Attempts to insert a slice into the bin.
   * Tries both normal and rotated orientations.
   */
  insert(slice: Slice, margin: number): boolean {
    // Effective dimensions including margin
    const w = slice.bounds.width + margin;
    const h = slice.bounds.height + margin;

    // 1. Check Normal Orientation
    const normalFit = this.score(w, h);
    
    // 2. Check Rotated Orientation
    const rotatedFit = this.score(h, w);

    // 3. Decide Best Fit
    let useRotated = false;
    let bestRect: Rect | null = null;
    
    if (normalFit && rotatedFit) {
       // Compare scores (Primary then Secondary)
       if (rotatedFit.score1 < normalFit.score1 || 
          (rotatedFit.score1 === normalFit.score1 && rotatedFit.score2 < normalFit.score2)) {
           useRotated = true;
           bestRect = rotatedFit.rect;
       } else {
           bestRect = normalFit.rect;
       }
    } else if (normalFit) {
        bestRect = normalFit.rect;
    } else if (rotatedFit) {
        useRotated = true;
        bestRect = rotatedFit.rect;
    }

    if (!bestRect) return false;

    // 4. Place Item
    // Determine visual dimensions and placement dimensions
    const placedW = useRotated ? h : w;
    const placedH = useRotated ? w : h;

    this.items.push({
      ...slice,
      x: bestRect.x, 
      y: bestRect.y,
      rotation: useRotated ? Math.PI / 2 : 0,
      sheetId: this.sheetId
    });

    // 5. Split the Free Rectangle (Guillotine Split)
    this.splitFreeRect(bestRect, placedW, placedH);
    
    return true;
  }

  /**
   * Splits the used rectangle into two smaller free rectangles.
   * Uses a heuristic to decide whether to split horizontally or vertically
   * to maximize the area of the remaining free spaces.
   */
  splitFreeRect(rect: Rect, w: number, h: number) {
      // Remove the rect we just used
      const idx = this.freeRects.indexOf(rect);
      if (idx > -1) this.freeRects.splice(idx, 1);

      // If perfect fit, no remainder
      if (w === rect.width && h === rect.height) return;

      const wRem = rect.width - w;
      const hRem = rect.height - h;

      let r1: Rect, r2: Rect;
      
      // Heuristic: "Shorter Axis Split" logic to maximize the bigger chunk.
      if (wRem > hRem) {
          r1 = { x: rect.x + w, y: rect.y, width: wRem, height: rect.height };
          r2 = { x: rect.x, y: rect.y + h, width: w, height: hRem };
      } else {
          r1 = { x: rect.x, y: rect.y + h, width: rect.width, height: hRem };
          r2 = { x: rect.x + w, y: rect.y, width: wRem, height: h };
      }

      if (r1.width > 0 && r1.height > 0) this.freeRects.push(r1);
      if (r2.width > 0 && r2.height > 0) this.freeRects.push(r2);
  }
}

export const nestSlices = (
  slices: Slice[],
  material: MaterialSettings,
  strategy: 'optimized' | 'sequential' = 'optimized'
): NestResult => {
  // 1. Unit Conversion
  const scaleFactor = material.unit === 'in' ? 25.4 : 1;
  const sheetWidth = material.width * scaleFactor;
  const sheetHeight = material.length * scaleFactor;
  const margin = 5; // 5mm margin between parts

  const oversized: Slice[] = [];
  const fittableSlices: Slice[] = [];

  // 2. Pre-Check Dimensions
  slices.forEach(slice => {
      const w = slice.bounds.width;
      const h = slice.bounds.height;
      
      // Safety: Filter out invalid geometry that might crash nesting or rendering
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
          console.warn(`Skipping invalid slice ${slice.id}`);
          return; 
      }

      // Check if it fits either normally or rotated
      const fitsNormal = (w + margin <= sheetWidth) && (h + margin <= sheetHeight);
      const fitsRotated = (h + margin <= sheetWidth) && (w + margin <= sheetHeight);

      if (!fitsNormal && !fitsRotated) {
          oversized.push(slice);
      } else {
          fittableSlices.push(slice);
      }
  });

  // 3. Sorting
  const sortedSlices = [...fittableSlices].sort((a, b) => {
      if (strategy === 'sequential') {
          return a.id - b.id;
      }
      // Default: Optimized (Area Descending)
      const areaA = a.bounds.width * a.bounds.height;
      const areaB = b.bounds.width * b.bounds.height;
      return areaB - areaA; 
  });

  const bins: Bin[] = [];
  const createBin = () => {
      const bin = new Bin(bins.length, sheetWidth, sheetHeight);
      bins.push(bin);
      return bin;
  };

  // 4. Packing
  sortedSlices.forEach(slice => {
      let placed = false;
      for (const bin of bins) {
          if (bin.insert(slice, margin)) {
              placed = true;
              break;
          }
      }

      if (!placed) {
          const newBin = createBin();
          if (!newBin.insert(slice, margin)) {
             console.error("Logic Error: Item deemed fittable but failed to pack in empty bin.");
             oversized.push(slice);
          }
      }
  });

  return {
      sheets: bins.map(bin => ({
          id: bin.sheetId,
          width: bin.width,
          height: bin.height,
          items: bin.items
      })),
      oversized
  };
};
