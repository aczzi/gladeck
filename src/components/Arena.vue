<template>
  <div class="modal fade show d-block" tabindex="-1" @click="closeOnBackdrop">
    <div class="modal-dialog modal-fullscreen" @click.stop>
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="bi bi-shield" /> Arena - PvE Combat
          </h5>
          <button
            type="button"
            class="btn-close btn-close-white"
            aria-label="Close"
            @click="$emit('close')"
          />
        </div>
        <div class="modal-body">
          <!-- Step 0: build squad - pick gladiators and set each one's role
               in the same screen (ROADMAP.md Axe A/B). -->
          <div v-if="!result" class="row justify-content-center">
            <div class="col-md-10">
              <h5 class="text-center">
                Build your squad ({{ squadGladiators.length }}/{{
                  GLADIATORS_PER_BATTLE
                }})
              </h5>
              <p class="text-center text-muted small">
                Fill the {{ GLADIATORS_PER_BATTLE }} slots from the roster
                below, then give each one a role right on its card - drag slots
                to reorder or swap them.
              </p>
              <div class="mb-3">
                <div class="row g-2 justify-content-center">
                  <div
                    v-for="(gladiatorId, index) in squadSlots"
                    :key="index"
                    class="col-6 col-md-3 squad-slot-wrapper"
                    :class="{
                      'squad-slot-wrapper--dragging': draggedIndex === index,
                    }"
                    :draggable="gladiatorId !== null"
                    @dragstart="onSquadDragStart(index)"
                    @dragover.prevent
                    @drop="onSquadDrop(index)"
                    @dragend="onSquadDragEnd"
                  >
                    <GladiatorSquadSlot
                      v-if="gladiatorId && gladiatorsById[gladiatorId]"
                      :gladiator="gladiatorsById[gladiatorId]"
                      :in-squad="true"
                      :position="index + 1"
                      :role="placement[gladiatorId]"
                      @remove="toggleSelected(gladiatorId)"
                      @select-role="
                        (role: Attribution) => setPlacement(gladiatorId!, role)
                      "
                    />
                    <div v-else class="gladiator-card squad-slot-empty">
                      <span class="squad-slot-empty__position"
                        >#{{ index + 1 }}</span
                      >
                    </div>
                  </div>
                </div>
                <div class="row g-2 mt-1">
                  <div
                    v-for="pair in squadPairs"
                    :key="`${pair[0]}-${pair[1]}`"
                    class="col-6"
                  >
                    <div
                      v-if="pairSynergies(pair[0], pair[1]).length > 0"
                      class="squad-pair-synergy"
                    >
                      <DuoSynergyBadges
                        :synergies="pairSynergies(pair[0], pair[1])"
                      />
                    </div>
                    <p
                      v-else
                      class="squad-pair-synergy__empty small text-muted text-center mb-3"
                    >
                      <i class="bi bi-dash-circle" /> No duo synergy #{{
                        pair[0] + 1
                      }}
                      / #{{ pair[1] + 1 }}
                    </p>
                  </div>
                </div>

                <div class="text-center mb-2">
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-info"
                    :aria-expanded="showSynergyReference"
                    @click="showSynergyReference = !showSynergyReference"
                  >
                    <i class="bi bi-stars" /> Duo synergies
                    <i
                      :class="
                        showSynergyReference
                          ? 'bi bi-chevron-up'
                          : 'bi bi-chevron-down'
                      "
                    />
                  </button>
                </div>
                <div class="collapse" :class="{ show: showSynergyReference }">
                  <div class="row g-3 mb-3">
                    <div
                      v-for="synergy in DUO_SYNERGIES"
                      :key="synergy.id"
                      class="col-sm-6 col-lg-4"
                    >
                      <div class="card bg-dark text-light h-100 border-warning">
                        <div class="card-body">
                          <h6 class="card-title">
                            <i class="bi bi-stars" /> {{ synergy.label }}
                          </h6>
                          <p class="mb-2">
                            <DuoSynergyInputs :slots="synergy.slots" />
                          </p>
                          <p class="card-text small mb-0 text-muted">
                            {{ synergy.description }}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="text-center mb-4">
                <label for="betInput" class="form-label">
                  Gold wager - win to double it back (max {{ maxBet }})
                </label>
                <div
                  class="input-group input-group-sm justify-content-center mb-3 mx-auto"
                  style="max-width: 220px"
                >
                  <input
                    id="betInput"
                    v-model.number="bet"
                    type="number"
                    class="form-control"
                    min="0"
                    :max="Math.min(gold, maxBet)"
                    @change="clampBet"
                  />
                  <span class="input-group-text"
                    >/ {{ Math.min(gold, maxBet) }} gold</span
                  >
                </div>
                <button
                  class="btn btn-danger btn-lg"
                  :disabled="!placementValid"
                  @click="engage"
                >
                  <i class="bi bi-lightning-fill" /> Engage
                </button>
                <p v-if="!placementValid" class="text-muted mt-2">
                  {{ placementHint }}
                </p>
              </div>

              <hr />
              <h6 class="text-center text-muted">Roster</h6>
              <p v-if="roster.length === 0" class="text-center text-muted">
                No gladiators available.
              </p>
              <p
                v-else-if="availableRoster.length === 0"
                class="text-center text-muted small"
              >
                Everyone available is already in your squad.
              </p>
              <div v-else class="row g-2">
                <div
                  v-for="gladiator in availableRoster"
                  :key="gladiator.id"
                  class="col-6 col-md-3"
                >
                  <GladiatorSquadSlot
                    :gladiator="gladiator"
                    :in-squad="false"
                    :disabled="!squadSlots.includes(null)"
                    @toggle="toggleSelected(gladiator.id)"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Step 1: battlefield + result -->
          <div v-else class="container-fluid">
            <p class="text-center text-muted mb-2">
              Round {{ currentRound }} / {{ MAX_COMBAT_ROUNDS }}
            </p>
            <DuoSynergyBadges :synergies="result.activeDuoSynergies" />
            
            <div class="row justify-content-center align-items-start g-4">
              <div class="col-auto">
                <h6 class="text-center text-primary">Your Team</h6>
                <div class="d-flex flex-wrap gap-2 justify-content-center">
                  <CombatCard
                    v-for="unit in combatTrainerUnits"
                    :key="unit.id"
                    :name="unit.name"
                    :atk="unit.atk"
                    :def="unit.def"
                    :luck="unit.luck"
                    :hp-max="unit.initialHp"
                    :hp-current="liveHp[unit.id] ?? unit.hpCurrent"
                    :trait="unit.trait"
                    :attribution="unit.attribution"
                    side="trainer"
                    :active="activeAttackerId === unit.id"
                    :targeted="activeTargetId === unit.id"
                    :effect="unitEffect[unit.id] || null"
                  />
                </div>
              </div>
              <div
                class="col-auto d-flex flex-column align-items-center justify-content-center"
              >
                <span class="display-6 text-muted d-none d-md-inline">VS</span>
                <span class="badge mt-1" :class="difficultyBadgeClass">
                  <i class="bi bi-bar-chart-fill" /> {{ difficultyLabel }}
                </span>
              </div>
              <div class="col-auto">
                <h6 class="text-center text-danger">Rival Team</h6>
                <div class="d-flex flex-wrap gap-2 justify-content-center">
                  <CombatCard
                    v-for="unit in combatRivalUnits"
                    :key="unit.id"
                    :name="unit.name"
                    :atk="unit.atk"
                    :def="unit.def"
                    :luck="unit.luck"
                    :hp-max="unit.initialHp"
                    :hp-current="liveHp[unit.id] ?? unit.hpCurrent"
                    :attribution="unit.attribution"
                    side="rival"
                    :active="activeAttackerId === unit.id"
                    :targeted="activeTargetId === unit.id"
                    :effect="unitEffect[unit.id] || null"
                  />
                </div>
              </div>
            </div>

            <div class="row justify-content-center mt-4">
              <div class="col-md-6">
                <div
                  v-if="!animating"
                  class="card bg-dark text-light mb-3"
                  :class="result.victory ? 'border-success' : 'border-danger'"
                >
                  <div
                    class="card-header text-center"
                    :class="result.victory ? 'text-success' : 'text-danger'"
                  >
                    <i
                      :class="
                        result.victory
                          ? 'bi bi-trophy-fill'
                          : 'bi bi-x-octagon-fill'
                      "
                    />
                    {{ result.victory ? "Victory!" : "Defeat" }}
                  </div>
                  <div class="card-body text-center">
                    <p class="mb-2">
                      {{
                        result.victory
                          ? "Surviving gladiators come back a little stronger, but injured."
                          : "No gold, no glory - surviving gladiators limp back injured."
                      }}
                    </p>
                    <ul
                      v-if="result.victory"
                      class="list-unstyled mb-0 text-success"
                    >
                      <li v-if="lastBet > 0">
                        <i class="bi bi-coin" /> Wager doubled: +{{
                          lastBet * 2
                        }}
                        gold
                      </li>
                      <li>
                        <i class="bi bi-coin" /> Bonus: +{{
                          result.baseGoldReward
                        }}
                        gold
                      </li>
                      <li v-if="result.crowdFavoriteBonusGold > 0">
                        <i class="bi bi-star-fill" /> Crowd Favorite: +{{
                          result.crowdFavoriteBonusGold
                        }}
                        gold
                      </li>
                      <li v-if="result.duoSynergyBonusGold > 0">
                        <i class="bi bi-stars" /> Rowdy Crowd: +{{
                          result.duoSynergyBonusGold
                        }}
                        gold
                      </li>
                      <li class="fw-bold border-top border-success pt-1 mt-1">
                        Total: +{{ totalGoldGained }} gold
                      </li>
                    </ul>
                    <p v-else-if="lastBet > 0" class="mb-0 text-danger">
                      <i class="bi bi-coin" /> Wager lost: -{{ lastBet }} gold
                    </p>
                    <p
                      v-if="fallenGladiatorNames.length > 0"
                      class="mb-0 mt-2 text-danger"
                    >
                      <i class="bi bi-skull" /> Fallen:
                      {{ fallenGladiatorNames.join(", ") }}
                    </p>
                  </div>
                </div>
                <div v-if="displayedLog.length > 0" class="text-start mb-3">
                  <h6 class="text-center">Combat log</h6>
                  <ul
                    class="list-group"
                    style="max-height: 220px; overflow-y: auto"
                  >
                    <li
                      v-for="entry in reversedDisplayedLog"
                      :key="entry.turn"
                      class="list-group-item bg-dark text-light d-flex justify-content-between align-items-center"
                    >
                      <span>
                        Turn {{ entry.turn }} -
                        <strong
                          :class="
                            entry.attacker === 'trainer'
                              ? 'text-primary'
                              : 'text-danger'
                          "
                        >
                          {{ entry.attackerName }}
                        </strong>
                        <template v-if="entry.dodged">
                          attacks {{ entry.targetName }} - dodged!
                        </template>
                        <template v-else>
                          hits {{ entry.targetName }} for
                          {{ Math.round(entry.damage) }} dmg
                          <span v-if="entry.crit" class="text-warning"
                            >(crit!)</span
                          >
                          <span v-if="entry.survivedLethal" class="text-info">
                            - clings on!</span
                          >
                          <span
                            v-else-if="entry.targetDowned"
                            class="text-danger"
                            >- knocked down</span
                          >
                          <span
                            v-if="entry.bloodthirstyTriggered"
                            class="text-danger"
                          >
                            <i class="bi bi-droplet-fill" /> frenzy!</span
                          >
                        </template>
                      </span>
                      <span class="text-muted"
                        >HP left: {{ Math.round(entry.targetHpAfter) }}</span
                      >
                    </li>
                  </ul>
                </div>
                <div
                  v-if="!animating"
                  class="text-center d-flex gap-2 justify-content-center"
                >
                  <button
                    class="btn btn-outline"
                    @click="$emit('close')"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useGameStore } from "@/core/store/gameStore";

