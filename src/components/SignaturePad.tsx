import { useEffect, useRef, useState } from "react";

interface SignaturePadProps {
  value?: string | null; // dataURL או path קיים
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}

const HEIGHT = 180;

export default function SignaturePad({ value, onChange, disabled }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const hasStrokeRef = useRef(false);
  const lastEmittedRef = useRef<string | null>(null);
  const [mode, setMode] = useState<"view" | "draw">(value ? "view" : "draw");

  useEffect(() => {
    // אם ה-value שהתקבל הוא בדיוק מה ש-SignaturePad עצמו שידר ב-onChange
    // (משיכה שהסתיימה), אין לעבור למצב "view" — הקנבס צריך להישאר פעיל
    // לצורך משיכות נוספות. מעבר ל-view קורה רק כשה-value מגיע מבחוץ
    // (חתימה קיימת שנטענה מהשרת, למשל).
    if (value && value === lastEmittedRef.current) return;
    setMode(value ? "view" : "draw");
  }, [value]);

  useEffect(() => {
    if (mode !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    canvas.width = width * ratio;
    canvas.height = HEIGHT * ratio;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, HEIGHT);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#000000";
    hasStrokeRef.current = false;
  }, [mode]);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = getPoint(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !lastPointRef.current) return;

    const point = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
    hasStrokeRef.current = true;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    if (canvas && hasStrokeRef.current) {
      const dataUrl = canvas.toDataURL("image/png");
      lastEmittedRef.current = dataUrl;
      onChange(dataUrl);
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      hasStrokeRef.current = false;
    }
    lastEmittedRef.current = null;
    onChange(null);
  };

  const handleResign = () => {
    setMode("draw");
  };

  if (mode === "view" && value) {
    return (
      <div className="space-y-2">
        <div
          className="w-full rounded-lg border border-slate-300 bg-white overflow-hidden flex items-center justify-center"
          style={{ height: HEIGHT }}
        >
          <img src={value} alt="חתימה" className="max-h-full max-w-full object-contain" />
        </div>
        {!disabled && (
          <button type="button" onClick={handleResign} className="btn-ghost">
            חתום מחדש
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="w-full rounded-lg border border-slate-300 bg-white"
        style={{ height: HEIGHT, touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      {!disabled && (
        <button type="button" onClick={handleClear} className="btn-ghost">
          נקה
        </button>
      )}
    </div>
  );
}
