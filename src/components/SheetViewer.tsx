import React, { useEffect, useRef, useState } from 'react';
import { Sheet, Axis } from '../types';
import { Download, AlertTriangle } from 'lucide-react';
import { generateSVG, generateDXF, downloadFile } from '../utils/exporter';

interface SheetViewerProps {
  sheets: Sheet[];
  scale?: number;
  axis: Axis;
}

export const SheetViewer: React.FC<SheetViewerProps> = ({ sheets, scale = 1, axis }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const unplacedCount = sheets.reduce((acc, s) => acc + (s.unplaced?.length || 0), 0);

  const drawSheet = (ctx: CanvasRenderingContext2D, sheet: Sheet) => {
    // Draw Sheet Background
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, sheet.width * scale, sheet.height * scale);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, sheet.width * scale, sheet.height * scale);

    sheet.items.forEach(item => {
        // 1. DRAW GEOMETRY (ROTATED LOCAL CONTEXT)
        ctx.save();
        
        const drawX = item.x * scale;
        const drawY = item.y * scale;
        
        ctx.translate(drawX, drawY);

        if (item.rotation) {
            const destW = item.bounds.height * scale;
            const destH = item.bounds.width * scale;
            ctx.translate(destW / 2, destH / 2);
            ctx.rotate(item.rotation);
            ctx.translate(-(item.bounds.width * scale) / 2, -(item.bounds.height * scale) / 2);
        }

        const offsetX = -item.bounds.minX;
        const offsetY = -item.bounds.minY;
        
        const get2D = (x: number, y: number, z: number) => {
             if (axis === Axis.Z) return { u: x, v: y };
             if (axis === Axis.Y) return { u: x, v: z };
             return { u: y, v: z };
        }

        // Draw Outline (RGB RED)
        ctx.beginPath();
        
        const isSplitPart = !Number.isInteger(item.id);
        
        ctx.strokeStyle = '#FF0000'; // RGB Red for Cut Lines
        if (isSplitPart) {
             // Dashed for split parts to indicate join
            ctx.setLineDash([5, 3]);
        } else {
            ctx.setLineDash([]);
        }
        ctx.lineWidth = 1.5;

        if (item.contours && item.contours.length > 0) {
             item.contours.forEach(contour => {
                 if (contour.length === 0) return;
                 const start = get2D(contour[0].x, contour[0].y, contour[0].z);
                 ctx.moveTo((start.u + offsetX) * scale, (start.v + offsetY) * scale);
                 for(let i=1; i<contour.length; i++) {
                     const p = get2D(contour[i].x, contour[i].y, contour[i].z);
                     ctx.lineTo((p.u + offsetX) * scale, (p.v + offsetY) * scale);
                 }
                 // Close loop if not implicitly closed
                 const first = get2D(contour[0].x, contour[0].y, contour[0].z);
                 ctx.lineTo((first.u + offsetX) * scale, (first.v + offsetY) * scale);
             });
        } else {
            item.segments.forEach(seg => {
                const start = get2D(seg.start.x, seg.start.y, seg.start.z);
                const end = get2D(seg.end.x, seg.end.y, seg.end.z);
                const x1 = (start.u + offsetX) * scale;
                const y1 = (start.v + offsetY) * scale;
                const x2 = (end.u + offsetX) * scale;
                const y2 = (end.v + offsetY) * scale;
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
            });
        }
        ctx.stroke();
        ctx.restore(); // Exit rotated context

        // 2. DRAW ANNOTATIONS (UNROTATED SHEET CONTEXT)
        // We calculate the center of the placement box to draw text and marks upright
        
        // Placement Box Dimensions (swapped if rotated)
        const boxW = item.rotation ? item.bounds.height : item.bounds.width;
        const boxH = item.rotation ? item.bounds.width : item.bounds.height;
        
        const cx = (item.x + boxW / 2) * scale;
        const cy = (item.y + boxH / 2) * scale;

        // Draw Alignment Lines (RGB BLACK)
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5; // Slightly thicker to see against dark bg
        ctx.setLineDash([]); 
        
        const markSize = 6; // Length of crosshair arms
        // Horizontal
        ctx.moveTo(cx - markSize, cy);
        ctx.lineTo(cx + markSize, cy);
        // Vertical
        ctx.moveTo(cx, cy - markSize);
        ctx.lineTo(cx, cy + markSize);
        ctx.stroke();

        // Draw Number ID (RGB BLUE)
        ctx.fillStyle = '#0000FF';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom'; // Draw above the center point
        
        let label = item.id.toString();
        if (!Number.isInteger(item.id)) label = item.id.toFixed(1);
        
        // Offset slightly above center to not overlap crosshair
        ctx.fillText(label, cx, cy - 4);
        ctx.restore();
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || sheets.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const margin = 20;
    const totalHeight = sheets.reduce((acc, sheet) => acc + (sheet.height * scale) + margin, 0);
    const maxWidth = sheets.reduce((acc, sheet) => Math.max(acc, sheet.width * scale), 0);

    canvas.width = Math.max(maxWidth + margin * 2, 400);
    canvas.height = totalHeight + margin + (unplacedCount > 0 ? 50 : 0);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let currentY = margin;
    sheets.forEach((sheet, index) => {
        ctx.save();
        ctx.translate(margin, currentY);
        // Sheet Label
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px Inter';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(`Sheet ${sheet.id + 1} (${sheet.width}x${sheet.height})`, 0, -5);
        
        drawSheet(ctx, sheet);
        ctx.restore();
        currentY += (sheet.height * scale) + margin;
    });

  }, [sheets, scale, axis, unplacedCount]);

  const handleExportSVG = () => {
      const svgContent = generateSVG(sheets, axis, 'mm');
      downloadFile(svgContent, 'sliceforge-layout.svg', 'image/svg+xml');
  };

  const handleExportDXF = () => {
      const dxfContent = generateDXF(sheets, axis);
      downloadFile(dxfContent, 'sliceforge-layout.dxf', 'application/dxf');
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
        
        <div className="absolute top-16 right-8 z-10 flex space-x-3">
            <button 
                onClick={handleExportSVG}
                className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded shadow-lg text-sm font-medium transition-colors"
            >
                <Download className="w-4 h-4 mr-2" />
                Export SVG
            </button>
             <button 
                onClick={handleExportDXF}
                className="flex items-center px-4 py-2 bg-slate-7