import type {
  Gladiator,
  Attribution,
  ArenaDifficulty,
  CombatUnit,
} from "@/core/game/types";

import {
  computeAverageTeamPower,
  computeCombatUnits,
  computeRivalBudget,
  distributeRivalBudget,
  resolveCombat,
  applyExperienceGain,
  gladiatorPower,
  getTrainingPoints,
  isValidTeamComposition,
  computeArenaWagerNetGold,
  pickArenaDifficultyForTeam,
  arenaMaxBet,
} from "@/core/game/gameRules";

import {
  GLADIATORS_PER_BATTLE,
  MAX_COMBAT_ROUNDS,
  TRAINING_POINT_PER_VICTORY,
  MAX_DPS_PER_TEAM,
} from "@/core/game/constantes";

import {
  computeActiveDuoSynergies,
  DUO_SYNERGIES,
} from "@/core/game/synergies";

import type { CombatResult, CombatLogEntry } from "@/core/game/types";
import CombatCard from "@/components/subComponents/CombatCard.vue";
import GladiatorSquadSlot from "@/components/subComponents/GladiatorSquadSlot.vue";
import DuoSynergyBadges from "@/components/subComponents/DuoSynergyBadges.vue";
import DuoSynergyInputs from "@/components/subComponents/DuoSynergyInputs.vue";

