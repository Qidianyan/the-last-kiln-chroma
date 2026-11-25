import { useEffect, useRef } from 'react';
import { PainterlyKilnRenderer } from '../engine/painterlyCanvas';
import type { KilnState } from '../types/game';

interface KilnStageProps {
  state: KilnState;
  bellowsSignal: number;
  echoSignal: number;
  glazeSignal: number;
}

export function KilnStage({
  state,
  bellowsSignal,
  echoSignal,
  glazeSignal,
}: KilnStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<PainterlyKilnRenderer | null>(null);
  const stateRef = useRef<KilnState>(state);
  stateRef.current = state;

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

  return (
    <div className="kiln-canvas-layer" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
