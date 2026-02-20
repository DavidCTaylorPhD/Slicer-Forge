
import * as THREE from 'three';
import { Slice, Axis } from '../types';

/**
 * Splits a slice into two pieces along the center of its longest overflowing axis.
 * Uses a sawtooth/zigzag pattern for the cut to create a jointed fit.
 */
export const splitSlice = (slice: Slice, axis: Axis, maxW: number, maxH: number): Slice[] => {
    // 1. Determine Split Axis and Position
    const width = slice.bounds.width;
    const height = slice.bounds.height;

    let splitAxis: 'u' | 'v' = 'u';
    let splitPos = 0;

    if (width > maxW) {
        splitAxis = 'u';
        splitPos = slice.bounds.minX + width / 2;
    } else if (height > maxH) {
        splitAxis = 'v';
        splitPos = slice.bounds.minY + height / 2;
    } else {
        if (width > height) {
            splitAxis = 'u';
            splitPos = slice.bounds.minX + width / 2;
        } else {
            splitAxis = 'v';
            splitPos = slice.bounds.minY + height / 2;
        }
    }

    // 2. Define the Joint Pattern Function
    const getSplitOffset = (pos: number) => {
        const wavelength = 20;
        const amplitude = 4; 
        // Ensure positive phase for continuity across 0
        let phase = (pos % wavelength) / wavelength;
        if (phase < 0) phase += 1;
        
        // Triangle wave
        if (phase < 0.5) {
            return amplitude * (4 * phase - 1);
        } else {
            return amplitude * (3 - 4 * phase);
        }
    };

    // 3. Perform Clipping (Modified Sutherland-Hodgman)
    const get2D = (v: THREE.Vector3): {u: number, v: number} => {
        if (axis === Axis.Z) return { u: v.x, v: v.y };
        if (axis === Axis.Y) return { u: v.x, v: v.z };
        return { u: v.y, v: v.z }; 
    };

    const get3D = (u: number, v: number): THREE.Vector3 => {
        if (axis === Axis.Z) return new THREE.Vector3(u, v, slice.zHeight);
        if (axis === Axis.Y) return new THREE.Vector3(u, slice.zHeight, v);
        return new THREE.Vector3(slice.zHeight, u, v); 
    };

    const contours2D = slice.contours.map(c => c.map(p => get2D(p)));

    const findIntersection = (p1: {u: number, v: number}, p2: {u: number, v: number}, axis: 'u'|'v', split: number): {u: number, v: number} => {
        const x1 = axis === 'u' ? p1.u : p1.v;
        const y1 = axis === 'u' ? p1.v : p1.u;
        const x2 = axis === 'u' ? p2.u : p2.v;
        const y2 = axis === 'u' ? p2.v : p2.u;
        
        // CRITICAL FIX: Prevent division by zero or unstable math if segment is parallel to split
        if (Math.abs(x2 - x1) < 1e-5) {
            // Use the split boundary + wave offset at the midpoint y
            const midY = (y1 + y2) / 2;
            const waveOffset = getSplitOffset(midY);
            const val = split + waveOffset;
            return axis === 'u' ? { u: val, v: midY } : { u: midY, v: val };
        }
        
        let t = (split - x1) / (x2 - x1);
        // Clamp t to handle floating point overshoots
        t = Math.max(0, Math.min(1, t));

        const intersectY = y1 + t * (y2 - y1);
        const waveOffset = getSplitOffset(intersectY);
        
        const finalVal = split + waveOffset;
        const finalPerp = intersectY;

        return axis === 'u' ? { u: finalVal, v: finalPerp } : { u: finalPerp, v: finalVal };
    };

    const clipPoly = (poly: {u: number, v: number}[], keepLeft: boolean): {u: number, v: number}[] => {
        const output: {u: number, v: number}[] = [];
        
        if (poly.length === 0) return [];

        for (let i = 0; i < poly.length; i++) {
            const curr = poly[i];
            const prev = poly[(i + poly.length - 1) % poly.length];

            const isInside = (p: {u: number, v: number}) => {
                const val = splitAxis === 'u' ? p.u : p.v;
                const perp = splitAxis === 'u' ? p.v : p.u;
                const limit = splitPos + getSplitOffset(perp);
                return keepLeft ? val <= limit : val >= limit;
            };

            const currIn = isInside(curr);
            const prevIn = isInside(prev);

            if (prevIn && currIn) {
                output.push(curr);
            } else if (prevIn && !currIn) {
                output.push(findIntersection(prev, curr, splitAxis, splitPos));
            } else if (!prevIn && currIn) {
                output.push(findIntersection(prev, curr, splitAxis, splitPos));
                output.push(curr);
            }
        }
        return output;
    };

    const contoursLeft = contours2D.map(c => clipPoly(c, true)).filter(c => c.length > 2);
    const contoursRight = contours2D.map(c => clipPoly(c, false)).filter(c => c.length > 2);

    const buildSlice = (contours: {u: number, v: number}[][], idSuffix: number): Slice | null => {
        if (contours.length === 0) return null;

        const contours3D = contours.map(c => c.map(p => get3D(p.u, p.v)));
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        contours.forEach(c => c.forEach(p => {
            minX = Math.min(minX, p.u);
            minY = Math.min(minY, p.v);
            maxX = Math.max(maxX, p.u);
            maxY = Math.max(maxY, p.v);
        }));
        
        // CRITICAL FIX: Check for infinite bounds to prevent crashes downstream
        if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
            return null;
        }

        const segments: any[] = [];
        contours3D.forEach(c => {
             for(let i=0; i<c.length; i++) {
                 segments.push({ start: c[i], end: c[(i+1)%c.length] });
             }
        });

        // Unique ID generation: e.g., 1.0 -> 1.1, 1.2; 1.1 -> 1.11, 1.12
        let newId = slice.id;
        if (Number.isInteger(slice.id)) {
             newId = parseFloat(`${slice.id}.${idSuffix}`);
        } else {
             // Append suffix to existing float string
             newId = parseFloat(`${slice.id}${idSuffix}`);
        }

        return {
            id: newId,
            zHeight: slice.zHeight,
            contours: contours3D,
            segments: segments,
            bounds: {
                minX, minY, maxX, maxY,
                width: maxX - minX,
                height: maxY - minY
            }
        };
    };

    const results: Slice[] = [];
    const s1 = buildSlice(contoursLeft, 1);
    if (s1) results.push(s1);
    
    const s2 = buildSlice(contoursRight, 2);
    if (s2) results.push(s2);

    return results;
};