const emit = defineEmits<{ close: [] }>();

const closeOnBackdrop = (event: Event) => {
  if (event.target === event.currentTarget) emit("close");
};

const { userData, gold, updateUserData } = useGameStore();

const roster = computed(() =>
  Object.values(userData.value?.gladiators || {}).sort(
    (a, b) =>
      gladiatorPower(b.stats, b.battlesFought) -
      gladiatorPower(a.stats, a.battlesFought),
  ),
);

const gladiatorsById = computed(() => userData.value?.gladiators || {});
const placement = ref<Record<string, Attribution | null>>({});
const bet = ref(0);

// Fixed slots (not a plain list) so picking/removing a gladiator never
// reshuffles everyone else's position - a slot left empty stays empty and
// stays put until the player fills or drags something into it.
const squadSlots = ref<(string | null)[]>(
  Array.from({ length: GLADIATORS_PER_BATTLE }, () => null),
);

const squadGladiators = computed(() =>
  squadSlots.value
    .filter((id): id is string => id !== null)
    .map((id) => gladiatorsById.value[id])
    .filter((g): g is Gladiator => !!g),
);

const availableRoster = computed(() =>
  roster.value.filter((g) => !squadSlots.value.includes(g.id)),
);

const result = ref<CombatResult | null>(null);

