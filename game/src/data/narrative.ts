import type {
  ChoiceOneId,
  ChoiceThreeId,
  ChoiceTwoId,
  EndingDefinition,
  EndingId,
  NarrativeChoice,
  SceneDefinition,
  SceneId,
} from '../types/game';

export const SCENES: Record<SceneId, SceneDefinition> = {
  hearth: {
    id: 'hearth',
    index: 0,
    actLabel: 'ACT I',
    title: 'The Cooling Hearth',
    location: 'Upper Terrace · Brick Tunnel Kiln No. 4',
    targetTempRange: [740, 880],
    openingLines: [
      'After the reservoir dried and the smelters went cold, the people of Ember Valley learned a quieter trade: nothing written on paper outlived the ash winds, so they glazed what mattered onto river clay and fired it into stone.',
      'Master Orin stacked the last cord of dry pine before winter took his breath. By dawn only one unglazed amphora stands on the cedar rack, and only enough coal remains in the pit for a single firing.',
      'You lay your palm against the brick arch. The ash bed still holds a stubborn pulse of heat. Work the leather bellows until the hearth wakes past 740°C.',
    ],
    memoryEcho:
      '“Keep your ear to the flue, Tala. Clay remembers the hand that pressed it, and fire decides whether the memory bends or sings.” — Master Orin',
    voiceCueId: 'vo_act1_hearth',
    interactiveHint:
      'Stoke the kiln bellows to raise the firebox above 740°C, or listen to Master Orin’s hearth echo before moving to the mineral table.',
  },
  glaze: {
    id: 'glaze',
    index: 1,
    actLabel: 'ACT II',
    title: 'The Mineral Table',
    location: 'Glazing Bench · Four Stoneware Mortars',
    targetTempRange: [820, 960],
    openingLines: [
      'Four mortars wait in a row beside the wheel: wood ash from felled orchards, riverbank ochre, red cinnabar carried over the ridge, and the last thin leaves of hammered gold.',
      'Every glaze bends the voice of the finished jar. Ash dries into blunt honesty; ochre warms the clay like skin; cinnabar drinks smoke until it glows; gold seeks out every crack the fire will carve.',
      'Blend two minerals for the amphora’s coat, then press your first chosen memory into its damp inner wall before the slip sets.',
    ],
    memoryEcho:
      'A pestle grinds ochre against basalt. Somewhere down the terraced slope, wooden buckets knock together in an orchard that no longer bears leaves.',
    voiceCueId: 'vo_act2_glaze',
    interactiveHint:
      'Select a Primary Base and Secondary Overglaze to repaint the live ceramic vessel, then seal Memory I.',
  },
  stoking: {
    id: 'stoking',
    index: 2,
    actLabel: 'ACT III',
    title: 'The Stoking Watch',
    location: 'Firebox Mouth · Between Oxidation and Reduction',
    targetTempRange: [980, 1170],
    openingLines: [
      'Dusk slides across the canyon rim. Inside the peephole, the clay loses its raw bone color and turns the dull orange of split apricot. Now begins the long watch where impatient keepers ruin a season’s work.',
      'Stoke too fiercely and the flame blisters the slip; starve the grate and the silica never fuses into glass. Between 980°C and 1170°C, stoneware finds its resonance.',
      'Hold the fire steady while you decide which human voice to bind inside the vessel’s hollow shoulder.',
    ],
    memoryEcho:
      'Through the brick spy-hole, flames fold over the jar like amber ribbon. The kiln breathes in long, dry sighs that sound almost like a crowded kitchen.',
    voiceCueId: 'vo_act3_stoking',
    interactiveHint:
      'Balance Bellows and Flue Vent to bring the kiln into the Stoneware Heart (980°C–1170°C), then bind Memory II.',
  },
  vitrification: {
    id: 'vitrification',
    index: 3,
    actLabel: 'ACT IV',
    title: 'The Vitrification Hour',
    location: 'Midnight Chamber · Peak Incandescence',
    targetTempRange: [1150, 1265],
    openingLines: [
      'Near midnight the pyrometric cone bends like a bowing reed. The chamber climbs toward white-amber heat, and every grain of river silt begins to melt into glass.',
      'Then a winter gale slams down the pass. Cold draft kisses the spy-brick, and a thin bright seam opens across the vessel’s shoulder—ticking like frost on a pond.',
      'The woodpile is down to its final armful. Before the coals sink back to dark ash, choose how this last vessel meets the break.',
    ],
    memoryEcho:
      'A sharp ceramic ping rings behind the mortar wall—the unmistakable voice of stone under tension asking what you are willing to spend to keep it.',
    voiceCueId: 'vo_act4_vitrification',
    interactiveHint:
      'Watch the glowing fracture spread across the vessel. Keep thermal stress below shatter threshold unless you wish the fire to break it, then choose the Final Sacrifice.',
  },
  unsealing: {
    id: 'unsealing',
    index: 4,
    actLabel: 'ACT V',
    title: 'The Unsealing at Dawn',
    location: 'Cooling Apron · First Pale Light Over Ember Valley',
    targetTempRange: [600, 740],
    openingLines: [
      'By sunrise the chimney stops breathing smoke. Fine gray ash settles over the courtyard flagstones like warm snow, and the brick arch gives off the quiet smell of baked earth and rain.',
      'You pry away the daubed brick door with a cedar stave. Warm air spills past your sleeves—the last breath of the valley’s oldest fire.',
      'Lift the finished vessel from the sagger bed and inspect what survived the night.',
    ],
    memoryEcho:
      'As the jar cools in morning air, tiny glazes sing a fading chord—one final bell-note hanging over the empty terraces.',
    voiceCueId: 'vo_act5_unsealing',
    interactiveHint:
      'Unseal the chamber to witness your illustrated ending and mint your bespoke Ceramic Relic Card.',
  },
};

