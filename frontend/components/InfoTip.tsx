"use client";
import { Lightbulb } from "lucide-react";

export default function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex group cursor-help ml-1 align-middle">
      <Lightbulb size={12} className="text-yellow-400/60 group-hover:text-yellow-400 transition-colors" />
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2
        px-3 py-2 w-56 rounded-lg bg-popover border border-border shadow-xl
        text-xs text-muted-foreground leading-relaxed
        opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 whitespace-normal">
        {text}
      </span>
    </span>
  );
}