const persistPendingCombat = () => {
  if (!userData.value || squadGladiators.value.length === 0 || result.value) {
    return;
  }
  updateUserData({
    pendingCombat: {
      gladiatorIds: squadGladiators.value.map((g) => g.id),
      placement: { ...placement.value },
      bet: bet.value,
    },
  });
};

const toggleSelected = (gladiatorId: string) => {
  const existingIndex = squadSlots.value.indexOf(gladiatorId);
  const nextPlacement = { ...placement.value };
  if (existingIndex !== -1) {
    const next = [...squadSlots.value];
    next[existingIndex] = null;
    squadSlots.value = next;
    delete nextPlacement[gladiatorId];
  } else {
    const emptyIndex = squadSlots.value.indexOf(null);
    if (emptyIndex === -1) return; // squad full
    const next = [...squadSlots.value];
    next[emptyIndex] = gladiatorId;
    squadSlots.value = next;
    nextPlacement[gladiatorId] = null;
  }
  placement.value = nextPlacement;
  persistPendingCombat();
};

// Squad order matters (it's the order units act in within a side during
// combat, see resolveCombat's per-side attacker loop), so the player can
// drag a slot onto another one to swap them - dragging onto an empty slot
// just moves the dragged gladiator there instead.
const draggedIndex = ref<number | null>(null);

// Collapsed by default - the full curated reference (same markup as
// HowToPlay.vue) is opt-in here, not shoved in the player's face every time.
const showSynergyReference = ref(false);

const onSquadDragStart = (index: number) => {
  draggedIndex.value = index;
};

const onSquadDrop = (targetIndex: number) => {
  if (draggedIndex.value === null || draggedIndex.value === targetIndex) return;
  const next = [...squadSlots.value];
  const temp = next[targetIndex];
  next[targetIndex] = next[draggedIndex.value];
  next[draggedIndex.value] = temp;
  squadSlots.value = next;
  draggedIndex.value = null;
  persistPendingCombat();
};

const onSquadDragEnd = () => {
  draggedIndex.value = null;
};

const lastBet = ref(0);
// Rolled once per engage() - never shown or chosen before engaging, only
// revealed once the fight is on screen (between the VS cards), so it
// explains the outcome without letting the player pick or bet around it.
const difficulty = ref<ArenaDifficulty>("normal");

const difficultyLabel = computed(() => {
  if (difficulty.value === "easy") return "Easy";
  if (difficulty.value === "hard") return "Hard";
  return "Normal";
});