export const CHOICE_ONE_OPTIONS: readonly NarrativeChoice<ChoiceOneId>[] = [
  {
    id: 'harvest',
    label: 'The Orchard’s Last Harvest',
    memoryTag: 'Tenderness · Living Memory',
    detail:
      'Press dried persimmon stems and warm orchard dust into the inner clay—preserving how the valley tasted when neighbors shared baskets over low stone walls.',
    voiceCueId: 'vo_choice1_harvest',
  },
  {
    id: 'ledger',
    label: 'The Bridge-Builder’s Ledger',
    memoryTag: 'Craft · Structural Memory',
    detail:
      'Inscribe the exact flood heights, masonry arches, and mortar ratios that kept the river crossings standing for four generations.',
    voiceCueId: 'vo_choice1_ledger',
  },
];

export const CHOICE_TWO_OPTIONS: readonly NarrativeChoice<ChoiceTwoId>[] = [
  {
    id: 'lullaby',
    label: 'The Mill-Keeper’s Lullaby',
    memoryTag: 'Intimate Voice · Resonance',
    detail:
      'Score three rhythmic acoustic grooves around the vessel’s waist so wind across its rim hums the lullaby parents sang during the autumn storms.',
    voiceCueId: 'vo_choice2_lullaby',
  },
  {
    id: 'warning',
    label: 'The Warning Carved at the Pass',
    memoryTag: 'Hard Truth · Historical Witness',
    detail:
      'Cut plain, unsoftened characters naming the mines and canals that bled the watershed dry—so the next settlers do not mistake ruins for luck.',
    voiceCueId: 'vo_choice2_warning',
  },
];

export const CHOICE_THREE_OPTIONS: readonly NarrativeChoice<ChoiceThreeId>[] = [
  {
    id: 'kintsugi',
    label: 'Pour the Last Gold Leaf into the Seams',
    memoryTag: 'Kintsugi Endurance',
    detail:
      'Feed Master Orin’s final gold sheets through the top port so molten amber seals every fracture into luminous proof that damage can still hold water.',
    voiceCueId: 'vo_choice3_kintsugi',
  },
  {
    id: 'unmended',
    label: 'Seal the Vessel Unmended in Raw Ash',
    memoryTag: 'Honest Stone Witness',
    detail:
      'Bank clean pine ash over the glowing embers and close the damper. Let the clay keep its exact scars and color without ornament or disguise.',
    voiceCueId: 'vo_choice3_unmended',
  },
  {
    id: 'open_door',
    label: 'Crack the Kiln Door Early to Warm the Valley',
    memoryTag: 'Heat Given to the Living',
    detail:
      'Break the brick seal while the chamber still blazes, spilling its trapped warmth down over the frostbitten olive terraces even if the thermal shock shatters the jar.',
    voiceCueId: 'vo_choice3_open_door',
  },
];

