import { Sheet, Axis, Slice } from '../types';

export const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

const get2DCoord = (v: {x:number, y:number, z:number}, axis: Axis) => {
    if (axis === Axis.Z) return { u: v.x, v: v.y };
    if (axis === Axis.Y) return { u: v.x, v: v.z };
    return { u: v.y, v: v.z }; 
};

const rotatePoint = (u: number, v: number, angle: number): {u: number, v: number} => {
    if (angle === 0) return { u, v };
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
        u: u * cos - v * sin,
        v: u * sin + v * cos
    };
};

export const generateSVG = (sheets: Sheet[], axis: Axis, unit: 'mm' | 'in'): string => {
    const margin = 20;
    let totalHeight = 0;
    let maxWidth = 0;

    sheets.forEach(sheet => {
        totalHeight += sheet.height + margin;
        maxWidth = Math.max(maxWidth, sheet.width);
    });

    if (sheets.length > 0) totalHeight -= margin;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${maxWidth}${unit}" height="${totalHeight}${unit}" viewBox="0 0 ${maxWidth} ${totalHeight}">`;
    svg += `<style>
        .cut { stroke: #FF0000; stroke-width: 1px; fill: none; vector-effect: non-scaling-stroke; } 
        .align { stroke: #000000; stroke-width: 1px; fill: none; vector-effect: non-scaling-stroke; }
        .label { font-family: sans-serif; font-size: 12px; fill: #0000FF; text-anchor: middle; dominant-baseline: auto; }
        .sheet-border { stroke: #ccc; fill: none; }
    </style>`;

    let currentY = 0;
    
    sheets.forEach((sheet, i) => {
        svg += `<g transform="translate(0, ${currentY})">`;
        svg += `<rect x="0" y="0" width="${sheet.width}" height="${sheet.height}" class="sheet-border" />`;
        
        sheet.items.forEach(item => {
            // -- GEOMETRY CALCS --
            const loops = item.contours && item.contours.length > 0 
                ? item.contours.map(c => c.map(p => get2DCoord(p, axis))) 
                : item.segments.map(s => [get2DCoord(s.start, axis), get2DCoord(s.end, axis)]);

            // 1. CUT PATHS (RED)
            let pathD = "";
            loops.forEach(loop => {
                loop.forEach((pt, idx) => {
                    let u = pt.u - item.bounds.minX;
                    let v = pt.v - item.bounds.minY;
                    const w = item.bounds.width;
                    const h = item.bounds.height;
                    
                    if (item.rotation) {
                        u -= w / 2; v -= h / 2;
                        const rotated = rotatePoint(u, v, item.rotation);
                        u = rotated.u; v = rotated.v;
                        u += h / 2; v += w / 2;
                    }

                    const x = u + item.x;
                    const y = v + item.y;

                    if (idx === 0) pathD += `M ${x} ${y} `;
                    else pathD += `L ${x} ${y} `;
                });
            });
            svg += `<path d="${pathD}" class="cut" />`;

            // -- CENTER CALCS FOR LABEL/ALIGNMENT --
            // Width/Height of the placement box
            const boxW = item.rotation ? item.bounds.height : item.bounds.width;
            const boxH = item.rotation ? item.bounds.width : item.bounds.height;
            const cx = item.x + boxW / 2;
            const cy = item.y + boxH / 2;

            // 2. ALIGNMENT MARKS (BLACK)
            const mark = 5;
            const alignPath = `M ${cx-mark} ${cy} L ${cx+mark} ${cy} M ${cx} ${cy-mark} L ${cx} ${cy+mark}`;
            svg += `<path d="${alignPath}" class="align" />`;

            // 3. LABEL (BLUE)
            let label = item.id.toString();
            if (!Number.isInteger(item.id)) label = item.id.toFixed(1);
            // Position text slightly above center (y - 2) to avoid crosshair overlap
            svg += `<text x="${cx}" y="${cy-2}" class="label">${label}</text>`;
        });
        
        svg += `</g>`;
        currentY += sheet.height + margin;
    });

    svg += `</svg>`;
    return svg;
};

export const generateDXF = (sheets: Sheet[], axis: Axis): string => {
    let dxf = "0\nSECTION\n2\nHEADER\n0\nENDSEC\n";
    dxf += "0\nSECTION\n2\nENTITIES\n";

    const margin = 20;
    let currentY = 0;

    sheets.forEach(sheet => {
        sheet.items.forEach(item => {
            const loops = item.contours && item.contours.length > 0 
                ? item.contours.map(c => c.map(p => get2DCoord(p, axis))) 
                : item.segments.map(s => [get2DCoord(s.start, axis), get2DCoord(s.end, axis)]);

            loops.forEach(loop => {
                dxf += "0\nLWPOLYLINE\n8\n0\n"; // Layer 0
                dxf += `90\n${loop.length}\n`;
                dxf += "70\n0\n"; 
                
                loop.forEach(pt => {
                    let u = pt.u - item.bounds.minX;
                    let v = pt.v - item.bounds.minY;

                    const w = item.bounds.width;
                    const h = item.bounds.height;
                    
                    if (item.rotation) {
                        u -= w / 2; v -= h / 2;
                        const rotated = rotatePoint(u, v, item.rotation);
                        u = rotated.u + h / 2;
                        v = rotated.v + w / 2;
                    }

                    const x = u + item.x;
                    const y = v + item.y + currentY;

                    dxf += `10\n${x}\n20\n${y}\n`;
                });
            });
        });
        currentY += sheet.height + margin;
    });

    dxf += "0\nENDSEC\n0\nEOF\n";
    return dxf;
};