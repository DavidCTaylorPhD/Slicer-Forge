
import React, { useEffect, useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, GizmoHelper, GizmoViewport, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { STLLoader, OBJLoader } from 'three-stdlib';
import { Slice, Axis, MaterialSettings } from '../types';

interface Viewer3DProps {
  file: File | null;
  geometry?: THREE.BufferGeometry | null;
  onModelLoaded: (geo: THREE.BufferGeometry) => void;
  onError?: (error: string) => void;
  slices: Slice[];
  sliceAxis: Axis;
  showSlicesOnly: boolean;
  assemblyIndex?: number;
  material?: MaterialSettings;
  processingHeight?: number;
}

interface ModelProps {
    file: File | null;
    geometry?: THREE.BufferGeometry | null;
    onLoaded: (g: THREE.BufferGeometry) => void;
    onError?: (err: string) => void;
    clippingPlanes?: THREE.Plane[];
    transparent?: boolean;
    opacity?: number;
    color?: string;
}

const Model = ({ file, geometry, onLoaded, onError, clippingPlanes, transparent = false, opacity = 1, color = "#6366f1" }: ModelProps) => {
  const [localGeo, setLocalGeo] = useState<THREE.BufferGeometry | null>(null);
  
  useEffect(() => {
    if (geometry) return; 
    if (!file) return;
    
    const url = URL.createObjectURL(file);
    const extension = file.name.split('.').pop()?.toLowerCase();

    const handleGeometry = (geo: THREE.BufferGeometry) => {
        try {
            geo.center();
            geo.computeVertexNormals();
            setLocalGeo(geo);
            onLoaded(geo);
        } catch (e) {
            if (onError) onError("Failed to process model geometry.");
            console.error(e);
        }
    };

    if (extension === 'obj') {
        const loader = new OBJLoader();
        loader.load(
            url,
            (group) => {
                // OBJLoader returns a Group. We need to find the first Mesh and get its geometry.
                // In a production app, we might merge all meshes in the group.
                let foundGeo: THREE.BufferGeometry | null = null;
                
                group.traverse((child) => {
                    if (!foundGeo && (child as THREE.Mesh).isMesh) {
                        const mesh = child as THREE.Mesh;
                        foundGeo = mesh.geometry.clone(); // Clone to detach from loader resources
                    }
                });

                if (foundGeo) {
                    handleGeometry(foundGeo);
                } else {
                    if (onError) onError("No valid mesh geometry found in OBJ file.");
                }
            },
            undefined,
            (err) => {
                console.error("OBJ Load Error:", err);
                if (onError) onError("Failed to load or parse OBJ file.");
            }
        );
    } else {
        // Default to STL
        const loader = new STLLoader();
        loader.load(
            url, 
            (geo) => handleGeometry(geo),
            undefined,
            (errEvent) => {
                console.error("STL Load Error:", errEvent);
                if (onError) onError("Failed to load or parse STL file.");
            }
        );
    }

    return () => {
        URL.revokeObjectURL(url);
        if (!geometry) setLocalGeo(null);
    };
  }, [file, geometry, onLoaded, onError]);

  const geo = geometry || localGeo;
  if (!geo) return null;

  /* R3F elements used without global JSX augmentation */
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial 
        color={color} 
        roughness={0.5} 
        metalness={0.2} 
        clippingPlanes={clippingPlanes}
        clipShadows
        transparent={transparent}
        opacity={opacity}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

/**
 * Renders slices as 3D extruded shapes for realistic preview
 */
const ExtrudedSliceRenderer = ({ slice, axis, thickness }: { slice: Slice, axis: Axis, thickness: number }) => {
    const shapes = useMemo(() => {
        if (!slice.contours || slice.contours.length === 0) return [];
        
        return slice.contours.map(contour => {
             const shape = new THREE.Shape();
             
             // Convert 3D points to 2D shape based on slice axis
             const getPt = (v: THREE.Vector3) => {
                 if (axis === Axis.Z) return { x: v.x, y: v.y }; // Z-up
                 if (axis === Axis.Y) return { x: v.x, y: v.z }; // Y-up
                 return { x: v.y, y: v.z }; // X-up
             };

             if (contour.length > 0) {
                 const start = getPt(contour[0]);
                 shape.moveTo(start.x, start.y);
                 for(let i=1; i<contour.length; i++) {
                     const p = getPt(contour[i]);
                     shape.lineTo(p.x, p.y);
                 }
             }
             return shape;
        });
    }, [slice, axis]);

    if (shapes.length === 0) return null;

    /* R3F group and mesh elements */
    return (
        <group position={[0, 0, slice.zHeight]}> 
             {/* Note: The group handles the Z-height positioning relative to the slice plane. 
                 However, we need to orient the shape plane correctly relative to world space.
                 The ExtrudeGeometry creates shape in XY plane. 
             */}
             {shapes.map((shape, i) => (
                 <mesh key={i}>
                     <extrudeGeometry args={[shape, { depth: thickness, bevelEnabled: false }]} />
                     <meshStandardMaterial color="#fbbf24" roughness={0.7} />
                 </mesh>
             ))}
        </group>
    );
};

const SliceRenderer = ({ slices, axis, visibleCount, useExtrusion, material }: { slices: Slice[], axis: Axis, visibleCount?: number, useExtrusion?: boolean, material?: MaterialSettings }) => {
    const limit = visibleCount !== undefined ? visibleCount : slices.length;
    const visibleSlices = slices.slice(0, limit);
    
    /* R3F rendering of slices */
    return (
        <group>
            {visibleSlices.map((slice, idx) => {
                 const isTop = idx === visibleSlices.length - 1;
                 
                 if (useExtrusion && material && slice.contours?.length) {
                     
                     let rotation: [number, number, number] = [0,0,0];
                     let position: [number, number, number] = [0,0,0];
                     
                     if (axis === Axis.Z) {
                         position = [0, 0, slice.zHeight];
                     } else if (axis === Axis.Y) {
                         rotation = [Math.PI/2, 0, 0];
                         position = [0, slice.zHeight, 0];
                     } else { // X
                         rotation = [0, Math.PI/2, 0]; // Rotate around Y to face X
                         position = [slice.zHeight, 0, 0];
                     }

                     return (
                         <group key={slice.id} position={position} rotation={rotation}>
                             {slice.contours.map((contour, ci) => {
                                 const shape = new THREE.Shape();
                                 const get2D = (v: THREE.Vector3) => {
                                     if (axis === Axis.Z) return {x: v.x, y: v.y};
                                     if (axis === Axis.Y) return {x: v.x, y: -v.z}; // Flip Z to match screen Y?
                                     return {x: -v.z, y: v.y}; // Axis X
                                 };
                                 
                                 if(contour.length > 0) {
                                    const pts = contour.map(p => get2D(p));
                                    shape.moveTo(pts[0].x, pts[0].y);
                                    pts.slice(1).forEach(p => shape.lineTo(p.x, p.y));
                                    shape.closePath();
                                 }
                                 
                                 return (
                                     <mesh key={ci}>
                                         <extrudeGeometry args={[shape, { depth: material.thickness, bevelEnabled: false }]} />
                                         <meshStandardMaterial color={isTop ? "#ffffff" : "#fbbf24"} />
                                     </mesh>
                                 )
                             })}
                         </group>
                     )
                 }

                 // Fallback to Line Rendering
                 const color = (visibleCount !== undefined && isTop) ? "#ffffff" : "#fbbf24";
                 return (
                    <group key={slice.id}>
                        {slice.segments.map((seg, i) => (
                            <lineSegments key={i}>
                                <bufferGeometry attach="geometry">
                                    <float32BufferAttribute
                                        attach="attributes-position"
                                        args={[
                                            [seg.start.x, seg.start.y, seg.start.z, seg.end.x, seg.end.y, seg.end.z].flat(),
                                            3
                                        ]}
                                    />
                                </bufferGeometry>
                                <lineBasicMaterial attach="material" color={color} linewidth={1} />
                            </lineSegments>
                        ))}
                    </group>
                 );
            })}
        </group>
    );
};

const SceneContent = ({ file, geometry, onModelLoaded, onError, slices, sliceAxis, showSlicesOnly, assemblyIndex, material, processingHeight }: Viewer3DProps) => {
  const clipPlane = useMemo(() => {
      if (assemblyIndex === undefined || slices.length === 0 || assemblyIndex === 0) return null;
      const currentSlice = slices[Math.min(assemblyIndex, slices.length) - 1];
      const height = currentSlice.zHeight;
      let normal = new THREE.Vector3(0, 1, 0);
      if (sliceAxis === Axis.X) normal.set(1, 0, 0);
      else if (sliceAxis === Axis.Y) normal.set(0, 1, 0); // Usually Y is Up in Three.js
      else normal.set(0, 0, 1); // Z is depth/up depending on cam
      
      if (sliceAxis === Axis.X) normal.set(1, 0, 0);
      if (sliceAxis === Axis.Y) normal.set(0, 1, 0);
      if (sliceAxis === Axis.Z) normal.set(0, 0, 1);
      
      return new THREE.Plane(normal, -height);
  }, [assemblyIndex, slices, sliceAxis]);

  const isAssembly = assemblyIndex !== undefined;

  return (
    <>
       <Stage intensity={0.5} environment="city" adjustCamera={!showSlicesOnly}>
          <group rotation={[-Math.PI / 2, 0, 0]}>
              {/* 1. Solid Model */}
              {!isAssembly && !showSlicesOnly && (
                 <Model file={file} geometry={geometry} onLoaded={onModelLoaded} onError={onError} />
              )}

              {/* 2. Assembly Animation */}
              {isAssembly && (
                  <>
                      <Model 
                          file={file} 
                          geometry={geometry} 
                          onLoaded={onModelLoaded} 
                          transparent={true} 
                          opacity={0.1} 
                          color="#818cf8"
                      />
                  </>
              )}
              
              {/* 3. Slices (Lines or Extruded) */}
              <SliceRenderer 
                slices={slices} 
                axis={sliceAxis} 
                visibleCount={assemblyIndex} 
                useExtrusion={isAssembly} // Use extrusion in assembly mode
                material={material}
              />
          </group>
       </Stage>
       <Grid infiniteGrid fadeDistance={50} sectionColor="#4b5563" cellColor="#374151"/>
       <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="white" />
       </GizmoHelper>
    </>
  );
};

export const Viewer3D: React.FC<Viewer3DProps> = (props) => {
  return (
    <div className="w-full h-full bg-slate-900 relative">
      <Canvas shadows camera={{ position: [0, 0, 150], fov: 50 }} gl={{ localClippingEnabled: true }}>
        <SceneContent {...props} />
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
};