export const ENDINGS: Record<EndingId, EndingDefinition> = {
  gilded_reliquary: {
    id: 'gilded_reliquary',
    title: 'The Gilded Reliquary',
    subtitle: 'Ending I of IV · Kintsugi of the Living',
    epigraph: 'What breaks in the fire is not lost—it is where the gold enters.',
    body: [
      'When the last brick falls away, the amphora catches the low amber sun like a lantern forged from earth. Every stress fracture carved by midnight wind now runs with molten gold leaf, locking the valley’s craft and voices into one unbroken silhouette.',
      'Decades later, surveyors climbing Ember Valley find the kiln cold and roof-fallen, yet the gilded vessel stands intact on its cedar pedestal. When they lift it toward the ridge, light travels along its golden veins like a map of roads worth repairing.',
    ],
    relicClassification: 'Vitrified Kintsugi Amphora · Class I Preservation',
    sealMark: 'GOLD-SEAM IV',
    voiceCueId: 'vo_ending_gilded',
    primaryTint: '#DBA13C',
    accentTint: '#F7DDA0',
  },
  singing_hearth_vessel: {
    id: 'singing_hearth_vessel',
    title: 'The Singing Hearth-Vessel',
    subtitle: 'Ending II of IV · Echo of the Intimate',
    epigraph: 'Even an empty valley keeps a pulse if one clay rib still remembers the tune.',
    body: [
      'Fired with steady patience at stoneware heat, the vessel emerges warm as cured apricot and wholly unmarred. You lift it to the canyon breeze and a low, unmistakable three-note chord blooms from its hollow mouth—the mill-keeper’s lullaby braided with orchard warmth.',
      'Long after the chimney bricks settle back into grass, herdsmen crossing the pass stop beside the cooling terrace just to hear the wind turn terracotta into song.',
    ],
    relicClassification: 'Resonant Terracotta Bell-Jar · Class II Acoustic Relic',
    sealMark: 'HEARTH-CHORD II',
    voiceCueId: 'vo_ending_singing',
    primaryTint: '#E65A28',
    accentTint: '#F2E8DA',
  },
  ash_witness_urn: {
    id: 'ash_witness_urn',
    title: 'The Ash-Witness Urn',
    subtitle: 'Ending III of IV · Chronicle of Unvarnished Truth',
    epigraph: 'Mercy is not hiding the crack; mercy is leaving an honest ledger for the next hands.',
    body: [
      'No gold flatters its rim and no sheen softens its ash-matte belly. The urn stands heavy, smoky, and brutally legible—every carved warning and masonry measure vitrified permanently into dark river stone.',
      'When new builders return to the watershed a generation later, they do not guess why the old canals failed. They copy the kiln-fired ledger word for word, and build their first weir two bends lower where the springs still hold.',
    ],
    relicClassification: 'Wood-Ash Inscription Urn · Class III Archive',
    sealMark: 'ASH-LEDGER III',
    voiceCueId: 'vo_ending_witness',
    primaryTint: '#8F887A',
    accentTint: '#4A5D3F',
  },
  open_kiln_dawn: {
    id: 'open_kiln_dawn',
    title: 'The Open-Kiln Dawn',
    subtitle: 'Ending IV of IV · Warmth Given Away',
    epigraph: 'Some memories belong in jars; the braver ones belong in the soil.',
    body: [
      'As the brick seal tumbles open at midnight, cold mountain air rushes in and the amphora fractures into seven glowing crescents—each shard bright with glazed cinnabar and ochre. A river of radiant kiln heat pours across the frozen lower terrace, melting the rime off dormant olive roots.',
      'At sunrise you gather the warm ceramic shards into your coat pocket. There is no museum relic left on the bench—only green olive shoots uncurling through wet black ash, and seven colored fragments carried down the valley into living hands.',
    ],
    relicClassification: 'Seven Glazed Pocket Shards · Class IV Living Dispersal',
    sealMark: 'OPEN-FLUE I',
    voiceCueId: 'vo_ending_open',
    primaryTint: '#4A5D3F',
    accentTint: '#E65A28',
  },
};
