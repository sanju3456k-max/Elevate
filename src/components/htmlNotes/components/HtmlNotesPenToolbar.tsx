import React, { useState } from 'react';
import { 
  PenTool, 
  Feather, 
  Highlighter, 
  Eraser, 
  Undo2, 
  Redo2, 
  Trash2, 
  X,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';

export type PenToolType = 'pen' | 'fountain' | 'highlighter' | 'eraser';

export interface HtmlNotesPenToolbarProps {
  isOpen: boolean;
  onClose: () => void;
  activeTool: PenToolType;
  onSelectTool: (tool: PenToolType) => void;
  currentColor: string;
  onSelectColor: (color: string) => void;
  currentWidth: number;
  onSelectWidth: (width: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearAll: () => void;
}

const PEN_COLORS = [
  { name: 'Charcoal', hex: '#1e293b' },
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Crimson', hex: '#dc2626' },
  { name: 'Emerald', hex: '#16a34a' },
  { name: 'Purple', hex: '#9333ea' }
];

const HIGHLIGHTER_COLORS = [
  { name: 'Yellow', hex: '#fde047' },
  { name: 'Cyan', hex: '#38bdf8' },
  { name: 'Pink', hex: '#f472b6' },
  { name: 'Mint', hex: '#4ade80' },
  { name: 'Orange', hex: '#fb923c' }
];

const PEN_WIDTHS = [
  { label: 'Fine', value: 1.5 },
  { label: 'Med', value: 2.5 },
  { label: 'Bold', value: 4.5 }
];

const HIGHLIGHTER_WIDTHS = [
  { label: 'Fine', value: 12 },
  { label: 'Med', value: 18 },
  { label: 'Bold', value: 26 }
];

export const HtmlNotesPenToolbar: React.FC<HtmlNotesPenToolbarProps> = ({
  isOpen,
  onClose,
  activeTool,
  onSelectTool,
  currentColor,
  onSelectColor,
  currentWidth,
  onSelectWidth,
  onUndo,
  onRedo,
  onClearAll
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);

  if (!isOpen) return null;

  const isHighlighter = activeTool === 'highlighter';
  const isEraser = activeTool === 'eraser';
  const colorList = isHighlighter ? HIGHLIGHTER_COLORS : PEN_COLORS;
  const widthList = isHighlighter ? HIGHLIGHTER_WIDTHS : PEN_WIDTHS;

  const getToolDisplayName = () => {
    switch (activeTool) {
      case 'pen': return 'Ballpoint';
      case 'fountain': return 'Fountain Pen';
      case 'highlighter': return 'Highlighter';
      case 'eraser': return 'Eraser';
    }
  };

  const renderActiveToolIcon = (className = 'w-4 h-4') => {
    switch (activeTool) {
      case 'pen': return <PenTool className={className} />;
      case 'fountain': return <Feather className={className} />;
      case 'highlighter': return <Highlighter className={className} />;
      case 'eraser': return <Eraser className={className} />;
    }
  };

  const handleStopPropagation = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  // COLLAPSED SIDE BADGE: Stays docked cleanly on the right edge without blocking text
  if (isCollapsed) {
    return (
      <div
        data-pen-toolbar="true"
        className="pen-toolbar-container fixed right-3 top-24 z-[99999] select-none"
        onPointerDown={handleStopPropagation}
        onPointerMove={handleStopPropagation}
        onPointerUp={handleStopPropagation}
        onMouseDown={handleStopPropagation}
        onClick={handleStopPropagation}
      >
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="group flex flex-col items-center gap-2 py-3 px-2 bg-white/95 dark:bg-[#1a1c24]/95 backdrop-blur-xl border border-slate-200 dark:border-zinc-700 shadow-2xl rounded-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer"
          title="Expand Pen Tools"
        >
          <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            {renderActiveToolIcon('w-4 h-4')}
          </div>
          {!isEraser && (
            <div 
              className="w-3.5 h-3.5 rounded-full ring-2 ring-white dark:ring-zinc-800 shadow-xs"
              style={{ backgroundColor: currentColor }}
            />
          )}
          <div className="text-slate-400 dark:text-zinc-500 group-hover:text-blue-500 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </div>
        </button>
      </div>
    );
  }

  // EXPANDED VERTICAL SIDE DOCK: Placed on right edge to completely avoid writing conflict
  return (
    <div 
      data-pen-toolbar="true"
      className="pen-toolbar-container fixed right-3 top-24 z-[99999] w-56 bg-white/95 dark:bg-[#1a1c24]/95 backdrop-blur-xl border border-slate-200/90 dark:border-zinc-700/90 shadow-2xl rounded-2xl p-3 flex flex-col gap-3 select-none animate-in fade-in slide-in-from-right-4 duration-200"
      onPointerDown={handleStopPropagation}
      onPointerMove={handleStopPropagation}
      onPointerUp={handleStopPropagation}
      onMouseDown={handleStopPropagation}
      onClick={handleStopPropagation}
      style={{ pointerEvents: 'auto' }}
    >
      {/* Header with Tool Info & Collapse/Close Actions */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            {renderActiveToolIcon('w-3.5 h-3.5')}
          </div>
          <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
            {getToolDisplayName()}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsCollapsed(true)}
            className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer border-0"
            title="Minimize to side badge"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer border-0"
            title="Close Pen Mode"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2x2 Grid Tool Selector Buttons */}
      <div className="grid grid-cols-2 gap-1.5 bg-slate-100/90 dark:bg-zinc-800/80 p-1.5 rounded-xl">
        <button
          type="button"
          onClick={() => onSelectTool('pen')}
          className={`h-8 px-2 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-all cursor-pointer border-0 ${
            activeTool === 'pen'
              ? 'bg-blue-600 text-white shadow-xs font-bold'
              : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-200/80 dark:hover:bg-zinc-700'
          }`}
          title="Ballpoint Pen"
        >
          <PenTool className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Pen</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTool('fountain')}
          className={`h-8 px-2 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-all cursor-pointer border-0 ${
            activeTool === 'fountain'
              ? 'bg-blue-600 text-white shadow-xs font-bold'
              : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-200/80 dark:hover:bg-zinc-700'
          }`}
          title="Fountain Pen (Pressure sensitive)"
        >
          <Feather className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Fountain</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTool('highlighter')}
          className={`h-8 px-2 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-all cursor-pointer border-0 ${
            activeTool === 'highlighter'
              ? 'bg-amber-500 text-white shadow-xs font-bold'
              : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-200/80 dark:hover:bg-zinc-700'
          }`}
          title="Highlighter"
        >
          <Highlighter className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Highlight</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTool('eraser')}
          className={`h-8 px-2 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-all cursor-pointer border-0 ${
            activeTool === 'eraser'
              ? 'bg-rose-600 text-white shadow-xs font-bold'
              : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-200/80 dark:hover:bg-zinc-700'
          }`}
          title="Eraser: Tap or scrub over strokes"
        >
          <Eraser className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Eraser</span>
        </button>
      </div>

      {/* Color Palette (hidden for Eraser) */}
      {!isEraser && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
            Color
          </span>
          <div className="flex items-center justify-between px-1">
            {colorList.map((c) => {
              const isSelected = currentColor.toLowerCase() === c.hex.toLowerCase();
              return (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => onSelectColor(c.hex)}
                  className={`w-6 h-6 rounded-full transition-all cursor-pointer border-0 relative flex items-center justify-center ${
                    isSelected ? 'scale-115 ring-2 ring-offset-2 ring-blue-500 shadow-md' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c.hex }}
                  title={`${c.name} Color`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Stroke Width Selector (hidden for Eraser) */}
      {!isEraser && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
            Thickness
          </span>
          <div className="grid grid-cols-3 gap-1 bg-slate-100/90 dark:bg-zinc-800/80 p-1 rounded-lg">
            {widthList.map((w) => {
              const isSelected = currentWidth === w.value;
              return (
                <button
                  key={w.label}
                  type="button"
                  onClick={() => onSelectWidth(w.value)}
                  className={`h-6 rounded-md text-[11px] font-semibold transition-all cursor-pointer border-0 ${
                    isSelected 
                      ? 'bg-white dark:bg-zinc-700 text-slate-800 dark:text-zinc-100 shadow-xs' 
                      : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700'
                  }`}
                >
                  {w.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Undo / Redo & Clear Row */}
      <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onUndo}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer border-0 active:scale-95"
            title="Undo Stroke"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onRedo}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer border-0 active:scale-95"
            title="Redo Stroke"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        {showClearConfirm ? (
          <div className="flex items-center gap-1 bg-rose-50 dark:bg-rose-950/60 p-1 rounded-lg border border-rose-200 dark:border-rose-900">
            <button
              type="button"
              onClick={() => {
                onClearAll();
                setShowClearConfirm(false);
              }}
              className="h-6 px-2 rounded bg-rose-600 text-white text-[10px] font-bold border-0 cursor-pointer"
            >
              Clear All?
            </button>
            <button
              type="button"
              onClick={() => setShowClearConfirm(false)}
              className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-slate-700 border-0 bg-transparent cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="h-8 px-2 rounded-lg flex items-center gap-1 text-xs text-slate-500 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer border-0 active:scale-95"
            title="Clear all ink drawings"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        )}
      </div>
    </div>
  );
};
