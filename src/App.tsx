import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Palette as PaletteIcon, 
  Brush, 
  Eraser, 
  Undo2, 
  Download, 
  Trash2, 
  Plus,
  Pipette,
  Layers,
  Settings2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface BrushSettings {
  size: number;
  opacity: number;
  hardness: number;
  loading: number; // How much paint is on the brush (0-1)
  mixing: number;  // How much it picks up from the canvas (0-1)
}

// --- Utils ---

const rgbToHex = (c: Color) => {
  const toHex = (x: number) => Math.round(x).toString(16).padStart(2, '0');
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
};

const hexToRgb = (hex: string): Color => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b, a: 1 };
};

// Simple color mixing (Linear interpolation for now, can be improved to RYB)
const mixColors = (c1: Color, c2: Color, weight: number): Color => {
  return {
    r: c1.r * (1 - weight) + c2.r * weight,
    g: c1.g * (1 - weight) + c2.g * weight,
    b: c1.b * (1 - weight) + c2.b * weight,
    a: Math.max(c1.a, c2.a)
  };
};

// --- Components ---

export default function App() {
  const [activeColor, setActiveColor] = useState<Color>({ r: 220, g: 38, b: 38, a: 1 }); // Red
  const [brushSettings, setBrushSettings] = useState<BrushSettings>({
    size: 20,
    opacity: 0.8,
    hardness: 0.5,
    loading: 0.7,
    mixing: 0.4
  });
  const [tool, setTool] = useState<'brush' | 'eraser' | 'picker'>('brush');
  const [customColors, setCustomColors] = useState<Color[]>([]);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mixingWellRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isMixing, setIsMixing] = useState(false);
  const lastPos = useRef<{ x: number, y: number } | null>(null);
  const brushBuffer = useRef<Color>(activeColor);

  // Initialize Canvases
  useEffect(() => {
    const canvas = canvasRef.current;
    const mixingWell = mixingWellRef.current;
    if (!canvas || !mixingWell) return;
    
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const mixCtx = mixingWell.getContext('2d', { willReadFrequently: true });
    if (!ctx || !mixCtx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      tempCanvas.getContext('2d')?.drawImage(canvas, 0, 0);
      
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      ctx.fillStyle = '#fdfbf7';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(tempCanvas, 0, 0);

      // Mixing well size is fixed or relative to its container
      mixingWell.width = mixingWell.parentElement?.clientWidth || 300;
      mixingWell.height = mixingWell.parentElement?.clientHeight || 150;
      mixCtx.fillStyle = '#fdfbf7';
      mixCtx.fillRect(0, 0, mixingWell.width, mixingWell.height);
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Drawing Logic
  const startDrawing = (e: React.MouseEvent | React.TouchEvent, isWell = false) => {
    if (isWell) setIsMixing(true);
    else setIsDrawing(true);
    
    const pos = getPos(e, isWell ? mixingWellRef.current : canvasRef.current);
    lastPos.current = pos;
    brushBuffer.current = activeColor;
    draw(e, isWell);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    setIsMixing(false);
    lastPos.current = null;
  };

  const getPos = (e: React.MouseEvent | React.TouchEvent, target: HTMLCanvasElement | null) => {
    if (!target) return { x: 0, y: 0 };
    const rect = target.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const draw = (e: React.MouseEvent | React.TouchEvent, isWell = false) => {
    const target = isWell ? mixingWellRef.current : canvasRef.current;
    const active = isWell ? isMixing : isDrawing;
    
    if (!target) return;
    const ctx = target.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const currentPos = getPos(e, target);

    // Picker Logic
    if (tool === 'picker') {
      const pixel = ctx.getImageData(currentPos.x, currentPos.y, 1, 1).data;
      if (pixel[3] > 0) {
        setActiveColor({ r: pixel[0], g: pixel[1], b: pixel[2], a: 1 });
      }
      if (!active) return;
    }

    if (!active) return;

    if (!lastPos.current) {
      lastPos.current = currentPos;
      return;
    }

    const dist = Math.hypot(currentPos.x - lastPos.current.x, currentPos.y - lastPos.current.y);
    const steps = Math.max(Math.floor(dist / (brushSettings.size / 4)), 1);

    for (let i = 0; i <= steps; i++) {
      const x = lastPos.current.x + (currentPos.x - lastPos.current.x) * (i / steps);
      const y = lastPos.current.y + (currentPos.y - lastPos.current.y) * (i / steps);

      // Oil Mixing Simulation
      if (tool === 'brush') {
        // Sample color from canvas to mix
        const sampleSize = Math.max(1, Math.floor(brushSettings.size / 2));
        const imageData = ctx.getImageData(
          Math.max(0, x - sampleSize/2), 
          Math.max(0, y - sampleSize/2), 
          sampleSize, 
          sampleSize
        );
        
        let avgR = 0, avgG = 0, avgB = 0, count = 0;
        for (let j = 0; j < imageData.data.length; j += 4) {
          if (imageData.data[j+3] > 0) {
            avgR += imageData.data[j];
            avgG += imageData.data[j+1];
            avgB += imageData.data[j+2];
            count++;
          }
        }

        if (count > 0) {
          const canvasColor = { r: avgR / count, g: avgG / count, b: avgB / count, a: 1 };
          // Mix brush color with canvas color
          brushBuffer.current = mixColors(brushBuffer.current, canvasColor, brushSettings.mixing * 0.1);
        }

        // Draw with "bristle" effect
        drawOilStroke(ctx, x, y, brushBuffer.current, brushSettings);
      } else if (tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, brushSettings.size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    lastPos.current = currentPos;
  };

  const drawOilStroke = (ctx: CanvasRenderingContext2D, x: number, y: number, color: Color, settings: BrushSettings) => {
    const { size, opacity, hardness } = settings;
    
    // Create a radial gradient for a softer brush
    const grad = ctx.createRadialGradient(x, y, 0, x, y, size / 2);
    const colorStr = `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`;
    const transparentStr = `rgba(${color.r}, ${color.g}, ${color.b}, 0)`;
    
    grad.addColorStop(0, colorStr);
    grad.addColorStop(hardness, colorStr);
    grad.addColorStop(1, transparentStr);

    ctx.fillStyle = grad;
    
    // Add some "bristle" noise
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const offsetX = (Math.random() - 0.5) * size * 0.2;
      const offsetY = (Math.random() - 0.5) * size * 0.2;
      const s = size * (0.8 + Math.random() * 0.4);
      
      ctx.beginPath();
      ctx.arc(x + offsetX, y + offsetY, s / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fdfbf7';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const downloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'lumina-oil-painting.png';
    link.href = canvas.toDataURL();
    link.click();
  };

  const addCustomColor = () => {
    setCustomColors([...customColors, activeColor]);
  };

  return (
    <div className="flex h-screen w-full bg-[#1a1a1a] text-zinc-300 font-sans overflow-hidden selection:bg-emerald-500/30">
      {/* Sidebar - Tools */}
      <div className="w-20 flex flex-col items-center py-6 border-r border-zinc-800 bg-[#121212] z-20">
        <div className="mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-900/20">
            <PaletteIcon className="text-white w-6 h-6" />
          </div>
        </div>

        <div className="flex flex-col gap-4 flex-1">
          <ToolButton 
            active={tool === 'brush'} 
            onClick={() => setTool('brush')} 
            icon={<Brush size={20} />} 
            label="Brush"
          />
          <ToolButton 
            active={tool === 'eraser'} 
            onClick={() => setTool('eraser')} 
            icon={<Eraser size={20} />} 
            label="Eraser"
          />
          <ToolButton 
            active={tool === 'picker'} 
            onClick={() => setTool('picker')} 
            icon={<Pipette size={20} />} 
            label="Picker"
          />
          <div className="h-px w-8 bg-zinc-800 my-2" />
          <ToolButton 
            onClick={clearCanvas} 
            icon={<Trash2 size={20} />} 
            label="Clear"
            danger
          />
          <ToolButton 
            onClick={downloadImage} 
            icon={<Download size={20} />} 
            label="Save"
          />
        </div>

        <div className="mt-auto">
          <ToolButton icon={<Settings2 size={20} />} label="Settings" />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Top Header */}
        <header className="h-16 border-bottom border-zinc-800 bg-[#121212]/80 backdrop-blur-md flex items-center px-8 justify-between z-10">
          <div className="flex items-center gap-4">
            <h1 className="text-sm font-semibold tracking-widest uppercase text-zinc-500">Lumina Oil Studio</h1>
            <div className="h-4 w-px bg-zinc-800" />
            <span className="text-xs font-mono text-zinc-600">v1.0.4</span>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 bg-zinc-900/50 px-4 py-1.5 rounded-full border border-zinc-800">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: rgbToHex(activeColor) }} />
              <span className="text-[10px] font-mono uppercase tracking-tighter">{rgbToHex(activeColor)}</span>
            </div>
          </div>
        </header>

        {/* Canvas Area */}
        <main className="flex-1 relative bg-[#0f0f0f] p-8 flex items-center justify-center overflow-hidden">
          <div className="relative w-full h-full shadow-2xl shadow-black/50 rounded-sm overflow-hidden border border-zinc-800">
            {/* Canvas Texture Overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-10 mix-blend-multiply bg-[url('https://www.transparenttextures.com/patterns/canvas-orange.png')]" />
            
            <canvas
              id="main-canvas"
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="w-full h-full cursor-crosshair touch-none bg-[#fdfbf7]"
            />
          </div>
        </main>

        {/* Bottom Control Panel */}
        <footer className="h-64 border-t border-zinc-800 bg-[#121212] flex p-6 gap-8 z-10">
          {/* Brush Settings */}
          <div className="w-64 flex flex-col gap-4">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-2">Brush Dynamics</h3>
            <Slider label="Size" value={brushSettings.size} min={1} max={100} onChange={(v) => setBrushSettings({...brushSettings, size: v})} />
            <Slider label="Opacity" value={brushSettings.opacity * 100} min={1} max={100} onChange={(v) => setBrushSettings({...brushSettings, opacity: v/100})} />
            <Slider label="Mixing" value={brushSettings.mixing * 100} min={0} max={100} onChange={(v) => setBrushSettings({...brushSettings, mixing: v/100})} />
          </div>

          <div className="w-px bg-zinc-800 self-stretch" />

          {/* Palette Mixing Area */}
          <div className="flex-1 flex flex-col gap-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">Mixing Palette</h3>
              <button 
                onClick={addCustomColor}
                className="p-1 hover:bg-zinc-800 rounded-md transition-colors text-zinc-500 hover:text-emerald-400"
              >
                <Plus size={16} />
              </button>
            </div>
            
            <div className="flex gap-4 flex-1">
              {/* Basic Colors */}
              <div className="grid grid-cols-2 gap-2 w-24">
                <ColorSwatch color={{r:255, g:255, b:255, a:1}} active={false} onClick={() => setActiveColor({r:255, g:255, b:255, a:1})} />
                <ColorSwatch color={{r:0, g:0, b:0, a:1}} active={false} onClick={() => setActiveColor({r:0, g:0, b:0, a:1})} />
                <ColorSwatch color={{r:239, g:68, b:68, a:1}} active={false} onClick={() => setActiveColor({r:239, g:68, b:68, a:1})} />
                <ColorSwatch color={{r:34, g:197, b:94, a:1}} active={false} onClick={() => setActiveColor({r:34, g:197, b:94, a:1})} />
                <ColorSwatch color={{r:59, g:130, b:246, a:1}} active={false} onClick={() => setActiveColor({r:59, g:130, b:246, a:1})} />
                <ColorSwatch color={{r:234, g:179, b:8, a:1}} active={false} onClick={() => setActiveColor({r:234, g:179, b:8, a:1})} />
              </div>

              {/* Mixing Well Canvas */}
              <div className="flex-1 bg-zinc-900/50 rounded-xl border border-zinc-800 relative overflow-hidden group">
                <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[8px] uppercase tracking-widest text-zinc-500 bg-zinc-900/80 px-2 py-1 rounded">Mixing Well</span>
                </div>
                <canvas
                  ref={mixingWellRef}
                  onMouseDown={(e) => startDrawing(e, true)}
                  onMouseMove={(e) => draw(e, true)}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={(e) => startDrawing(e, true)}
                  onTouchMove={(e) => draw(e, true)}
                  onTouchEnd={stopDrawing}
                  className="w-full h-full cursor-crosshair touch-none"
                />
              </div>

              {/* Custom Mixed Colors History */}
              <div className="w-32 bg-zinc-900/50 rounded-xl border border-zinc-800 p-2 overflow-y-auto no-scrollbar">
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {customColors.map((c, i) => (
                    <ColorSwatch key={i} color={c} active={rgbToHex(c) === rgbToHex(activeColor)} onClick={() => setActiveColor(c)} small />
                  ))}
                  {customColors.length === 0 && (
                    <div className="text-[8px] text-zinc-600 italic text-center mt-4">History</div>
                  )}
                </div>
              </div>

              {/* Active Color Preview */}
              <div className="w-32 flex flex-col items-center justify-center gap-3 bg-zinc-900/30 rounded-xl border border-zinc-800">
                <div 
                  className="w-16 h-16 rounded-full shadow-inner border-4 border-zinc-800" 
                  style={{ backgroundColor: rgbToHex(activeColor) }}
                />
                <span className="text-[10px] font-mono text-zinc-500 uppercase">{rgbToHex(activeColor)}</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

// --- Sub-components ---

function ToolButton({ active, onClick, icon, label, danger }: { 
  active?: boolean, 
  onClick?: () => void, 
  icon: React.ReactNode, 
  label: string,
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`
        group relative flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-200
        ${active 
          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
          : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 border border-transparent'
        }
        ${danger && 'hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20'}
      `}
    >
      {icon}
      <span className="absolute left-16 bg-zinc-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap border border-zinc-800 z-50">
        {label}
      </span>
    </button>
  );
}

function Slider({ label, value, min, max, onChange }: { 
  label: string, 
  value: number, 
  min: number, 
  max: number, 
  onChange: (v: number) => void 
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-[10px] font-medium text-zinc-500">
        <span>{label}</span>
        <span className="font-mono">{Math.round(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
      />
    </div>
  );
}

interface ColorSwatchProps {
  color: Color;
  active: boolean;
  onClick: () => void;
  small?: boolean;
  key?: React.Key;
}

function ColorSwatch({ color, active, onClick, small }: ColorSwatchProps) {
  return (
    <button
      onClick={onClick}
      className={`
        rounded-lg border-2 transition-transform active:scale-95
        ${small ? 'w-6 h-6' : 'w-8 h-8'}
        ${active ? 'border-emerald-500 scale-110' : 'border-zinc-800 hover:border-zinc-600'}
      `}
      style={{ backgroundColor: rgbToHex(color) }}
    />
  );
}
