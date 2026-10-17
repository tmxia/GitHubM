import { useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface Props {
  src: string;
  alt?: string;
  onClose: () => void;
}

export default function ImageLightbox({ src, alt, onClose }: Props) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });

  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const panStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const pinchStartRef = useRef<{ dist: number; scale: number } | null>(null);

  
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const zoomBy = (factor: number) => {
    setScale((s) => {
      const next = Math.min(8, Math.max(1, s * factor));
      if (next === 1) setTranslate({ x: 0, y: 0 });
      return next;
    });
  };

  const reset = () => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    zoomBy(e.deltaY > 0 ? 0.9 : 1.1);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      panStartRef.current = { x: e.clientX, y: e.clientY, tx: translate.x, ty: translate.y };
      pinchStartRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      pinchStartRef.current = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        scale,
      };
      panStartRef.current = null;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const pts = Array.from(pointersRef.current.values());

    if (pts.length === 1 && panStartRef.current && scale > 1) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setTranslate({ x: panStartRef.current.tx + dx, y: panStartRef.current.ty + dy });
    } else if (pts.length === 2 && pinchStartRef.current) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const factor = dist / pinchStartRef.current.dist;
      const newScale = Math.min(8, Math.max(1, pinchStartRef.current.scale * factor));
      setScale(newScale);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 1) {
      const remaining = Array.from(pointersRef.current.values())[0];
      panStartRef.current = { x: remaining.x, y: remaining.y, tx: translate.x, ty: translate.y };
      pinchStartRef.current = null;
    } else if (pointersRef.current.size === 0) {
      panStartRef.current = null;
      pinchStartRef.current = null;
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center overflow-hidden select-none"
      onClick={onClose}
    >
      <div
        className="absolute top-3 right-3 flex gap-2 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => zoomBy(1.5)}
          className="p-2 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
          aria-label="放大"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(0.67)}
          className="p-2 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
          aria-label="缩小"
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={reset}
          className="p-2 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
          aria-label="重置"
        >
          <RotateCcw className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
          aria-label="关闭"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <img
        src={src}
        alt={alt || ''}
        draggable={false}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={() => (scale > 1 ? reset() : setScale(2))}
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          transition: pointersRef.current.size === 0 ? 'transform 0.2s ease-out' : 'none',
          touchAction: 'none',
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          cursor: scale > 1 ? 'grab' : 'zoom-in',
          userSelect: 'none',
        }}
      />

      {scale > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/60 pointer-events-none">
          {Math.round(scale * 100)}% · 双指缩放 / 拖动平移
        </div>
      )}
    </div>
  );
}
