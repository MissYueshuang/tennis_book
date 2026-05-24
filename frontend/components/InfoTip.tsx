"use client";
import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Lightbulb } from "lucide-react";

export default function InfoTip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  const [rect, setRect]       = useState<DOMRect | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  const show = useCallback(() => {
    if (ref.current) setRect(ref.current.getBoundingClientRect());
    setVisible(true);
  }, []);

  const tooltip = visible && rect ? (
    <div
      className="fixed z-[9999] px-3 py-2.5 rounded-xl shadow-2xl pointer-events-none
        bg-white border border-gray-200 text-gray-800 text-xs leading-relaxed font-normal"
      style={{
        width: 240,
        top:  rect.top - 8,
        left: rect.left + rect.width / 2,
        transform: "translate(-50%, -100%)",
      }}
    >
      <div className="mb-1.5 flex items-center gap-1 font-semibold text-gray-900 text-xs">
        <Lightbulb size={11} className="text-yellow-500 shrink-0" />
        How to interpret
      </div>
      {text}
      {/* Down-pointing arrow */}
      <div className="absolute left-1/2 -translate-x-1/2 top-full">
        <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-gray-200" />
        <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-white -mt-[6px]" />
      </div>
    </div>
  ) : null;

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={() => setVisible(false)}
        className="inline-flex cursor-help ml-1 align-middle shrink-0"
      >
        <Lightbulb
          size={12}
          className={visible
            ? "text-yellow-400"
            : "text-yellow-400/50 hover:text-yellow-400 transition-colors"}
        />
      </span>
      {typeof window !== "undefined" && tooltip
        ? createPortal(tooltip, document.body)
        : null}
    </>
  );
}
