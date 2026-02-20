import * as THREE from 'three';
import { Axis, Slice, LineSegment } from '../types';

export const sliceGeometry = (
  geometry: THREE.BufferGeometry,
  axis: Axis,
  numberOfSlices: number,
  onProgress?: (current: number, total: number) => void
): Slice[] => {
  // Ensure geometry is non-indexed for easier triangle iteration
  const nonIndexedGeo = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const posAttr = nonIndexedGeo.attributes.position as THREE.BufferAttribute;
  const box = new THREE.Box3().setFromBufferAttribute(posAttr);
  
  const min = box.min[axis];
  const max = box.max[axis];
  const range = max - min;
  
  // Safety check for flat or empty geometry
  if (range <= 0 || numberOfSlices <= 0) return [];

  const step = range / (numberOfSlices + 1);
  const slices: Slice[] = [];
  const EPSILON = 1e-5;

  // Helper to access vertex components by axis string
  const getVal = (v: THREE.Vector3, a: Axis) => v[a];

  // Helper: Get 2D coordinates based on slice axis (for bounds calculation)
  const get2D = (v: THREE.Vector3): {x: number, y: number} => {
    if (axis === Axis.Z) return { x: v.x, y: v.y };
    if (axis === Axis.Y) return { x: v.x, y: v.z };
    return { x: v.y, y: v.z }; // Axis X
  };

  // Iterate through slice planes
  for (let i = 1; i <= numberOfSlices; i++) {
    if (onProgress) onProgress(i, numberOfSlices);

    const planeLevel = min + i * step;
    const segments: LineSegment[] = [];
    
    // Vectors for triangle vertices (reused)
    const v1 = new THREE.Vector3();
    const v2 = new THREE.Vector3();
    const v3 = new THREE.Vector3();

    // Iterate all triangles
    for (let j = 0; j < posAttr.count; j += 3) {
      v1.fromBufferAttribute(posAttr, j);
      v2.fromBufferAttribute(posAttr, j + 1);
      v3.fromBufferAttribute(posAttr, j + 2);

      const d1 = getVal(v1, axis) - planeLevel;
      const d2 = getVal(v2, axis) - planeLevel;
      const d3 = getVal(v3, axis) - planeLevel;

      // Trivial rejection
      if ((d1 > EPSILON && d2 > EPSILON && d3 > EPSILON) || 
          (d1 < -EPSILON && d2 < -EPSILON && d3 < -EPSILON)) {
        continue;
      }

      const intersections: THREE.Vector3[] = [];
      const points = [v1, v2, v3];
      const dists = [d1, d2, d3];

      for(let k=0; k<3; k++) {
        const pA = points[k];
        const pB = points[(k+1)%3];
        const dA = dists[k];
        const dB = dists[(k+1)%3];

        if ((dA > 0 && dB < 0) || (dA < 0 && dB > 0)) {
            const t = dA / (dA - dB);
            intersections.push(new THREE.Vector3().lerpVectors(pA, pB, t));
        } 
      }

      // Add vertices exactly on plane
      if (Math.abs(d1) < EPSILON) intersections.push(v1.clone());
      if (Math.abs(d2) < EPSILON) intersections.push(v2.clone());
      if (Math.abs(d3) < EPSILON) intersections.push(v3.clone());

      // Deduplicate points within this triangle using Euclidean distance
      const uniquePoints: THREE.Vector3[] = [];
      intersections.forEach(p => {
          const isDuplicate = uniquePoints.some(existing => existing.distanceToSquared(p) < EPSILON * EPSILON);
          if (!isDuplicate) uniquePoints.push(p);
      });

      // We need exactly 2 points to form a segment through the triangle
      if (uniquePoints.length === 2) {
        segments.push({
            start: uniquePoints[0],
            end: uniquePoints[1]
        });
      }
    }

    if (segments.length > 0) {
        // 1. Calculate Bounds
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        segments.forEach(seg => {
            const s = get2D(seg.start);
            const e = get2D(seg.end);
            minX = Math.min(minX, s.x, e.x);
            minY = Math.min(minY, s.y, e.y);
            maxX = Math.max(maxX, s.x, e.x);
            maxY = Math.max(maxY, s.y, e.y);
        });

        // 2. Link Segments into Contours (Topology)
        const contours = linkSegments(segments, EPSILON);

        slices.push({
            id: i,
            zHeight: planeLevel,
            segments,
            contours,
            bounds: {
                minX, minY, maxX, maxY,
                width: maxX - minX,
                height: maxY - minY
            }
        });
    }
  }

  if (!geometry.index) nonIndexedGeo.dispose();

  return slices;
};

/**
 * Joins loose line segments into continuous polylines (contours).
 */
const linkSegments = (segments: LineSegment[], epsilon: number): THREE.Vector3[][] => {
    const contours: THREE.Vector3[][] = [];
    const used = new Set<number>(); // Track used segment indices

    // Helper for spatial hashing to optimize vertex matching
    const hash = (v: THREE.Vector3) => `${Math.round(v.x/epsilon)},${Math.round(v.y/epsilon)},${Math.round(v.z/epsilon)}`;
    
    // Build adjacency map
    const map = new Map<string, number[]>();
    segments.forEach((seg, idx) => {
        const hStart = hash(seg.start);
        const hEnd = hash(seg.end);
        
        if(!map.has(hStart)) map.set(hStart, []);
        map.get(hStart)!.push(idx);
        
        if(!map.has(hEnd)) map.set(hEnd, []);
        map.get(hEnd)!.push(idx);
    });

    for (let i = 0; i < segments.length; i++) {
        if (used.has(i)) continue;

        // Start a new contour
        const contour: THREE.Vector3[] = [];
        let currentIdx = i;
        used.add(currentIdx);

        let seg = segments[currentIdx];
        
        // We'll grow the contour from 'start' to 'end'.
        // Note: The first segment dictates direction.
        contour.push(seg.start);
        contour.push(seg.end);
        
        let currentPoint = seg.end;
        let finding = true;

        while (finding) {
            const h = hash(currentPoint);
            const candidates = map.get(h);
            
            if (!candidates) {
                finding = false;
                break;
            }

            // Find an unused connected segment
            let foundNext = false;
            for (const candIdx of candidates) {
                if (used.has(candIdx)) continue;

                const candSeg = segments[candIdx];
                
                // Check which end connects
                const distStart = candSeg.start.distanceToSquared(currentPoint);
                const distEnd = candSeg.end.distanceToSquared(currentPoint);
                const sqEps = epsilon * epsilon;

                if (distStart < sqEps) {
                    // Connected at start, goes to end
                    contour.push(candSeg.end);
                    currentPoint = candSeg.end;
                    used.add(candIdx);
                    foundNext = true;
                    break;
                } else if (distEnd < sqEps) {
                    // Connected at end, goes to start
                    contour.push(candSeg.start);
                    currentPoint = candSeg.start;
                    used.add(candIdx);
                    foundNext = true;
                    break;
                }
            }

            if (!foundNext) finding = false;
            
            // Check for closed loop
            if (currentPoint.distanceToSquared(contour[0]) < epsilon * epsilon) {
                finding = false; 
                // It's closed.
            }
        }
        
        contours.push(contour);
    }

    return contours;
};