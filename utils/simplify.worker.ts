/// <reference lib="webworker" />
import * as THREE from 'three';
import { SimplifyModifier, mergeVertices } from 'three-stdlib';

const ctx: Worker = self as any;

ctx.onmessage = (e: MessageEvent) => {
    const { positions, indices, countToRemove } = e.data;

    try {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        if (indices) {
            geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        }

        // 1. Merge vertices for better results
        const merged = mergeVertices(geometry);
        
        // 2. Simplify
        const modifier = new SimplifyModifier();
        const simplified = modifier.modify(merged, countToRemove);
        
        // 3. Convert back to non-indexed for the slicer
        const nonIndexed = simplified.toNonIndexed();
        
        // 4. Extract data to send back
        const resultPositions = nonIndexed.attributes.position.array as Float32Array;
        
        // We use Transferable objects for performance
        ctx.postMessage({ 
            positions: resultPositions,
            success: true 
        }, [resultPositions.buffer] as any);

    } catch (error) {
        ctx.postMessage({ 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
        });
    }
};