const difficultyBadgeClass = computed(() => {
  if (difficulty.value === "easy") return "text-bg-success";
  if (difficulty.value === "hard") return "text-bg-danger";
  return "text-bg-warning";
});

const maxBet = computed(() =>
  arenaMaxBet(userData.value?.buildings.fanDonation.level || 1),
);

// Victory gold breakdown shown to the player: the wager doubled back, plus
// the combat reward from resolveCombat (base + Crowd Favorite + duo synergy
// bonuses).
const totalGoldGained = computed(
  () => (result.value?.goldGained || 0) + lastBet.value * 2,
);

// Battlefield display state - populated in engage() from the exact units
// resolveCombat was called with (never mutated by it - see resolveCombat's
// own cloning), then animated turn-by-turn against liveHp/displayedLog. Also
// doubles as the post-combat snapshot (fallenGladiatorNames below), since
// userData.gladiators can no longer be relied on once engage() has already
// removed a fallen gladiator from it.
const combatTrainerUnits = ref<CombatUnit[]>([]);
const combatRivalUnits = ref<CombatUnit[]>([]);

// Names of sent gladiators whose final HP (post resolveDownedFates) was 0 -
// shown once the animation has finished revealing their fate.
const fallenGladiatorNames = computed(() => {
  if (!result.value) return [];
  const finalHpById = new Map(result.value.trainerUnits.map((u) => [u.id, u]));
  return combatTrainerUnits.value
    .filter((u) => (finalHpById.get(u.id)?.hpCurrent ?? u.hpCurrent) <= 0)
    .map((u) => u.name);
});

// Slots are grouped visually in fixed pairs (1/2 and 3/4) so a synergy that
// only needs two gladiators can be shown right under the pair forming it,
// not just buried in the squad-wide list above - a placeholder is always
// reserved there even when nothing is active yet, same spirit as an empty
// slot itself.
const squadPairs: [number, number][] = [
  [0, 1],
  [2, 3],
];

const pairSynergies = (indexA: number, indexB: number) => {
  const idA = squadSlots.value[indexA];
  const idB = squadSlots.value[indexB];
  if (!idA || !idB) return [];
  const gladiatorA = gladiatorsById.value[idA];
  const gladiatorB = gladiatorsById.value[idB];
  const roleA = placement.value[idA];
  const roleB = placement.value[idB];
  if (!gladiatorA || !gladiatorB || !roleA || !roleB) return [];
  return computeActiveDuoSynergies([
    { trait: gladiatorA.trait, attribution: roleA },
    { trait: gladiatorB.trait, attribution: roleB },
  ]);
};

const liveHp = ref<Record<string, number>>({});
const activeAttackerId = ref<string | null>(null);
const activeTargetId = ref<string | null>(null);
const unitEffect = ref<
  Record<string, "hit" | "crit" | "dodge" | "frenzy" | null>
>({});
const displayedLog = ref<CombatLogEntry[]>([]);
// Newest entry first, so the player sees the latest action without having
// to scroll the (fixed-height) log list.
const reversedDisplayedLog = computed(() => [...displayedLog.value].reverse());
const animating = ref(false);
const currentRound = computed(
  () => displayedLog.value[displayedLog.value.length - 1]?.round ?? 0,
);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Replays an already-resolved fight's log turn by turn so the player can
// watch it unfold - the actual outcome (rewards, gladiator fates) is
// already computed and persisted by the time this runs, this is purely
// cosmetic playback of that same result. Base delays below are the "1x"
// pacing, divided by ANIMATION_SPEED_MULTIPLIER for actual playback speed.

const ANIMATION_SPEED_MULTIPLIER = 3;
const TURN_ACTIVE_DELAY_MS = 300 / ANIMATION_SPEED_MULTIPLIER;
const TURN_TARGET_DELAY_MS = 250 / ANIMATION_SPEED_MULTIPLIER;
const TURN_RESOLVE_DELAY_MS = 450 / ANIMATION_SPEED_MULTIPLIER;
const TURN_GAP_MS = 250 / ANIMATION_SPEED_MULTIPLIER;
const EFFECT_CLEAR_MS = 500 / ANIMATION_SPEED_MULTIPLIER;

const flashEffect = (
  unitId: string,
  effect: "hit" | "crit" | "dodge" | "frenzy",
): void => {
  unitEffect.value = { ...unitEffect.value, [unitId]: effect };
  setTimeout(() => {
    if (unitEffect.value[unitId] === effect) {
      const next = { ...unitEffect.value };
      delete next[unitId];
      unitEffect.value = next;
    }
  }, EFFECT_CLEAR_MS);
};

