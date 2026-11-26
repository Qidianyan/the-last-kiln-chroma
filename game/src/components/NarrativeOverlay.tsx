import { AUDIO_MANIFEST_BY_ID } from '../data/audioManifest';
import {
  CHOICE_ONE_OPTIONS,
  CHOICE_THREE_OPTIONS,
  CHOICE_TWO_OPTIONS,
  SCENES,
} from '../data/narrative';
import {
  computeGlazeBlend,
  getKilnZoneLabel,
  GLAZE_MINERALS,
  MAX_KILN_TEMP,
  MIN_KILN_TEMP,
  SCENE_ORDER,
} from '../engine/kilnPhysics';
import {
  computeBlackbodyRadiation,
  computeKintsugiCraftReport,
  type KintsugiSession,
} from '../kintsugi';
import type {
  ChoiceOneId,
  ChoiceThreeId,
  ChoiceTwoId,
  GlazeMineralId,
  KilnState,
} from '../types/game';

interface NarrativeOverlayProps {
  state: KilnState;
  kintsugi: KintsugiSession;
  activeCueId: string;
  onStoke: () => void;
  onToggleFlue: () => void;
  onListenEcho: () => void;
  onSelectPrimaryGlaze: (mineral: GlazeMineralId) => void;
  onSelectSecondaryGlaze: (mineral: GlazeMineralId) => void;
  onTraceNextKintsugi: () => void;
  onResetKintsugi: () => void;
  onChooseOne: (choice: ChoiceOneId) => void;
  onChooseTwo: (choice: ChoiceTwoId) => void;
  onChooseThree: (choice: ChoiceThreeId) => void;
  onNextLineOrScene: () => void;
  onUnsealEnding: () => void;
}

const MINERAL_IDS: readonly GlazeMineralId[] = ['ash', 'ochre', 'cinnabar', 'gold'];

const MINERAL_SHORT_LABELS: Record<GlazeMineralId, string> = {
  ash: 'Wood Ash',
  ochre: 'Ochre',
  cinnabar: 'Cinnabar',
  gold: 'Gold Leaf',
};

