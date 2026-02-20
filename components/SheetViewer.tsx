
import React, { useEffect, useRef, useState } from 'react';
import { Sheet, Slice, Axis } from '../types';
import { Download, AlertTriangle, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { generateSVG, generateDXF, generatePDF, downloadFile } from '../utils/exporter';
import { getClippedSegments, getVisualCenter, Point2D, Segment2D } from '../utils/modifier';

interface SheetViewerProps {
  sheets: Sheet[];
  slices: Slice[];
  scale?: number;
  axis: Axis;
}

export const SheetViewer: React.FC<SheetViewerProps> = ({ sheets, slices, scale = 1, axis }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewScale, setViewScale] = useState(scale);
  
  const unplacedCount = sheets.reduce((acc, s) => acc + (s.unplaced?.length || 0), 0);

  const handleZoomIn = () => setViewScale(prev => Math.min(prev * 1.2, 5.0));
  const handleZoomOut = () => setViewScale(prev => Math.max(prev / 1.2, 0.1));
  const handleZoomReset = () => setViewScale(1.0);

  const drawSheet = (ctx: CanvasRenderingContext2D, sheet: Sheet) => {
    // Draw Sheet Background
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, sheet.width * viewScale, sheet.height * viewScale);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, sheet.width * viewScale, sheet.height * viewScale);

    sheet.items.forEach(item => {
        // Safety check
        if (!Number.isFinite(item.x) || !Number.isFinite(item.y) || !Number.isFinite(item.bounds.width)) return;

        // 1. SETUP TRANSFORM (Sheet Item Local)
        ctx.save();
        
        const drawX = item.x * viewScale;
        const drawY = item.y * viewScale;
        
        ctx.translate(drawX, drawY);

        if (item.rotation) {
            const destW = item.bounds.height * viewScale;
            const destH = item.bounds.width * viewScale;
            ctx.translate(destW / 2, destH / 2);
            ctx.rotate(item.rotation);
            ctx.translate(-(item.bounds.width * viewScale) / 2, -(item.bounds.height * viewScale) / 2);
        }

        const offsetX = -item.bounds.minX;
        const offsetY = -item.bounds.minY;
        
        const get2D = (x: number, y: number, z: number) => {
             if (axis === Axis.Z) return { u: x, v: y };
             if (axis === Axis.Y) return { u: x, v: z };
             return { u: y, v: z };
        }

        // 2. DRAW CUT LINES (RED)
        ctx.beginPath();
        
        // Always solid line for cuts.
        // Split parts are identified by ID (X.1, X.2) and puzzle geometry, not line style.
        ctx.strokeStyle = '#FF0000'; // RGB Red for Cut Lines
        ctx.setLineDash([]);
        ctx.lineWidth = 1.5;

        // Prepare 2D contours for current item (for drawing AND for clipping alignment lines AND visual center)
        const currentContours2D: Point2D[][] = [];

        if (item.contours && item.contours.length > 0) {
             item.contours.forEach(contour => {
                 if (!contour || contour.length === 0) return;
                 
                 const poly2D: Point2D[] = [];
                 
                 const start = get2D(contour[0].x, contour[0].y, contour[0].z);
                 poly2D.push({x: start.u, y: start.v});

                 ctx.moveTo((start.u + offsetX) * viewScale, (start.v + offsetY) * viewScale);
                 for(let i=1; i<contour.length; i++) {
                     const p = get2D(contour[i].x, contour[i].y, contour[i].z);
                     poly2D.push({x: p.u, y: p.v});
                     ctx.lineTo((p.u + offsetX) * viewScale, (p.v + offsetY) * viewScale);
                 }
                 const first = get2D(contour[0].x, contour[0].y, contour[0].z);
                 ctx.lineTo((first.u + offsetX) * viewScale, (first.v + offsetY) * viewScale);
                 
                 currentContours2D.push(poly2D);
             });
        } else if (item.segments) {
             item.segments.forEach(seg => {
                const start = get2D(seg.start.x, seg.start.y, seg.start.z);
                const end = get2D(seg.end.x, seg.end.y, seg.end.z);
                // Just draw, don't add to poly2D for now (unlikely path)
                const x1 = (start.u + offsetX) * viewScale;
                const y1 = (start.v + offsetY) * viewScale;
                const x2 = (end.u + offsetX) * viewScale;
                const y2 = (end.v + offsetY) * viewScale;
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
            });
        }
        ctx.stroke();

        // 3. DRAW ALIGNMENT LINES (SCORING BLACK)
        const baseId = Math.floor(item.id);
        const nextSliceId = baseId + 1; 
        const nextSlicesList = slices.filter(s => Math.floor(s.id) === nextSliceId);
        
        if (nextSlicesList.length > 0 && currentContours2D.length > 0) {
            const linesToClip: Segment2D[] = [];
            nextSlicesList.forEach(nextSlice => {
                if (nextSlice.contours) {
                    nextSlice.contours.forEach(contour => {
                         if (!contour || contour.length < 2) return;
                         for(let i=0; i<contour.length; i++) {
                             const p1 = get2D(contour[i].x, contour[i].y, contour[i].z);
                             const p2 = get2D(contour[(i+1)%contour.length].x, contour[(i+1)%contour.length].y, contour[(i+1)%contour.length].z);
                             linesToClip.push({
                                 start: {x: p1.u, y: p1.v},
                                 end: {x: p2.u, y: p2.v}
                             });
                         }
                    });
                }
            });

            const clippedLines = getClippedSegments(linesToClip, currentContours2D);

            if (clippedLines.length > 0) {
                ctx.beginPath();
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1;
                ctx.setLineDash([]); 

                clippedLines.forEach(line => {
                     ctx.moveTo((line.start.x + offsetX) * viewScale, (line.start.y + offsetY) * viewScale);
                     ctx.lineTo((line.end.x + offsetX) * viewScale, (line.end.y + offsetY) * viewScale);
                });
                ctx.stroke();
            }
        }

        ctx.restore(); // Exit rotated context

        // 4. DRAW ANNOTATIONS
        // Use Visual Center (Pole of Inaccessibility) to ensure label is inside the piece
        let center = { x: item.x + item.bounds.width/2, y: item.y + item.bounds.height/2 };
        let safeRadius = 0;

        if (currentContours2D.length > 0) {
            const visualCenter = getVisualCenter(currentContours2D, item.bounds);
            // VisualCenter returns coordinates in Slice Space (u, v).
            // We need to transform this point to Sheet Space (x, y)
            
            // Transform Logic:
            let lu = visualCenter.x - item.bounds.minX;
            let lv = visualCenter.y - item.bounds.minY;
            
            const w = item.bounds.width;
            const h = item.bounds.height;
            
            if (item.rotation) {
                // Relative to center of bounding box
                const cu = w / 2;
                const cv = h / 2;
                const ru = lu - cu;
                const rv = lv - cv;
                
                // Rotate +90 deg: (x, y) -> (-y, x)
                const rotatedU = -rv;
                const rotatedV = ru;
                
                // Remap to rotated box frame (size h x w)
                lu = rotatedU + h / 2;
                lv = rotatedV + w / 2;
            }
            
            center = {
                x: item.x + lu,
                y: item.y + lv
            };
            safeRadius = visualCenter.radius;
        } else {
             // Fallback to bbox center
             const boxW = item.rotation ? item.bounds.height : item.bounds.width;
             const boxH = item.rotation ? item.bounds.width : item.bounds.height;
             center = { x: item.x + boxW/2, y: item.y + boxH/2 };
             safeRadius = Math.min(boxW, boxH) / 4; // Crude guess
        }

        const cx = center.x * viewScale;
        const cy = center.y * viewScale;

        // Draw Alignment Crosshair
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1; 
        ctx.setLineDash([]); 
        
        // Mark size limited by safe radius
        const markSize = Math.min(6, safeRadius * viewScale * 0.5); 
        ctx.moveTo(cx - markSize, cy);
        ctx.lineTo(cx + markSize, cy);
        ctx.moveTo(cx, cy - markSize);
        ctx.lineTo(cx, cy + markSize);
        ctx.stroke();

        // Draw Number ID
        let label = item.id.toString();
        if (!Number.isInteger(item.id)) label = parseFloat(item.id.toFixed(2)).toString();
        
        // Font Sizing based on Safe Radius (Internal Distance)
        // Diameter = 2 * radius. We want text to fit within, say, 80% of that.
        // Text height approx fontSize. Width approx fontSize * chars * 0.6.
        
        const safeDiameter = safeRadius * 2 * viewScale * 0.8; 
        
        if (safeDiameter > 4) {
             // Constrain by width
             const aspect = 0.6;
             const widthConstraint = safeDiameter / (label.length * aspect);
             
             // Constrain by height
             const heightConstraint = safeDiameter;
             
             let fontSize = Math.min(widthConstraint, heightConstraint);
             fontSize = Math.min(fontSize, 60); // Hard max
             
             if (fontSize >= 8) {
                ctx.fillStyle = '#0000FF';
                ctx.font = `bold ${fontSize}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, cx, cy);
             }
        }
        ctx.restore();
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || sheets.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const margin = 20;
    const totalHeight = sheets.reduce((acc, sheet) => acc + (sheet.height * viewScale) + margin, 0);
    const maxWidth = sheets.reduce((acc, sheet) => Math.max(acc, sheet.width * viewScale), 0);

    const safeWidth = Math.min(maxWidth + margin * 2, 16000);
    const safeHeight = Math.min(totalHeight + margin + 50, 16000);

    canvas.width = Math.max(safeWidth, 400);
    canvas.height = safeHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let currentY = margin;
    sheets.forEach((sheet, index) => {
        ctx.save();
        ctx.translate(margin, currentY);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px Inter';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(`Sheet ${sheet.id + 1} (${sheet.width.toFixed(1)}x${sheet.height.toFixed(1)})`, 0, -5);
        
        drawSheet(ctx, sheet);
        ctx.restore();
        currentY += (sheet.height * viewScale) + margin;
    });

  }, [sheets, slices, viewScale, axis, unplacedCount]);

  const handleExportSVG = () => {
      const svgContent = generateSVG(sheets, slices, axis, 'mm');
      downloadFile(svgContent, 'sliceforge-layout.svg', 'image/svg+xml');
  };

  const handleExportDXF = () => {
      const dxfContent = generateDXF(sheets, slices, axis);
      downloadFile(dxfContent, 'sliceforge-layout.dxf', 'application/dxf');
  };

  const handleExportPDF = () => {
      generatePDF(sheets, slices, axis, 'mm');
  };

  if (sheets.length === 0) return <div className="flex items-center justify-center h-full text-slate-500">No sheets generated</div>;

  return (
    <div className="relative h-full w-full flex flex-col">
        {unplacedCount > 0 && (
             <div className="bg-red-900/50 border-b border-red-500 text-red-100 p-3 flex items-center justify-center">
                 <AlertTriangle className="w-5 h-5 mr-2" />
                 <span>Warning: {unplacedCount} part(s) could not fit on the material sheets even after splitting. Please increase sheet size.</span>
             </div>
        )}
        
        {/* Buttons Toolbar */}
        <div className="absolute top-16 right-8 z-10 flex flex-wrap justify-end gap-3">
            {/* Zoom Controls */}
            <div className="flex items-center bg-slate-700/80 backdrop-blur-sm rounded-lg shadow-lg border border-slate-600 p-1">
                <button 
                    onClick={handleZoomOut}
                    className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-600 rounded transition-colors"
                    title="Zoom Out"
                >
                    <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs font-medium text-slate-200 w-12 text-center select-none">
                    {Math.round(viewScale * 100)}%
                </span>
                <button 
                    onClick={handleZoomIn}
                    className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-600 rounded transition-colors"
                    title="Zoom In"
                >
                    <ZoomIn className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-slate-600 mx-1"></div>
                <button 
                    onClick={handleZoomReset}
                    className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-600 rounded transition-colors"
                    title="Reset Zoom"
                >
                    <RotateCcw className="w-4 h-4" />
                </button>
            </div>

            {/* Export Buttons */}
            <div className="flex bg-slate-700/80 backdrop-blur-sm rounded-lg shadow-lg border border-slate-600 p-1 space-x-1">
                <button 
                    onClick={handleExportSVG}
                    className="flex items-center px-3 py-1.5 text-slate-200 hover:bg-indigo-600 hover:text-white rounded text-xs font-medium transition-colors"
                    title="Vector SVG for Laser Cutting"
                >
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    SVG
                </button>
                <button 
                    onClick={handleExportDXF}
                    className="flex items-center px-3 py-1.5 text-slate-200 hover:bg-indigo-600 hover:text-white rounded text-xs font-medium transition-colors"
                    title="AutoCAD DXF for CNC/CAD"
                >
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    DXF
                </button>
                <button 
                    onClick={handleExportPDF}
                    className="flex items-center px-3 py-1.5 text-slate-200 hover:bg-indigo-600 hover:text-white rounded text-xs font-medium transition-colors"
                    title="Printable Vector PDF"
                >
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    PDF
                </button>
            </div>
        </div>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 z-10 bg-slate-900/90 backdrop-blur border border-slate-700 p-4 rounded-lg shadow-xl text-xs space-y-2 pointer-events-none">
            <h4 className="font-bold text-slate-200 mb-2">Fabrication Legend</h4>
            <div className="flex items-center">
                <span className="w-6 h-0.5 bg-red-600 mr-3"></span>
                <span className="text-slate-300">Cut Lines (Exterior)</span>
            </div>
            <div className="flex items-center">
                <span className="w-6 h-0.5 bg-black border border-slate-600 mr-3"></span>
                <span className="text-slate-300">Score / Align (Next Layer)</span>
            </div>
            <div className="flex items-center">
                <span className="text-blue-400 font-bold w-6 text-center mr-3">5.1</span>
                <span className="text-slate-300">
                    Decimal IDs (e.g. 5.1 & 5.2)<br/>
                    connect to form Layer 5
                </span>
            </div>
        </div>

        <div className="overflow-auto flex-grow bg-slate-800 p-4 rounded-lg shadow-inner">
            <canvas ref={canvasRef} />
        </div>
    </div>
  );
};