const playCombatAnimation = async (
  log: CombatLogEntry[],
  trainerUnits: CombatUnit[],
  rivalUnits: CombatUnit[],
): Promise<void> => {
  animating.value = true;
  displayedLog.value = [];
  activeAttackerId.value = null;
  activeTargetId.value = null;
  unitEffect.value = {};
  liveHp.value = Object.fromEntries(
    [...trainerUnits, ...rivalUnits].map((u) => [u.id, u.hpCurrent]),
  );

  for (const entry of log) {
    activeAttackerId.value = entry.attackerId;
    await sleep(TURN_ACTIVE_DELAY_MS);

    activeTargetId.value = entry.targetId;
    await sleep(TURN_TARGET_DELAY_MS);

    if (entry.dodged) {
      flashEffect(entry.targetId, "dodge");
    } else {
      liveHp.value = { ...liveHp.value, [entry.targetId]: entry.targetHpAfter };
      flashEffect(entry.targetId, entry.crit ? "crit" : "hit");
      // Bloodthirsty's stacking ATK gain was silent before - flash the
      // attacker (not the target) so the trigger is visible in the moment
      // it happens, not just inferred from the log text (ROADMAP.md Axe C).
      if (entry.bloodthirstyTriggered) {
        flashEffect(entry.attackerId, "frenzy");
      }
    }
    displayedLog.value = [...displayedLog.value, entry];
    await sleep(TURN_RESOLVE_DELAY_MS);

    activeAttackerId.value = null;
    activeTargetId.value = null;
    await sleep(TURN_GAP_MS);
  }

  animating.value = false;
};

const hydratedPendingCombat = ref(false);

watch(
  userData,
  (data) => {
    if (hydratedPendingCombat.value || !data) return;
    hydratedPendingCombat.value = true;
    const pending = data.pendingCombat;
    if (!pending || pending.gladiatorIds.length === 0) return;
    // Squad members that no longer exist (sold/retired/died elsewhere) are
    // dropped individually rather than discarding the whole in-progress
    // squad build.
    const validIds = pending.gladiatorIds
      .filter((id) => !!data.gladiators[id])
      .slice(0, GLADIATORS_PER_BATTLE);
    if (validIds.length === 0) {
      updateUserData({ pendingCombat: null }, { immediate: true });
      return;
    }
    // Repacked to the front - exact slot positions aren't persisted, only
    // relative order (see persistPendingCombat above).
    squadSlots.value = Array.from(
      { length: GLADIATORS_PER_BATTLE },
      (_, i) => validIds[i] ?? null,
    );
    placement.value = Object.fromEntries(
      validIds.map((id) => [id, pending.placement[id] ?? null]),
    );
    bet.value = pending.bet;
  },
  { immediate: true },
);

const setPlacement = (gladiatorId: string, line: Attribution) => {
  placement.value = { ...placement.value, [gladiatorId]: line };
  persistPendingCombat();
};

const clampBet = () => {
  if (!Number.isFinite(bet.value) || bet.value < 0) {
    bet.value = 0;
  } else {
    bet.value = Math.min(Math.floor(bet.value), gold.value, maxBet.value);
  }
  persistPendingCombat();
};

const placementValid = computed(() => {
  if (squadGladiators.value.length === 0) return false;
  const allAssigned = squadGladiators.value.every(
    (g) => placement.value[g.id] != null,
  );
  if (!allAssigned) return false;
  const lines = squadGladiators.value.map(
    (g) => placement.value[g.id] as Attribution,
  );
  return isValidTeamComposition(lines);
});

// Guides the player toward the required composition instead of just saying
// "invalid" once every gladiator has a role assigned.
const placementHint = computed(() => {
  if (squadGladiators.value.length === 0) {
    return "Pick at least one gladiator.";
  }
  const assignedCount = squadGladiators.value.filter(
    (g) => placement.value[g.id] != null,
  ).length;
  if (assignedCount < squadGladiators.value.length) {
    return "Assign a role to each gladiator in your squad.";
  }
  return `At most ${MAX_DPS_PER_TEAM} DPS allowed per team.`;
});