export function NarrativeOverlay({
  state,
  kintsugi,
  activeCueId,
  onStoke,
  onToggleFlue,
  onListenEcho,
  onSelectPrimaryGlaze,
  onSelectSecondaryGlaze,
  onTraceNextKintsugi,
  onResetKintsugi,
  onChooseOne,
  onChooseTwo,
  onChooseThree,
  onNextLineOrScene,
  onUnsealEnding,
}: NarrativeOverlayProps) {
  const scene = SCENES[state.scene];
  const blend = computeGlazeBlend(state.primaryGlaze, state.secondaryGlaze);
  const zone = getKilnZoneLabel(state.temperatureC);
  const blackbody = computeBlackbodyRadiation(state.temperatureC);
  const craftReport = computeKintsugiCraftReport(kintsugi, blend.blendName, state.peakTempC);
  const activeCue = AUDIO_MANIFEST_BY_ID[activeCueId];
  const isKintsugiAct = state.scene === 'vitrification';

  const tempPercent =
    ((state.temperatureC - MIN_KILN_TEMP) / (MAX_KILN_TEMP - MIN_KILN_TEMP)) * 100;
  const bandStart =
    ((scene.targetTempRange[0] - MIN_KILN_TEMP) / (MAX_KILN_TEMP - MIN_KILN_TEMP)) * 100;
  const bandWidth =
    ((scene.targetTempRange[1] - scene.targetTempRange[0]) / (MAX_KILN_TEMP - MIN_KILN_TEMP)) *
    100;

  const isLastLineOfScene = state.lineIndex >= scene.openingLines.length - 1;
  const currentLine = scene.openingLines[state.lineIndex] ?? scene.openingLines[0] ?? '';

  const needsChoiceBeforeAdvance =
    (state.scene === 'glaze' && !state.choiceOne) ||
    (state.scene === 'stoking' && !state.choiceTwo) ||
    (state.scene === 'vitrification' && !state.choiceThree);

  const canAdvanceScene =
    !isLastLineOfScene ||
    (state.scene === 'hearth' && state.temperatureC >= 700) ||
    (state.scene !== 'hearth' && !needsChoiceBeforeAdvance);

  const advanceLabel = !isLastLineOfScene
    ? 'Continue Reading'
    : state.scene === 'hearth'
      ? state.temperatureC >= 700
        ? 'Move to the Mineral Table'
        : 'Stoke Bellows to 700°C First'
      : state.scene === 'glaze'
        ? 'Load Amphora into the Kiln'
        : state.scene === 'stoking'
          ? 'Enter the Vitrification Hour'
          : state.scene === 'vitrification'
            ? 'Wait Until Dawn Unsealing'
            : 'Unseal Kiln & Reveal Relic';

  return (
    <>
      <section className="scene-banner" aria-label="Current act">
        <div>
          <h2 className="scene-heading">
            {scene.actLabel}: {scene.title}
          </h2>
          <p className="scene-location">{scene.location}</p>
        </div>

        <div className="act-dots" aria-label={`Act ${scene.index + 1} of ${SCENE_ORDER.length}`}>
          {SCENE_ORDER.map((id, idx) => (
            <span
              key={id}
              className={`act-dot ${
                idx < scene.index ? 'done' : idx === scene.index ? 'active' : ''
              }`}
            />
          ))}
        </div>
      </section>

      <div className="kiln-mid-band">
        {/* Left Instrument: Kiln Thermal Bellows, Blackbody Radiation & Flue */}
        <aside className="side-panel" aria-label="Kiln firebox telemetry">
          <h3 className="panel-heading">Kiln Pyrometer</h3>
          <div className="thermal-readout">
            <span className="thermal-value">{Math.round(state.temperatureC)}°C</span>
            <span className="thermal-target">
              Target {scene.targetTempRange[0]} to {scene.targetTempRange[1]}°C
            </span>
          </div>

          <div
            className="thermal-track"
            role="progressbar"
            aria-label="Kiln temperature"
            aria-valuemin={MIN_KILN_TEMP}
            aria-valuemax={MAX_KILN_TEMP}
            aria-valuenow={Math.round(state.temperatureC)}
          >
            <div
              className="thermal-target-band"
              style={{ left: `${bandStart}%`, width: `${bandWidth}%` }}
            />
            <div
              className="thermal-fill"
              style={{ transform: `scaleX(${Math.max(0.02, tempPercent / 100)})` }}
            />
          </div>

          <div className="blackbody-row" data-testid="blackbody-stage">
            <span
              className="blackbody-swatch"
              style={{ backgroundColor: blackbody.midHex }}
              aria-hidden="true"
            />
            <span>{blackbody.stageLabel}</span>
          </div>

          <div className="stress-row">
            <span>{zone.label}</span>
            <span className={state.thermalStress >= 45 ? 'stress-warn' : ''}>
              Stress {Math.round(state.thermalStress)}%
            </span>
          </div>

          <div className="kiln-action-row">
            <button
              type="button"
              className="action-btn primary"
              onClick={onStoke}
              data-testid="stoke-bellows-btn"
            >
              Stoke Bellows
            </button>
            <button
              type="button"
              className="action-btn"
              aria-pressed={state.flueOpen}
              onClick={onToggleFlue}
              data-testid="toggle-flue-btn"
            >
              {state.flueOpen ? 'Close Flue' : 'Vent Flue'}
            </button>
          </div>

          <button
            type="button"
            className="echo-btn"
            onClick={onListenEcho}
            data-testid="listen-echo-btn"
          >
            {state.echoListened[state.scene] ? 'Replay Memory Echo' : 'Listen to Memory Echo'}
          </button>
        </aside>

        {/* Center space deliberately kept open so the Canvas2D Kiln & Kintsugi Vessel shine */}
        <div aria-hidden="true" />

        {/* Right Instrument: Interactive Kintsugi Workbench in Act IV, Mineral Glaze Alchemy otherwise */}
        {isKintsugiAct ? (
          <aside className="side-panel" aria-label="Kintsugi gold seam repair workbench">
            <h3 className="panel-heading">Kintsugi Gold Seam Repair</h3>
            <div className="kintsugi-stats-row">
              <span className="kintsugi-coverage" data-testid="kintsugi-coverage-value">
                {kintsugi.coveragePct}%
              </span>
              <span className="kintsugi-grade-pill" data-testid="kintsugi-grade-pill">
                Grade {craftReport.grade}
              </span>
            </div>

            <div
              className="kintsugi-track"
              role="progressbar"
              aria-label="Kintsugi gold seam coverage"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={kintsugi.coveragePct}
            >
              <div
                className="kintsugi-fill"
                style={{ transform: `scaleX(${Math.max(0.02, kintsugi.coveragePct / 100)})` }}
              />
            </div>

            <div className="stress-row">
              <span>Precision {kintsugi.precisionPct}%</span>
              <span>{craftReport.gradeTitle}</span>
            </div>

            <p className="kintsugi-note">
              Drag directly across the glowing fracture seams on the vessel to inlay 24k gold dust, or trace branch by branch below.
            </p>

            <div className="kiln-action-row">
              <button
                type="button"
                className="action-btn primary"
                onClick={onTraceNextKintsugi}
                data-testid="kintsugi-trace-btn"
              >
                Trace Gold Seam
              </button>
              <button
                type="button"
                className="action-btn"
                onClick={onResetKintsugi}
                data-testid="kintsugi-reset-btn"
              >
                Clear Lacquer
              </button>
            </div>
          </aside>
        ) : (
          <aside className="side-panel" aria-label="Mineral glaze workbench">
            <h3 className="panel-heading">Mineral Glaze Formula</h3>
            <div className="glaze-summary">
              <div
                className="glaze-swatch-dual"
                style={{
                  background: `linear-gradient(135deg, ${blend.bodyHex} 0%, ${blend.lipHex} 62%, ${blend.veinHex} 100%)`,
                }}
              />
              <div>
                <div className="glaze-blend-name">{blend.blendName}</div>
                <p className="glaze-blend-note">{blend.characterNote}</p>
              </div>
            </div>

            <div className="mineral-group-label">Primary Base Slip</div>
            <div className="mineral-grid" role="group" aria-label="Primary base glaze mineral">
              {MINERAL_IDS.map((mId) => {
                const mineral = GLAZE_MINERALS[mId];
                return (
                  <button
                    key={`p-${mId}`}
                    type="button"
                    className="mineral-chip"
                    aria-pressed={state.primaryGlaze === mId}
                    onClick={() => onSelectPrimaryGlaze(mId)}
                    data-testid={`primary-glaze-${mId}`}
                  >
                    <span className="mineral-dot" style={{ backgroundColor: mineral.hex }} />
                    <span>{MINERAL_SHORT_LABELS[mId]}</span>
                  </button>
                );
              })}
            </div>

            <div className="mineral-group-label">Secondary Overglaze</div>
            <div className="mineral-grid" role="group" aria-label="Secondary overglaze mineral">
              {MINERAL_IDS.map((mId) => {
                const mineral = GLAZE_MINERALS[mId];
                return (
                  <button
                    key={`s-${mId}`}
                    type="button"
                    className="mineral-chip"
                    aria-pressed={state.secondaryGlaze === mId}
                    onClick={() => onSelectSecondaryGlaze(mId)}
                    data-testid={`secondary-glaze-${mId}`}
                  >
                    <span className="mineral-dot" style={{ backgroundColor: mineral.hex }} />
                    <span>{MINERAL_SHORT_LABELS[mId]}</span>
                  </button>
                );
              })}
            </div>
          </aside>
        )}
      </div>

      {/* Bottom Literary Subtitle Bar & Sculpted Narrative Choices */}
      <section className="narrative-dock" aria-label="Story narration and choices">
        <div className="subtitle-meta">
          <span className="speaker-tag">
            {activeCue ? activeCue.speaker : scene.actLabel}
          </span>
          <span className="vo-badge">
            {activeCue
              ? `Studio Voice: ZONOS3-Mini (${activeCue.id})`
              : 'Studio Voice & WebAudio Score'}
          </span>
        </div>

        <div aria-live="polite" aria-atomic="true">
          <p className="narrative-prose">{currentLine}</p>
          {state.echoListened[state.scene] && (
            <blockquote className="echo-quote">{scene.memoryEcho}</blockquote>
          )}
        </div>

        <p className="hint-line">
          {isKintsugiAct
            ? 'Drag along the glowing hairline fractures on the stoneware vessel to lay 24k gold dust, or choose how to meet the fracture below.'
            : scene.interactiveHint}
        </p>

        {state.scene === 'glaze' && isLastLineOfScene && (
          <div className="choice-grid" role="group" aria-label="Pivotal Choice I">
            {CHOICE_ONE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`choice-card ${state.choiceOne === opt.id ? 'selected' : ''}`}
                aria-pressed={state.choiceOne === opt.id}
                onClick={() => onChooseOne(opt.id)}
                data-testid={`choice-one-${opt.id}`}
              >
                <span className="choice-tag">{opt.memoryTag}</span>
                <span className="choice-title">{opt.label}</span>
                <span className="choice-detail">{opt.detail}</span>
              </button>
            ))}
          </div>
        )}

        {state.scene === 'stoking' && isLastLineOfScene && (
          <div className="choice-grid" role="group" aria-label="Pivotal Choice II">
            {CHOICE_TWO_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`choice-card ${state.choiceTwo === opt.id ? 'selected' : ''}`}
                aria-pressed={state.choiceTwo === opt.id}
                onClick={() => onChooseTwo(opt.id)}
                data-testid={`choice-two-${opt.id}`}
              >
                <span className="choice-tag">{opt.memoryTag}</span>
                <span className="choice-title">{opt.label}</span>
                <span className="choice-detail">{opt.detail}</span>
              </button>
            ))}
          </div>
        )}

        {state.scene === 'vitrification' && isLastLineOfScene && (
          <div className="choice-grid" role="group" aria-label="Pivotal Choice III">
            {CHOICE_THREE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`choice-card ${state.choiceThree === opt.id ? 'selected' : ''}`}
                aria-pressed={state.choiceThree === opt.id}
                onClick={() => onChooseThree(opt.id)}
                data-testid={`choice-three-${opt.id}`}
              >
                <span className="choice-tag">{opt.memoryTag}</span>
                <span className="choice-title">{opt.label}</span>
                <span className="choice-detail">{opt.detail}</span>
              </button>
            ))}
          </div>
        )}

        <div className="dock-footer">
          <div className="telemetry-strip">
            <span>Line {state.lineIndex + 1}/{scene.openingLines.length}</span>
            <span>Peak {Math.round(state.peakTempC)}°C</span>
            <span>Strokes {state.bellowsStrokes}</span>
          </div>
          <button
            type="button"
            className="advance-btn"
            aria-disabled={!canAdvanceScene}
            onClick={() => {
              if (!canAdvanceScene) return;
              if (state.scene === 'unsealing' && isLastLineOfScene) {
                onUnsealEnding();
              } else {
                onNextLineOrScene();
              }
            }}
            data-testid="advance-btn"
          >
            {advanceLabel}
          </button>
        </div>
      </section>
    </>
  );
}
