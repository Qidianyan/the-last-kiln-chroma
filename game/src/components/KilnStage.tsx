import { useEffect, useRef } from 'react';
import { PainterlyKilnRenderer } from '../engine/painterlyCanvas';
import type { KintsugiSession } from '../kintsugi';
import type { KilnState } from '../types/game';

interface KilnStageProps {
  state: KilnState;
  kintsugi: KintsugiSession;
  bellowsSignal: number;
  echoSignal: number;
  glazeSignal: number;
  onKintsugiStroke: (toX: number, toY: number, fromX?: number, fromY?: number) => void;
}

export function KilnStage({
  state,
  kintsugi,
  bellowsSignal,
  echoSignal,
  glazeSignal,
  onKintsugiStroke,
}: KilnStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<PainterlyKilnRenderer | null>(null);
  const stateRef = useRef<KilnState>(state);
  const kintsugiRef = useRef<KintsugiSession>(kintsugi);
  const draggingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);

  stateRef.current = state;
  kintsugiRef.current = kintsugi;

  useEffect(() => {
    if (!rendererRef.current) {
      rendererRef.current = new PainterlyKilnRenderer();
    }
    if (bellowsSignal > 0) {
      rendererRef.current.triggerBellowsSurge();
    }
  }, [bellowsSignal]);

  useEffect(() => {
    if (echoSignal > 0 && rendererRef.current) {
      rendererRef.current.triggerEchoWave();
    }
  }, [echoSignal]);

  useEffect(() => {
    if (glazeSignal > 0 && rendererRef.current) {
      rendererRef.current.triggerGlazeSwirl();
    }
  }, [glazeSignal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!rendererRef.current) {
      rendererRef.current = new PainterlyKilnRenderer();
    }
    const renderer = rendererRef.current;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionQuery.matches;
    const onMotionChange = (ev: MediaQueryListEvent) => {
      reducedMotion = ev.matches;
    };
    motionQuery.addEventListener('change', onMotionChange);

    let rafId = 0;
    let lastTs = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const targetW = Math.max(320, Math.round(rect.width * dpr));
      const targetH = Math.max(240, Math.round(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const frame = (ts: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
      lastTs = ts;
      const rect = canvas.getBoundingClientRect();
      renderer.render(
        ctx,
        rect.width,
        rect.height,
        ts / 1000,
        dt,
        stateRef.current,
        reducedMotion,
        kintsugiRef.current,
      );
      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      motionQuery.removeEventListener('change', onMotionChange);
    };
  }, []);

  const interactiveRepair = state.scene === 'vitrification';

  useEffect(() => {
    if (!interactiveRepair) {
      draggingRef.current = false;
      lastPtRef.current = null;
    }
  }, [interactiveRepair]);

  const toNormalized = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const rawX = (ev.clientX - rect.left) / Math.max(1, rect.width);
    const rawY = (ev.clientY - rect.top) / Math.max(1, rect.height);
    return {
      x: Math.max(0, Math.min(1, rawX)),
      y: Math.max(0, Math.min(1, rawY)),
    };
  };

  return (
    <div className={`kiln-canvas-layer ${interactiveRepair ? 'kintsugi-interactive' : ''}`}>
      <canvas
        ref={canvasRef}
        aria-label={
          interactiveRepair
            ? 'Interactive Kintsugi ceramic fracture repair canvas. Drag across glowing cracks to apply molten gold.'
            : undefined
        }
        aria-hidden={!interactiveRepair}
        data-testid="kiln-stage-canvas"
        onPointerDown={(ev) => {
          if (!interactiveRepair) return;
          ev.currentTarget.setPointerCapture(ev.pointerId);
          draggingRef.current = true;
          const pt = toNormalized(ev);
          lastPtRef.current = pt;
          onKintsugiStroke(pt.x, pt.y);
        }}
        onPointerMove={(ev) => {
          if (!interactiveRepair || !draggingRef.current) return;
          const pt = toNormalized(ev);
          const prev = lastPtRef.current;
          lastPtRef.current = pt;
          onKintsugiStroke(pt.x, pt.y, prev?.x, prev?.y);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
          lastPtRef.current = null;
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
          lastPtRef.current = null;
        }}
      />
    </div>
  );
}
