/// <reference lib="webworker" />
import * as THREE from 'three';
import { SimplifyModifier, mergeVertices } from 'three-stdlib';

const ctx: Worker = self as any;

ctx.onmessage = (e: MessageEvent) => {
    const { positions, indices, targetRatio } = e.data;

    try {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        if (indices) {
            geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        }

        // 1. Merge vertices for better results - this is crucial for decimation
        const merged = mergeVertices(geometry);
        
        // 2. Calculate how many to remove based on the ACTUAL merged count
        const vertexCount = merged.attributes.position.count;
        
        // We want to keep at least 15% (targetRatio) or 2000 vertices, whichever is larger.
        // But we must never try to keep more than we have or remove more than we have.
        const targetToKeep = Math.max(100, Math.floor(vertexCount * targetRatio)); // Lower bound 100 for safety
        const countToRemove = Math.max(0, vertexCount - targetToKeep);
        
        let resultPositions: Float32Array;

        if (countToRemove > 0) {
            // 3. Simplify
            const modifier = new SimplifyModifier();
            try {
                const simplified = modifier.modify(merged, countToRemove);
                
                // 4. Convert back to non-indexed for the slicer
                const nonIndexed = simplified.toNonIndexed();
                resultPositions = nonIndexed.attributes.position.array as Float32Array;
            } catch (modError) {
                // If simplification fails, just return original merged
                const nonIndexed = merged.toNonIndexed();
                resultPositions = nonIndexed.attributes.position.array as Float32Array;
            }
        } else {
            const nonIndexed = merged.toNonIndexed();
            resultPositions = nonIndexed.attributes.position.array as Float32Array;
        }

        if (!resultPositions || resultPositions.length === 0) {
            throw new Error("Simplification resulted in empty geometry.");
        }
        
        // 5. Extract data to send back
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