const engage = () => {
  if (!userData.value || !placementValid.value) return;

  clampBet();
  const wager = bet.value;
  lastBet.value = wager;

  const squad = squadGladiators.value;
  const rolledDifficulty = pickArenaDifficultyForTeam(squad);
  difficulty.value = rolledDifficulty;

  const placedGladiators = squad.map((gladiator) => ({
    id: gladiator.id,
    name: gladiator.name,
    stats: gladiator.stats,
    attribution: placement.value[gladiator.id] as Attribution,
    trait: gladiator.trait,
    battlesFought: gladiator.battlesFought,
  }));
  const trainerUnits = computeCombatUnits(placedGladiators);
  const avgTeamPower = computeAverageTeamPower(trainerUnits);
  const rivalBudget = computeRivalBudget(
    avgTeamPower,
    trainerUnits.length,
    difficulty.value,
  );
  const rivalUnits = distributeRivalBudget(rivalBudget, trainerUnits.length);
  const combatResult = resolveCombat(trainerUnits, rivalUnits, {
    difficulty: difficulty.value,
  });
  result.value = combatResult;
  combatTrainerUnits.value = trainerUnits;
  combatRivalUnits.value = rivalUnits;
  const finalHpById = new Map(
    [...combatResult.trainerUnits, ...combatResult.rivalUnits].map((u) => [
      u.id,
      u.hpCurrent,
    ]),
  );
  playCombatAnimation(combatResult.log, trainerUnits, rivalUnits).then(() => {
    // The animation only replays the round-by-round log - the post-combat
    // downed/dead resolution (resolveDownedFates) happens after that log
    // ends, so apply it to the display once playback catches up.
    liveHp.value = { ...liveHp.value, ...Object.fromEntries(finalHpById) };
  });

  // PvE sparring: a gladiator only dies if its final HP is 0 once
  // resolveDownedFates has run - see gameRules.ts's resolveCombat. Easy and
  // Normal never roll a death (permadeath is Hard-only, and only for a
  // veteran-or-above unit - see isVeteran), so this only ever removes
  // someone on a Hard fight. Only a win grants the permanent stat bump and
  // training point (applyExperienceGain).
  const finalHpByGladiatorId = new Map(
    combatResult.trainerUnits.map((u) => [u.id, u]),
  );
  const gladiators = { ...userData.value.gladiators };
  for (const gladiator of squad) {
    const unit = finalHpByGladiatorId.get(gladiator.id);
    const hpCurrent = unit ? unit.hpCurrent : gladiator.stats.hpCurrent;
    if (hpCurrent <= 0) {
      delete gladiators[gladiator.id];
      continue;
    }
    const clampedHp = Math.min(gladiator.stats.hpMax, hpCurrent);
    const stats = combatResult.victory
      ? applyExperienceGain(
          { ...gladiator.stats, hpCurrent: clampedHp },
          gladiator.trait,
        )
      : { ...gladiator.stats, hpCurrent: clampedHp };
    gladiators[gladiator.id] = {
      ...gladiator,
      stats,
      injured: stats.hpCurrent < stats.hpMax,
      battlesFought: (gladiator.battlesFought || 0) + 1,
      trainingPoints: combatResult.victory
        ? getTrainingPoints(gladiator) + TRAINING_POINT_PER_VICTORY
        : getTrainingPoints(gladiator),
    };
  }

  updateUserData(
    {
      profile: {
        ...userData.value.profile,
        gold:
          userData.value.profile.gold +
          combatResult.goldGained +
          computeArenaWagerNetGold(wager, combatResult.victory),
        pveRankPoints:
          (userData.value.profile.pveRankPoints || 0) +
          combatResult.rankPointsGained,
      },
      gladiators,
      pendingCombat: null,
    },
    { immediate: true },
  );
};
</script>

<style scoped>
.squad-slot-wrapper {
  transition: opacity 0.15s ease;
}

.squad-slot-wrapper--dragging {
  opacity: 0.4;
}

.squad-slot-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  min-height: 130px;
  border-style: dashed !important;
  opacity: 0.6;
}

.squad-slot-empty__position {
  font-size: 0.7rem;
  font-weight: 800;
  color: var(--tier-color);
}

.squad-slot-empty__label {
  font-size: 0.75rem;
  color: #cbb9a0;
}

.squad-pair-synergy,
.squad-pair-synergy__empty {
  min-height: 2.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