// --- Geometry Utilities for Clipping ---

export type Point2D = { x: number, y: number };
export type Segment2D = { start: Point2D, end: Point2D };

/**
 * Checks if a point is inside a set of contours using the Even-Odd rule.
 * This works for polygons with holes and disjoint islands.
 */
export const isPointInPoly = (pt: Point2D, contours: Point2D[][]): boolean => {
    let inside = false;
    for (const poly of contours) {
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i].x, yi = poly[i].y;
            const xj = poly[j].x, yj = poly[j].y;
            
            // Check for ray crossing
            const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
                (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
            
            if (intersect) inside = !inside;
        }
    }
    return inside;
};

/**
 * Calculates the area of a polygon.
 */
export const getPolygonArea = (points: Point2D[]): number => {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return Math.abs(area / 2);
};

/**
 * Clips a set of line segments against a complex polygon (set of contours).
 * Returns only the parts of the segments that are strictly inside the polygon.
 */
export const getClippedSegments = (
    lines: Segment2D[],
    boundaryContours: Point2D[][]
): Segment2D[] => {
    const output: Segment2D[] = [];
    
    // Flatten boundary edges for intersection checks
    const edges: Segment2D[] = [];
    boundaryContours.forEach(c => {
        if (c.length < 3) return; // Skip degenerate
        for (let i = 0; i < c.length; i++) {
            edges.push({ start: c[i], end: c[(i + 1) % c.length] });
        }
    });

    for (const line of lines) {
        // Collect intersection parameters t along the line segment [0, 1]
        const tValues: number[] = [0, 1];

        const dx = line.end.x - line.start.x;
        const dy = line.end.y - line.start.y;

        for (const edge of edges) {
             // Standard Segment-Segment Intersection
             const x1 = line.start.x, y1 = line.start.y;
             const x2 = line.end.x, y2 = line.end.y;
             const x3 = edge.start.x, y3 = edge.start.y;
             const x4 = edge.end.x, y4 = edge.end.y;

             const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
             
             if (d !== 0) {
                 const r = ((y1 - y3) * (x4 - x3) - (x1 - x3) * (y4 - y3)) / d;
                 const s = ((y1 - y3) * (x2 - x1) - (x1 - x3) * (y2 - y1)) / d;
                 
                 // Check if intersection is within both segments
                 if (r >= 0 && r <= 1 && s >= 0 && s <= 1) {
                     tValues.push(r);
                 }
             }
        }

        tValues.sort((a, b) => a - b);
        
        // Deduplicate close t values to handle end-point touches
        const uniqueT = [tValues[0]];
        for (let i = 1; i < tValues.length; i++) {
            if (tValues[i] - uniqueT[uniqueT.length - 1] > 1e-4) {
                uniqueT.push(tValues[i]);
            }
        }

        // Test intervals to see if they are inside
        for (let i = 0; i < uniqueT.length - 1; i++) {
            const tStart = uniqueT[i];
            const tEnd = uniqueT[i+1];
            
            // If interval is essentially zero length, skip
            if (tEnd - tStart < 1e-4) continue;

            const midT = (tStart + tEnd) / 2;
            const midX = line.start.x + midT * dx;
            const midY = line.start.y + midT * dy;
            
            if (isPointInPoly({x: midX, y: midY}, boundaryContours)) {
                output.push({
                    start: { x: line.start.x + tStart * dx, y: line.start.y + tStart * dy },
                    end: { x: line.start.x + tEnd * dx, y: line.start.y + tEnd * dy }
                });
            }
        }
    }

    return output;
};

