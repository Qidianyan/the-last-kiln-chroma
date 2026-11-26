import { useCallback, useEffect, useRef, useState } from 'react';
import { ChapterDrawer } from './components/ChapterDrawer';
import { EndingRelicModal } from './components/EndingRelicModal';
import { KilnStage } from './components/KilnStage';
import { NarrativeOverlay } from './components/NarrativeOverlay';
import {
  CHOICE_ONE_OPTIONS,
  CHOICE_THREE_OPTIONS,
  CHOICE_TWO_OPTIONS,
  ENDINGS,
  SCENES,
} from './data/narrative';
import { KilnAudioEngine } from './engine/audioEngine';
import {
  CANONICAL_ENDING_PATHS,
  createInitialKilnState,
  getKilnZoneLabel,
  getNextScene,
  resolveEnding,
  stepKilnTemperature,
} from './engine/kilnPhysics';
import {
  applyKintsugiStroke,
  generateKintsugiSkeleton,
  traceNextKintsugiBranch,
  type KintsugiSession,
} from './kintsugi';
import type {
  ChoiceOneId,
  ChoiceThreeId,
  ChoiceTwoId,
  EndingId,
  GlazeMineralId,
  KilnState,
  SceneId,
} from './types/game';

export function App() {
  const [state, setState] = useState<KilnState>(() => createInitialKilnState());
  const [kintsugi, setKintsugi] = useState<KintsugiSession>(() =>
    generateKintsugiSkeleton('ochre+cinnabar:1185'),
  );
  const [audioOn, setAudioOn] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [endingModalOpen, setEndingModalOpen] = useState(false);
  const [activeCueId, setActiveCueId] = useState<string>('vo_act1_hearth');
  const [bellowsSignal, setBellowsSignal] = useState(0);
  const [echoSignal, setEchoSignal] = useState(0);
  const [glazeSignal, setGlazeSignal] = useState(0);

  const audioRef = useRef<KilnAudioEngine | null>(null);
  if (!audioRef.current) {
    audioRef.current = new KilnAudioEngine();
  }

  useEffect(() => {
    const engine = audioRef.current;
    return () => {
      engine?.dispose();
    };
  }, []);

  useEffect(() => {
    if (endingModalOpen && state.ending) {
      document.title = `${ENDINGS[state.ending].title} | The Last Kiln of Ember Valley`;
      return;
    }
    const scene = SCENES[state.scene];
    document.title = `${scene.actLabel}: ${scene.title} | The Last Kiln of Ember Valley`;
  }, [state.scene, state.ending, endingModalOpen]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setState((prev) => {
        if (prev.scene === 'unsealing' && prev.temperatureC <= 660) {
          return prev;
        }
        const next = stepKilnTemperature(prev, 0.25, 'idle');
        if (next.temperatureC === prev.temperatureC && next.thermalStress === prev.thermalStress) {
          return prev;
        }
        return {
          ...prev,
          temperatureC: next.temperatureC,
          peakTempC: next.peakTempC,
          thermalVelocity: next.thermalVelocity,
          thermalStress: next.thermalStress,
        };
      });
    }, 250);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    audioRef.current?.updateTemperature(state.temperatureC);
  }, [state.temperatureC]);

  const recordTempPoint = (prev: KilnState, nextTemp: number, nextStress: number, nextScene?: SceneId) => {
    const step = prev.tempHistory.length;
    const trimmed = prev.tempHistory.slice(-40);
    return [
      ...trimmed,
      {
        step,
        scene: nextScene ?? prev.scene,
        tempC: nextTemp,
        stress: nextStress,
      },
    ];
  };

  const handleToggleAudio = useCallback(() => {
    const engine = audioRef.current;
    if (!engine) return;
    const enabled = engine.toggle();
    setAudioOn(enabled);
    if (enabled) {
      engine.triggerVoiceCue(activeCueId, true);
    }
  }, [activeCueId]);

  const handleStoke = useCallback(() => {
    setBellowsSignal((n) => n + 1);
    audioRef.current?.playBellowsWhoosh();
    setState((prev) => {
      const stepped = stepKilnTemperature(prev, 0.85, 'stoke');
      return {
        ...prev,
        ...stepped,
        tempHistory: recordTempPoint(prev, stepped.temperatureC, stepped.thermalStress),
      };
    });
  }, []);

  const handleToggleFlue = useCallback(() => {
    audioRef.current?.playCeramicChime(2);
    setState((prev) => {
      const nextFlue = !prev.flueOpen;
      const stepped = stepKilnTemperature(
        { ...prev, flueOpen: nextFlue },
        0.7,
        nextFlue ? 'vent' : 'damp',
      );
      return {
        ...prev,
        flueOpen: nextFlue,
        ...stepped,
        tempHistory: recordTempPoint(prev, stepped.temperatureC, stepped.thermalStress),
      };
    });
  }, []);

  const handleListenEcho = useCallback(() => {
    setEchoSignal((n) => n + 1);
    audioRef.current?.playCeramicChime(5);
    setState((prev) => ({
      ...prev,
      echoListened: {
        ...prev.echoListened,
        [prev.scene]: true,
      },
    }));
  }, []);

  const handleSelectPrimaryGlaze = useCallback((mineral: GlazeMineralId) => {
    setGlazeSignal((n) => n + 1);
    audioRef.current?.playCeramicChime(1);
    setState((prev) => ({
      ...prev,
      primaryGlaze: mineral,
      glazeMixed: true,
    }));
  }, []);

  const handleSelectSecondaryGlaze = useCallback((mineral: GlazeMineralId) => {
    setGlazeSignal((n) => n + 1);
    audioRef.current?.playCeramicChime(4);
    setState((prev) => ({
      ...prev,
      secondaryGlaze: mineral,
      glazeMixed: true,
    }));
  }, []);

  const handleKintsugiStroke = useCallback(
    (toX: number, toY: number, fromX?: number, fromY?: number) => {
      setKintsugi((prev) => {
        const next = applyKintsugiStroke(prev, toX, toY, fromX, fromY);
        if (next.coveragePct > prev.coveragePct && next.coveragePct % 10 === 0) {
          audioRef.current?.playCeramicChime(6);
        }
        return next;
      });
    },
    [],
  );

  const handleTraceNextKintsugi = useCallback(() => {
    audioRef.current?.playCeramicChime(6);
    setKintsugi((prev) => traceNextKintsugiBranch(prev));
  }, []);

  const handleResetKintsugi = useCallback(() => {
    audioRef.current?.playCeramicChime(0);
    setKintsugi((prev) => generateKintsugiSkeleton(`reset:${prev.seed}`));
  }, []);

  const handleChooseOne = useCallback((choice: ChoiceOneId) => {
    const spec = CHOICE_ONE_OPTIONS.find((c) => c.id === choice);
    if (spec) {
      setActiveCueId(spec.voiceCueId);
      audioRef.current?.triggerVoiceCue(spec.voiceCueId);
    }
    setState((prev) => ({ ...prev, choiceOne: choice }));
  }, []);

  const handleChooseTwo = useCallback((choice: ChoiceTwoId) => {
    const spec = CHOICE_TWO_OPTIONS.find((c) => c.id === choice);
    if (spec) {
      setActiveCueId(spec.voiceCueId);
      audioRef.current?.triggerVoiceCue(spec.voiceCueId);
    }
    setState((prev) => ({ ...prev, choiceTwo: choice }));
  }, []);

  const handleChooseThree = useCallback((choice: ChoiceThreeId) => {
    const spec = CHOICE_THREE_OPTIONS.find((c) => c.id === choice);
    if (spec) {
      setActiveCueId(spec.voiceCueId);
      audioRef.current?.triggerVoiceCue(spec.voiceCueId);
    }
    if (choice === 'kintsugi') {
      setKintsugi((prev) => (prev.coveragePct < 25 ? traceNextKintsugiBranch(prev) : prev));
    }
    setState((prev) => ({ ...prev, choiceThree: choice }));
  }, []);

  const handleNextLineOrScene = useCallback(() => {
    setState((prev) => {
      const currentScene = SCENES[prev.scene];
      if (prev.lineIndex < currentScene.openingLines.length - 1) {
        return { ...prev, lineIndex: prev.lineIndex + 1 };
      }

      const nextSceneId = getNextScene(prev.scene);
      if (!nextSceneId) return prev;

      const nextDef = SCENES[nextSceneId];
      setActiveCueId(nextDef.voiceCueId);
      audioRef.current?.triggerVoiceCue(nextDef.voiceCueId);

      let adjustedTemp = prev.temperatureC;
      if (nextSceneId === 'stoking' && adjustedTemp < 960) adjustedTemp = 995;
      if (nextSceneId === 'vitrification') {
        if (adjustedTemp < 1155) adjustedTemp = 1185;
        setKintsugi(
          generateKintsugiSkeleton(
            `${prev.primaryGlaze}+${prev.secondaryGlaze}:${Math.round(Math.max(prev.peakTempC, adjustedTemp))}`,
          ),
        );
      }
      if (nextSceneId === 'unsealing') adjustedTemp = 665;

      const nextPeak = Math.max(prev.peakTempC, adjustedTemp);
      return {
        ...prev,
        scene: nextSceneId,
        lineIndex: 0,
        temperatureC: adjustedTemp,
        peakTempC: nextPeak,
        tempHistory: recordTempPoint(prev, adjustedTemp, prev.thermalStress, nextSceneId),
      };
    });
  }, []);

  const handleUnsealEnding = useCallback(() => {
    setState((prev) => {
      const ending = resolveEnding(prev);
      const endingDef = ENDINGS[ending];
      setActiveCueId(endingDef.voiceCueId);
      audioRef.current?.triggerVoiceCue(endingDef.voiceCueId);
      return {
        ...prev,
        ending,
        tempHistory: recordTempPoint(prev, prev.temperatureC, prev.thermalStress, 'unsealing'),
      };
    });
    setEndingModalOpen(true);
  }, []);

  const handleJumpScene = useCallback((targetScene: SceneId) => {
    const targetDef = SCENES[targetScene];
    setActiveCueId(targetDef.voiceCueId);
    audioRef.current?.triggerVoiceCue(targetDef.voiceCueId);
    const defaultTempByScene: Record<SceneId, number> = {
      hearth: 660,
      glaze: 840,
      stoking: 1055,
      vitrification: 1195,
      unsealing: 665,
    };
    const nextTemp = defaultTempByScene[targetScene];
    if (targetScene === 'vitrification') {
      setKintsugi(generateKintsugiSkeleton(`jump:${nextTemp}`));
    }
    setState((prev) => ({
      ...prev,
      scene: targetScene,
      lineIndex: targetDef.openingLines.length - 1,
      temperatureC: nextTemp,
      peakTempC: Math.max(prev.peakTempC, nextTemp),
      tempHistory: recordTempPoint(prev, nextTemp, prev.thermalStress, targetScene),
    }));
  }, []);

  const handlePreviewEnding = useCallback((endingId: EndingId) => {
    const preset = CANONICAL_ENDING_PATHS.find((p) => p.ending === endingId);
    if (!preset) return;
    const endingDef = ENDINGS[endingId];
    setActiveCueId(endingDef.voiceCueId);
    audioRef.current?.triggerVoiceCue(endingDef.voiceCueId);
    let previewKintsugi = generateKintsugiSkeleton(
      `${preset.primaryGlaze}+${preset.secondaryGlaze}:${preset.peakTempC}`,
    );
    if (endingId === 'gilded_reliquary') {
      for (let i = 0; i < 4; i += 1) {
        previewKintsugi = traceNextKintsugiBranch(previewKintsugi);
      }
    }
    setKintsugi(previewKintsugi);
    setState((prev) => ({
      ...prev,
      scene: 'unsealing',
      lineIndex: SCENES.unsealing.openingLines.length - 1,
      primaryGlaze: preset.primaryGlaze,
      secondaryGlaze: preset.secondaryGlaze,
      glazeMixed: true,
      choiceOne: preset.choiceOne,
      choiceTwo: preset.choiceTwo,
      choiceThree: preset.choiceThree,
      temperatureC: 665,
      peakTempC: preset.peakTempC,
      thermalStress: preset.thermalStress,
      bellowsStrokes: Math.max(prev.bellowsStrokes, 9),
      ending: endingId,
      tempHistory: [
        { step: 0, scene: 'hearth', tempC: 645, stress: 0 },
        { step: 1, scene: 'hearth', tempC: 790, stress: 0 },
        { step: 2, scene: 'glaze', tempC: 880, stress: 0 },
        { step: 3, scene: 'stoking', tempC: 1090, stress: 6 },
        { step: 4, scene: 'vitrification', tempC: preset.peakTempC, stress: preset.thermalStress },
        { step: 5, scene: 'unsealing', tempC: 665, stress: 0 },
      ],
    }));
    setEndingModalOpen(true);
  }, []);

  const handleReplay = useCallback(() => {
    setEndingModalOpen(false);
    const fresh = createInitialKilnState();
    setState(fresh);
    setKintsugi(generateKintsugiSkeleton('ochre+cinnabar:1185'));
    setActiveCueId('vo_act1_hearth');
    audioRef.current?.triggerVoiceCue('vo_act1_hearth');
  }, []);

  const zone = getKilnZoneLabel(state.temperatureC);

  return (
    <div className="app-shell">
      <a href="#main-stage" className="skip-link visually-hidden">
        Skip to main kiln stage
      </a>

      <KilnStage
        state={state}
        kintsugi={kintsugi}
        bellowsSignal={bellowsSignal}
        echoSignal={echoSignal}
        glazeSignal={glazeSignal}
        onKintsugiStroke={handleKintsugiStroke}
      />

      <header className="top-header">
        <div className="brand-lockup">
          <svg
            className="brand-mark"
            viewBox="0 0 40 40"
            aria-hidden="true"
          >
            <circle cx="20" cy="20" r="18" fill="#221A16" stroke="#DBA13C" strokeWidth="1.5" />
            <path
              d="M14 29 C11 22, 11 16, 16 12 L15 9 L25 9 L24 12 C29 16, 29 22, 26 29 Z"
              fill="#E65A28"
              stroke="#F7DDA0"
              strokeWidth="1.2"
            />
            <path d="M19 12 L17 20 L22 24 L20 29" fill="none" stroke="#F7DDA0" strokeWidth="1.3" />
          </svg>
          <div className="brand-titles">
            <h1 className="brand-title">The Last Kiln of Ember Valley</h1>
            <span className="brand-subline">Interactive Ceramic Fable, Chroma Awards Season 2</span>
          </div>
        </div>

        <nav className="header-nav" aria-label="Kiln controls">
          <div className="temp-pill" aria-label={`Kiln temperature ${Math.round(state.temperatureC)} degrees Celsius`}>
            <span className="temp-dot" aria-hidden="true" />
            <span>{Math.round(state.temperatureC)}°C</span>
            <span className="temp-zone-tag">{zone.label}</span>
          </div>

          <button
            type="button"
            className="nav-btn"
            aria-pressed={audioOn}
            onClick={handleToggleAudio}
            data-testid="audio-toggle-btn"
          >
            {audioOn ? 'Studio Voice: On' : 'Play Studio Voice'}
          </button>

          <button
            type="button"
            className="nav-btn"
            onClick={() => setChaptersOpen(true)}
            data-testid="chapters-btn"
          >
            Chapters &amp; Archive
          </button>
        </nav>
      </header>

      <main id="main-stage" className="stage-main" tabIndex={-1}>
        <NarrativeOverlay
          state={state}
          kintsugi={kintsugi}
          activeCueId={activeCueId}
          onStoke={handleStoke}
          onToggleFlue={handleToggleFlue}
          onListenEcho={handleListenEcho}
          onSelectPrimaryGlaze={handleSelectPrimaryGlaze}
          onSelectSecondaryGlaze={handleSelectSecondaryGlaze}
          onTraceNextKintsugi={handleTraceNextKintsugi}
          onResetKintsugi={handleResetKintsugi}
          onChooseOne={handleChooseOne}
          onChooseTwo={handleChooseTwo}
          onChooseThree={handleChooseThree}
          onNextLineOrScene={handleNextLineOrScene}
          onUnsealEnding={handleUnsealEnding}
        />
      </main>

      <ChapterDrawer
        open={chaptersOpen}
        currentScene={state.scene}
        onClose={() => setChaptersOpen(false)}
        onJumpScene={handleJumpScene}
        onPreviewEnding={handlePreviewEnding}
      />

      <EndingRelicModal
        open={endingModalOpen}
        endingId={state.ending}
        state={state}
        kintsugi={kintsugi}
        onClose={() => setEndingModalOpen(false)}
        onReplay={handleReplay}
      />
    </div>
  );
}

export default App;
