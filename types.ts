import * as THREE from 'three';

export enum Axis {
  X = 'x',
  Y = 'y',
  Z = 'z',
}

export interface MaterialSettings {
  width: number;
  length: number;
  thickness: number;
  unit: 'mm' | 'in';
}

export interface SliceSettings {
  axis: Axis;
  layerHeight: number; // or calculated from count
  mode: 'count' | 'height';
  count: number;
  syncWithMaterial?: boolean;
  nestingOrder?: 'optimized' | 'sequential';
}

export interface LineSegment {
  start: THREE.Vector3;
  end: THREE.Vector3;
}

export interface Slice {
  id: number;
  zHeight: number; // Position along the slice axis
  segments: LineSegment[];
  contours: THREE.Vector3[][]; // Connected paths for fabrication
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
}

export interface PlacedSlice extends Slice {
  x: number;
  y: number;
  rotation: number; // In radians
  sheetId: number;
}

export interface Sheet {
  id: number;
  width: number;
  height: number;
  items: PlacedSlice[];
  unplaced?: PlacedSlice[];
}

export interface ModelStats {
    dimensions: { x: number, y: number, z: number };
    volume: number;
    triangleCount: number;
}