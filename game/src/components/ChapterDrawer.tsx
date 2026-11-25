import { useEffect, useId, useRef } from 'react';
import { ELEVENLABS_AUDIO_MANIFEST } from '../data/audioManifest';
import { ENDINGS, SCENES } from '../data/narrative';
import { CANONICAL_ENDING_PATHS, SCENE_ORDER } from '../engine/kilnPhysics';
import type { EndingId, SceneId } from '../types/game';

interface ChapterDrawerProps {
  open: boolean;
  currentScene: SceneId;
  onClose: () => void;
  onJumpScene: (scene: SceneId) => void;
  onPreviewEnding: (ending: EndingId) => void;
}

export function ChapterDrawer({
  open,
  currentScene,
  onClose,
  onJumpScene,
  onPreviewEnding,
}: ChapterDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const headingId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };
    dialog.addEventListener('close', handleClose);

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
        if (pressedOutside && isOutside(ev)) dialog.close();
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

  return (
    <dialog
      ref={dialogRef}
      className="kiln-dialog"
      aria-labelledby={headingId}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <div className="dialog-head">
        <div>
          <h2 id={headingId} className="dialog-title">
            Chapters &amp; Relic Archive
          </h2>
          <p className="dialog-subline">Keeper’s firing log and ZONOS3 / ElevenLabs voice manifest</p>
        </div>
        <form method="dialog">
          <button type="submit" value="close" className="nav-btn" autoFocus>
            Return to Kiln
          </button>
        </form>
      </div>

      <div className="dialog-body">
        <h3 className="panel-heading">Jump to Any Act</h3>
        <ul className="chapter-list" role="list">
          {SCENE_ORDER.map((sceneId) => {
            const scene = SCENES[sceneId];
            return (
              <li key={sceneId}>
                <button
                  type="button"
                  className="chapter-btn"
                  aria-current={currentScene === sceneId ? 'step' : undefined}
                  onClick={() => {
                    onJumpScene(sceneId);
                    dialogRef.current?.close();
                  }}
                >
                  <div className="choice-tag">{scene.actLabel}</div>
                  <div className="choice-title">{scene.title}</div>
                  <div className="choice-detail">{scene.location}</div>
                </button>
              </li>
            );
          })}
        </ul>

        <h3 className="panel-heading">Inspect All 4 Ending Relics</h3>
        <ul className="chapter-list" role="list">
          {CANONICAL_ENDING_PATHS.map((preset) => {
            const ending = ENDINGS[preset.ending];
            return (
              <li key={preset.ending}>
                <button
                  type="button"
                  className="chapter-btn"
                  onClick={() => {
                    onPreviewEnding(preset.ending);
                    dialogRef.current?.close();
                  }}
                >
                  <div className="choice-tag">{ending.sealMark}</div>
                  <div className="choice-title">{ending.title}</div>
                  <div className="choice-detail">{ending.subtitle}</div>
                </button>
              </li>
            );
          })}
        </ul>

        <h3 className="panel-heading">
          Studio Voice &amp; ElevenLabs Manifest ({ELEVENLABS_AUDIO_MANIFEST.length} Cues)
        </h3>
        <div className="manifest-list">
          {ELEVENLABS_AUDIO_MANIFEST.map((cue) => (
            <div key={cue.id} className="manifest-row">
              <strong>{cue.id}</strong> ({cue.speaker}, {cue.elevenLabsVoiceName}){' '}
              <code>{cue.audioPath}</code>
            </div>
          ))}
        </div>
      </div>
    </dialog>
  );
}
