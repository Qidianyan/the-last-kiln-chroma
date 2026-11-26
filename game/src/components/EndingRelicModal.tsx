import { useEffect, useId, useRef } from 'react';
import { ENDINGS } from '../data/narrative';
import { computeGlazeBlend } from '../engine/kilnPhysics';
import { renderRelicCardToCanvas } from '../engine/painterlyCanvas';
import { computeKintsugiCraftReport, type KintsugiSession } from '../kintsugi';
import type { EndingId, KilnState } from '../types/game';

interface EndingRelicModalProps {
  open: boolean;
  endingId: EndingId | null;
  state: KilnState;
  kintsugi: KintsugiSession;
  onClose: () => void;
  onReplay: () => void;
}

export function EndingRelicModal({
  open,
  endingId,
  state,
  kintsugi,
  onClose,
  onReplay,
}: EndingRelicModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const cardCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const headingId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && endingId) {
      if (!dialog.open) {
        dialog.showModal();
      }
      if (cardCanvasRef.current) {
        renderRelicCardToCanvas(cardCanvasRef.current, state, endingId, kintsugi);
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open, endingId, state, kintsugi]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };
    dialog.addEventListener('close', handleClose);

    // Feature-detected fallback where <dialog closedby="any"> is unsupported
    let cleanupFallback: (() => void) | undefined;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const isOutside = (ev: PointerEvent) => {
        const rect = dialog.getBoundingClientRect();
        return (
          ev.clientX < rect.left ||
          ev.clientX > rect.right ||
          ev.clientY < rect.top ||
          ev.clientY > rect.bottom
        );
      };
      const onDown = (ev: PointerEvent) => {
        pressedOutside = isOutside(ev);
      };
      const onUp = (ev: PointerEvent) => {
        if (pressedOutside && isOutside(ev)) {
          dialog.close();
        }
      };
      dialog.addEventListener('pointerdown', onDown);
      dialog.addEventListener('pointerup', onUp);
      cleanupFallback = () => {
        dialog.removeEventListener('pointerdown', onDown);
        dialog.removeEventListener('pointerup', onUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      cleanupFallback?.();
    };
  }, [onClose]);

  const ending = endingId ? ENDINGS[endingId] : null;
  const blend = computeGlazeBlend(state.primaryGlaze, state.secondaryGlaze);
  const craftReport = computeKintsugiCraftReport(kintsugi, blend.blendName, state.peakTempC);

  const handleDownloadPng = () => {
    const canvas = cardCanvasRef.current;
    if (!canvas || !ending) return;
    const link = document.createElement('a');
    link.download = `ember-valley-relic-${ending.id}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <dialog
      ref={dialogRef}
      className="kiln-dialog"
      aria-labelledby={headingId}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      {ending && (
        <>
          <div className="dialog-head">
            <div>
              <h2 id={headingId} className="dialog-title">
                {ending.title}
              </h2>
              <p className="dialog-subline">{ending.subtitle}</p>
            </div>
            <form method="dialog">
              <button type="submit" value="close" className="nav-btn">
                Close Archive
              </button>
            </form>
          </div>

          <div className="dialog-body">
            <div className="ending-layout">
              <figure style={{ margin: 0 }}>
                <canvas
                  ref={cardCanvasRef}
                  className="relic-preview-canvas"
                  aria-label={`Collectible Ceramic Relic Card for ${ending.title} showing glaze ${blend.blendName} and peak firing curve at ${Math.round(state.peakTempC)} degrees Celsius`}
                />
                <figcaption className="hint-line" style={{ marginTop: '0.5rem' }}>
                  1000 × 1400 collectible Ceramic Relic Card with your real kiln firing curve.
                </figcaption>
              </figure>

              <div>
                <p className="ending-epigraph">“{ending.epigraph}”</p>
                {ending.body.map((paragraph, idx) => (
                  <p key={idx} className="ending-body-p">
                    {paragraph}
                  </p>
                ))}

                <table className="ending-meta-table">
                  <caption className="visually-hidden">
                    Firing telemetry summary for this Ceramic Relic
                  </caption>
                  <tbody>
                    <tr>
                      <th scope="row">Glaze Formula</th>
                      <td>{blend.blendName}</td>
                    </tr>
                    <tr>
                      <th scope="row">Peak Kiln Temperature</th>
                      <td>{Math.round(state.peakTempC)}°C</td>
                    </tr>
                    <tr>
                      <th scope="row">Thermal Stress</th>
                      <td>{Math.round(state.thermalStress)}%</td>
                    </tr>
                    <tr>
                      <th scope="row">Bellows Strokes</th>
                      <td>{state.bellowsStrokes}</td>
                    </tr>
                    <tr>
                      <th scope="row">Kintsugi Craft Grade</th>
                      <td>
                        Grade {craftReport.grade}: {craftReport.gradeTitle} ({craftReport.coveragePct}% gold, {craftReport.precisionPct}% precision)
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">Relic Signature</th>
                      <td>{craftReport.signature}</td>
                    </tr>
                    <tr>
                      <th scope="row">Relic Seal</th>
                      <td>{ending.sealMark}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="ending-actions">
                  <button
                    type="button"
                    className="advance-btn"
                    autoFocus
                    onClick={handleDownloadPng}
                  >
                    Download Relic Card PNG
                  </button>
                  <button
                    type="button"
                    className="action-btn"
                    onClick={onReplay}
                  >
                    Begin Another Firing
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </dialog>
  );
}