// --- Visual Center (Pole of Inaccessibility) Utilities ---

// Helper: Squared distance from point p to segment vw
const distToSegmentSquared = (p: Point2D, v: Point2D, w: Point2D) => {
  const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
  if (l2 === 0) return (p.x - v.x)**2 + (p.y - v.y)**2;
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return (p.x - (v.x + t * (w.x - v.x)))**2 + (p.y - (v.y + t * (w.y - v.y)))**2;
}

// Helper: Distance from point to polygon edges (min distance)
const distToPolyEdges = (p: Point2D, contours: Point2D[][]): number => {
    let minD2 = Infinity;
    contours.forEach(poly => {
        if (poly.length < 2) return;
        for (let i = 0; i < poly.length; i++) {
            const p1 = poly[i];
            const p2 = poly[(i + 1) % poly.length];
            const d2 = distToSegmentSquared(p, p1, p2);
            if (d2 < minD2) minD2 = d2;
        }
    });
    return Math.sqrt(minD2);
}

/**
 * Calculates the "Visual Center" or Pole of Inaccessibility of a polygon.
 * This is the point inside the polygon that is farthest from any edge.
 * Returns coordinates (relative to slice space) and the radius (distance to edge).
 */
export const getVisualCenter = (
    contours: Point2D[][], 
    bounds: {minX: number, minY: number, maxX: number, maxY: number}
): {x: number, y: number, radius: number} => {
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    // Grid step size. Smaller = more accurate but slower. 20 steps is a reasonable compromise for slicing.
    const precision = Math.min(w, h) / 20; 
    
    // Fallback for zero area
    if (precision <= 0 || w === 0 || h === 0) {
        return {x: (bounds.minX+bounds.maxX)/2, y: (bounds.minY+bounds.maxY)/2, radius: 0};
    }

    let bestPoint = { x: bounds.minX + w/2, y: bounds.minY + h/2 };
    let maxDist = 0;

    // Grid search scan
    for (let x = bounds.minX; x <= bounds.maxX; x += precision) {
        for (let y = bounds.minY; y <= bounds.maxY; y += precision) {
             // 1. Must be inside
             if (isPointInPoly({x,y}, contours)) {
                 // 2. Distance to closest edge
                 const d = distToPolyEdges({x,y}, contours);
                 if (d > maxDist) {
                     maxDist = d;
                     bestPoint = {x, y};
                 }
             }
        }
    }

    // Fallback: If grid search failed (e.g., very thin shapes where grid points missed the interior),
    // try the bounding box center.
    if (maxDist === 0) {
        const cx = bounds.minX + w/2;
        const cy = bounds.minY + h/2;
        if (isPointInPoly({x: cx, y: cy}, contours)) {
             const d = distToPolyEdges({x: cx, y: cy}, contours);
             return { x: cx, y: cy, radius: d };
        }
        // If center is outside, return it with radius 0 (last resort)
        return { x: cx, y: cy, radius: 0 };
    }

    return { ...bestPoint, radius: maxDist };
}
