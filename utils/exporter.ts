
import { Sheet, Axis, Slice } from '../types';
import { getClippedSegments, getVisualCenter, Point2D, Segment2D } from './modifier';
import { jsPDF } from "jspdf";

export const downloadFile = (content: string | Blob, filename: string, mimeType: string) => {
    // If content is already a blob (e.g. PDF), use it directly
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
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

// Helper to calculate scale density (now unused in favor of Visual Center logic but kept for ref if needed)
const calculateFontSizeFromRadius = (radius: number, label: string): number => {
    const safeDiameter = radius * 2 * 0.8; // 80% of diameter
    const aspect = 0.6;
    const widthSize = safeDiameter / (label.length * aspect);
    return Math.min(safeDiameter, widthSize);
};

export const generatePDF = (sheets: Sheet[], slices: Slice[], axis: Axis, unit: 'mm' | 'in') => {
    if (sheets.length === 0) return;

    // Initialize PDF with the size of the first sheet
    // Orientation 'p' (portrait) or 'l' (landscape) depends on dimensions
    const orientation = sheets[0].width > sheets[0].height ? 'l' : 'p';
    
    const doc = new jsPDF({
        orientation: orientation,
        unit: unit,
        format: [sheets[0].width, sheets[0].height]
    });

    sheets.forEach((sheet, index) => {
        // Add new page for subsequent sheets
        if (index > 0) {
            const orient = sheet.width > sheet.height ? 'l' : 'p';
            doc.addPage([sheet.width, sheet.height], orient);
        }

        // 0. Sheet Border (Optional, helpful for visual)
        doc.setDrawColor(200, 200, 200);
        doc.rect(0, 0, sheet.width, sheet.height);

        sheet.items.forEach(item => {
            // Helper: Transform point to sheet space
            const transformPoint = (u: number, v: number) => {
                let localU = u - item.bounds.minX;
                let localV = v - item.bounds.minY;
                
                const w = item.bounds.width;
                const h = item.bounds.height;
                
                if (item.rotation) {
                    localU -= w / 2; localV -= h / 2;
                    const rotated = rotatePoint(localU, localV, item.rotation);
                    localU = rotated.u; localV = rotated.v;
                    localU += h / 2; localV += w / 2;
                }
                return { x: localU + item.x, y: localV + item.y };
            };

            // 1. Cut Lines (Red) & Build Contours
            doc.setDrawColor(255, 0, 0); // RGB Red
            doc.setLineWidth(0.1); // Hairline for laser

            const currentContours2D: Point2D[][] = [];
            const loops = item.contours && item.contours.length > 0 
                ? item.contours 
                : []; // We handle segments separately fallback

            loops.forEach(loop => {
                const poly2D: Point2D[] = [];
                const points: {x: number, y: number}[] = [];

                loop.forEach(pt => {
                    const p2d = get2DCoord(pt, axis);
                    poly2D.push({x: p2d.u, y: p2d.v});
                    points.push(transformPoint(p2d.u, p2d.v));
                });
                currentContours2D.push(poly2D);

                // Draw Polygon
                for(let i=0; i<points.length - 1; i++) {
                    doc.line(points[i].x, points[i].y, points[i+1].x, points[i+1].y);
                }
                // Close loop
                if (points.length > 2) {
                    doc.line(points[points.length-1].x, points[points.length-1].y, points[0].x, points[0].y);
                }
            });

            // Segments Fallback
            if (loops.length === 0 && item.segments) {
                item.segments.forEach(seg => {
                    const s = get2DCoord(seg.start, axis);
                    const e = get2DCoord(seg.end, axis);
                    const start = transformPoint(s.u, s.v);
                    const end = transformPoint(e.u, e.v);
                    doc.line(start.x, start.y, end.x, end.y);
                });
            }

            // 2. Alignment Scoring (Black)
            doc.setDrawColor(0, 0, 0);
            const nextSliceId = Math.floor(item.id) + 1;
            const nextSlicesList = slices.filter(s => Math.floor(s.id) === nextSliceId);
            
            if (nextSlicesList.length > 0 && currentContours2D.length > 0) {
                 const linesToClip: Segment2D[] = [];
                 nextSlicesList.forEach(nextSlice => {
                     if (nextSlice.contours) {
                         nextSlice.contours.forEach(loop => {
                             if(loop.length < 2) return;
                             for(let i=0; i<loop.length; i++) {
                                 const p1 = get2DCoord(loop[i], axis);
                                 const p2 = get2DCoord(loop[(i+1)%loop.length], axis);
                                 linesToClip.push({start: {x: p1.u, y: p1.v}, end: {x: p2.u, y: p2.v}});
                             }
                         });
                     }
                 });

                 const clippedLines = getClippedSegments(linesToClip, currentContours2D);
                 
                 clippedLines.forEach(line => {
                     const start = transformPoint(line.start.x, line.start.y);
                     const end = transformPoint(line.end.x, line.end.y);
                     doc.line(start.x, start.y, end.x, end.y);
                 });
            }

            // 3. Visual Center & Label
            let cx = 0, cy = 0, radius = 0;
            if (currentContours2D.length > 0) {
                const vc = getVisualCenter(currentContours2D, item.bounds);
                const pos = transformPoint(vc.x, vc.y);
                cx = pos.x;
                cy = pos.y;
                radius = vc.radius;
            } else {
                const boxW = item.rotation ? item.bounds.height : item.bounds.width;
                const boxH = item.rotation ? item.bounds.width : item.bounds.height;
                cx = item.x + boxW / 2;
                cy = item.y + boxH / 2;
                radius = Math.min(boxW, boxH) / 4;
            }

            // Crosshair (Black)
            const mark = Math.min(5, radius * 0.5);
            doc.setDrawColor(0,0,0);
            doc.line(cx - mark, cy, cx + mark, cy);
            doc.line(cx, cy - mark, cx, cy + mark);

            // Text Label (Blue)
            let label = item.id.toString();
            if (!Number.isInteger(item.id)) label = parseFloat(item.id.toFixed(2)).toString();
            
            const fontSizeMm = calculateFontSizeFromRadius(radius, label);
            
            if (fontSizeMm > 0.5) {
                doc.setTextColor(0, 0, 255);
                // Convert mm to points for setFontSize (1 mm = 2.83465 pt)
                const pts = fontSizeMm * 2.83465;
                doc.setFontSize(pts);
                
                // jspdf text alignment
                // We use 'center' and 'baseline' : 'middle' if possible, or just center.
                // jspdf's text() places text at x,y.
                // We can approximate centering.
                doc.text(label, cx, cy, { align: 'center', baseline: 'middle' });
            }
        });

        // Footer info
        doc.setTextColor(150, 150, 150);
        doc.setFontSize(8);
        doc.text(`Sheet ${sheet.id + 1} - ${unit.toUpperCase()}`, 5, 5);
    });

    doc.save('sliceforge-layout.pdf');
};

export const generateSVG = (sheets: Sheet[], slices: Slice[], axis: Axis, unit: 'mm' | 'in'): string => {
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
        .score { stroke: #000000; stroke-width: 1px; fill: none; vector-effect: non-scaling-stroke; }
        .align { stroke: #000000; stroke-width: 0.5px; fill: none; opacity: 0.3; vector-effect: non-scaling-stroke; }
        .label { font-family: sans-serif; fill: #0000FF; text-anchor: middle; dominant-baseline: middle; }
        .sheet-border { stroke: #ccc; fill: none; }
    </style>`;

    let currentY = 0;
    
    sheets.forEach((sheet, i) => {
        svg += `<g transform="translate(0, ${currentY})">`;
        svg += `<rect x="0" y="0" width="${sheet.width}" height="${sheet.height}" class="sheet-border" />`;
        
        sheet.items.forEach(item => {
            // -- HELPER: Transform point to sheet space --
            const transformPoint = (u: number, v: number) => {
                let localU = u - item.bounds.minX;
                let localV = v - item.bounds.minY;
                
                const w = item.bounds.width;
                const h = item.bounds.height;
                
                if (item.rotation) {
                    localU -= w / 2; localV -= h / 2;
                    const rotated = rotatePoint(localU, localV, item.rotation);
                    localU = rotated.u; localV = rotated.v;
                    localU += h / 2; localV += w / 2;
                }
                return { x: localU + item.x, y: localV + item.y };
            };

            // 1. CUT PATHS (RED) & BUILD 2D POLY FOR CLIPPING/CENTER
            const currentContours2D: Point2D[][] = [];
            const loops = item.contours && item.contours.length > 0 
                ? item.contours 
                : []; 

            let pathD = "";
            loops.forEach(loop => {
                const poly2D: Point2D[] = [];
                loop.forEach((pt, idx) => {
                    // Raw 2D coordinates (Slice Space)
                    const p2d = get2DCoord(pt, axis);
                    poly2D.push({x: p2d.u, y: p2d.v});

                    // Sheet Space for SVG
                    const pos = transformPoint(p2d.u, p2d.v);
                    if (idx === 0) pathD += `M ${pos.x} ${pos.y} `;
                    else pathD += `L ${pos.x} ${pos.y} `;
                });
                if(loop.length > 0) pathD += "Z ";
                currentContours2D.push(poly2D);
            });
            
            // Fallback for segments
            if (loops.length === 0 && item.segments) {
                item.segments.forEach(seg => {
                    const s = get2DCoord(seg.start, axis);
                    const e = get2DCoord(seg.end, axis);
                    const start = transformPoint(s.u, s.v);
                    const end = transformPoint(e.u, e.v);
                    pathD += `M ${start.x} ${start.y} L ${end.x} ${end.y} `;
                });
            }
            svg += `<path d="${pathD}" class="cut" />`;

            // 2. ALIGNMENT SCORING (BLACK)
            const nextSliceId = Math.floor(item.id) + 1;
            const nextSlicesList = slices.filter(s => Math.floor(s.id) === nextSliceId);
            
            if (nextSlicesList.length > 0 && currentContours2D.length > 0) {
                 const linesToClip: Segment2D[] = [];
                 nextSlicesList.forEach(nextSlice => {
                     if (nextSlice.contours) {
                         nextSlice.contours.forEach(loop => {
                             if(loop.length < 2) return;
                             for(let i=0; i<loop.length; i++) {
                                 const p1 = get2DCoord(loop[i], axis);
                                 const p2 = get2DCoord(loop[(i+1)%loop.length], axis);
                                 linesToClip.push({start: {x: p1.u, y: p1.v}, end: {x: p2.u, y: p2.v}});
                             }
                         });
                     }
                 });

                 const clippedLines = getClippedSegments(linesToClip, currentContours2D);
                 
                 if (clippedLines.length > 0) {
                     let scoreD = "";
                     clippedLines.forEach(line => {
                         const start = transformPoint(line.start.x, line.start.y);
                         const end = transformPoint(line.end.x, line.end.y);
                         scoreD += `M ${start.x} ${start.y} L ${end.x} ${end.y} `;
                     });
                     svg += `<path d="${scoreD}" class="score" />`;
                 }
            }

            // 3. CALCULATE VISUAL CENTER FOR LABEL
            let cx = 0, cy = 0, radius = 0;

            if (currentContours2D.length > 0) {
                const vc = getVisualCenter(currentContours2D, item.bounds);
                const pos = transformPoint(vc.x, vc.y);
                cx = pos.x;
                cy = pos.y;
                radius = vc.radius;
            } else {
                // Fallback
                const boxW = item.rotation ? item.bounds.height : item.bounds.width;
                const boxH = item.rotation ? item.bounds.width : item.bounds.height;
                cx = item.x + boxW / 2;
                cy = item.y + boxH / 2;
                radius = Math.min(boxW, boxH) / 4;
            }

            // 4. ALIGNMENT CROSSHAIR
            const mark = Math.min(5, radius * 0.5);
            const alignPath = `M ${cx-mark} ${cy} L ${cx+mark} ${cy} M ${cx} ${cy-mark} L ${cx} ${cy+mark}`;
            svg += `<path d="${alignPath}" class="align" />`;

            // 5. LABEL
            let label = item.id.toString();
            if (!Number.isInteger(item.id)) label = parseFloat(item.id.toFixed(2)).toString();
            
            const fontSize = calculateFontSizeFromRadius(radius, label);
            
            if (fontSize > 0.5) {
                svg += `<text x="${cx}" y="${cy}" font-size="${fontSize}" class="label">${label}</text>`;
            }
        });
        
        svg += `</g>`;
        currentY += sheet.height + margin;
    });

    svg += `</svg>`;
    return svg;
};

export const generateDXF = (sheets: Sheet[], slices: Slice[], axis: Axis): string => {
    let dxf = "0\nSECTION\n2\nHEADER\n0\nENDSEC\n";
    dxf += "0\nSECTION\n2\nENTITIES\n";

    const margin = 20;
    let currentY = 0;

    sheets.forEach(sheet => {
        sheet.items.forEach(item => {
            // Helper for Transform
            const transformPoint = (u: number, v: number) => {
                let localU = u - item.bounds.minX;
                let localV = v - item.bounds.minY;
                const w = item.bounds.width;
                const h = item.bounds.height;
                if (item.rotation) {
                    localU -= w / 2; localV -= h / 2;
                    const rotated = rotatePoint(localU, localV, item.rotation);
                    localU = rotated.u; localV = rotated.v;
                    localU += h / 2; localV += w / 2;
                }
                return { x: localU + item.x, y: localV + item.y + currentY };
            };

            const writePolyline = (points: {x: number, y: number}[], layer: string, color: number, closed: boolean) => {
                 dxf += "0\nLWPOLYLINE\n";
                 dxf += `8\n${layer}\n`; 
                 dxf += `62\n${color}\n`; 
                 dxf += `90\n${points.length}\n`;
                 dxf += `70\n${closed ? 1 : 0}\n`; 
                 points.forEach(pt => {
                     const pos = transformPoint(pt.x, pt.y);
                     dxf += `10\n${pos.x}\n20\n${pos.y}\n`;
                 });
            };

            // 1. Cut Lines
            const currentContours2D: Point2D[][] = [];
            const loops = item.contours && item.contours.length > 0 ? item.contours : [];
            
            loops.forEach(loop => {
                const poly2D = loop.map(p => {
                    const p2d = get2DCoord(p, axis);
                    return {x: p2d.u, y: p2d.v};
                });
                currentContours2D.push(poly2D);
                writePolyline(poly2D, "CUT", 1, true); // Red
            });

            // 2. Alignment Score
            const nextSliceId = Math.floor(item.id) + 1;
            const nextSlicesList = slices.filter(s => Math.floor(s.id) === nextSliceId);

            if (nextSlicesList.length > 0 && currentContours2D.length > 0) {
                 const linesToClip: Segment2D[] = [];
                 nextSlicesList.forEach(nextSlice => {
                     if (nextSlice.contours) {
                         nextSlice.contours.forEach(loop => {
                             if(loop.length < 2) return;
                             for(let i=0; i<loop.length; i++) {
                                 const p1 = get2DCoord(loop[i], axis);
                                 const p2 = get2DCoord(loop[(i+1)%loop.length], axis);
                                 linesToClip.push({start: {x: p1.u, y: p1.v}, end: {x: p2.u, y: p2.v}});
                             }
                         });
                     }
                 });

                 const clippedLines = getClippedSegments(linesToClip, currentContours2D);
                 clippedLines.forEach(line => {
                     writePolyline([line.start, line.end], "SCORE", 7, false); // White
                 });
            }

            // 3. Text Labels (Visual Center)
            let cx = 0, cy = 0, radius = 0;
            if (currentContours2D.length > 0) {
                const vc = getVisualCenter(currentContours2D, item.bounds);
                const pos = transformPoint(vc.x, vc.y);
                cx = pos.x;
                cy = pos.y;
                radius = vc.radius;
            } else {
                 const boxW = item.rotation ? item.bounds.height : item.bounds.width;
                 const boxH = item.rotation ? item.bounds.width : item.bounds.height;
                 cx = item.x + boxW / 2;
                 cy = item.y + boxH / 2 + currentY;
                 radius = Math.min(boxW, boxH) / 4;
            }

            let label = item.id.toString();
            if (!Number.isInteger(item.id)) label = parseFloat(item.id.toFixed(2)).toString();
            
            const fontSize = calculateFontSizeFromRadius(radius, label);

            if (fontSize > 0.5) {
                dxf += "0\nTEXT\n8\nLABELS\n62\n5\n"; // Blue
                dxf += `10\n${cx}\n20\n${cy}\n`; 
                dxf += `40\n${fontSize}\n`; 
                dxf += `1\n${label}\n`; 
                dxf += `72\n1\n`; 
                dxf += `73\n2\n`; 
                dxf += `11\n${cx}\n21\n${cy}\n`;
            }
        });
        currentY += sheet.height + margin;
    });

    dxf += "0\nENDSEC\n0\nEOF\n";
    return dxf;
};
