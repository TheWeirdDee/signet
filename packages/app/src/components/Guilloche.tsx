"use client";

import { useEffect, useRef } from "react";

/**
 * Guilloché rosette — anti-counterfeit linework, ported from the landing spec.
 * Hypotrochoid family drawn as SVG paths; stroke-draw animation unless the
 * user prefers reduced motion.
 */
export function Guilloche() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el || el.childElementCount > 0) return;

    const W = 1080,
      H = 720,
      cx = W * 0.72,
      cy = H * 0.42;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

    function rose(R: number, r: number, d: number, turns: number, step: number) {
      let path = "M";
      let first = true;
      for (let t = 0; t <= Math.PI * 2 * turns; t += step) {
        const k = (R - r) / r;
        const x = cx + (R - r) * Math.cos(t) + d * Math.cos(k * t);
        const y = cy + (R - r) * Math.sin(t) - d * Math.sin(k * t);
        path += (first ? "" : "L") + x.toFixed(1) + " " + y.toFixed(1);
        first = false;
      }
      return path;
    }

    const layers = [
      { R: 210, r: 34, d: 80, turns: 17, op: 0.3, w: 0.6 },
      { R: 170, r: 23, d: 64, turns: 23, op: 0.24, w: 0.5 },
      { R: 250, r: 47, d: 96, turns: 47, op: 0.16, w: 0.5 },
      { R: 120, r: 17, d: 44, turns: 17, op: 0.22, w: 0.5 },
    ];
    layers.forEach((L, i) => {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", rose(L.R, L.r, L.d, L.turns, 0.03));
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", "var(--ink)");
      p.setAttribute("stroke-width", String(L.w));
      p.setAttribute("opacity", String(L.op));
      if (!reduce) {
        const len = 1600 + i * 400;
        p.style.strokeDasharray = String(len);
        p.style.strokeDashoffset = String(len);
        p.style.animation = `draw 2.6s ${i * 0.25}s cubic-bezier(.4,.1,.2,1) forwards`;
      }
      svg.appendChild(p);
    });
    [300, 260].forEach((r) => {
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", String(cx));
      c.setAttribute("cy", String(cy));
      c.setAttribute("r", String(r));
      c.setAttribute("fill", "none");
      c.setAttribute("stroke", "var(--ink)");
      c.setAttribute("stroke-width", ".5");
      c.setAttribute("opacity", ".10");
      svg.appendChild(c);
    });
    el.appendChild(svg);
  }, []);

  return <div className="guilloche" ref={host} aria-hidden="true" />;
}
