<template>
  <div
    class="modal fade show d-block"
    tabindex="-1"
    @click="closeOnBackdrop"
  >
    <div
      class="modal-dialog modal-fullscreen"
      @click.stop
    >
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
          <!-- Step 1: placement -->
          <div
            v-if="sentGladiators && !result"
            class="row justify-content-center"
          >
            <div class="col-md-8">
              <h5 class="text-center">
                Place your gladiators as DPS, Tank or Support
              </h5>
              <div class="row">
                <div
                  v-for="gladiator in sentGladiators"
                  :key="gladiator.id"
                  class="col-md-6 mb-3"
                >
                  <div
                    class="card bg-dark text-light"
                    :class="roleBorderClass(placement[gladiator.id])"
                  >
                    <div class="card-body">
                      <h6>
                        {{ gladiator.name }}
                        <span
                          class="badge"
                          :class="traitBadgeClass(gladiator.trait)"
                        >
                          <i :class="traitIcon(gladiator.trait)" />
                          {{ traitLabel(gladiator.trait) }}
                        </span>
                      </h6>
                      <p
                        v-if="placement[gladiator.id]"
                        class="mb-2"
                      >
                        <i :class="roleIcon(placement[gladiator.id])" />
                        {{ roleLabel(placement[gladiator.id]) }} <br>
                        ATK {{ Math.round(displayedStats(gladiator).atk) }} -
                        DEF {{ Math.round(displayedStats(gladiator).def) }} -
                        LUCK
                        {{ Math.round(displayedStats(gladiator).luck) }}
                      </p>
                      <p
                        v-else
                        class="text-muted mb-2"
                      >
                        Pick a role to see modified stats.
                      </p>
                      <div class="btn-group w-100">
                        <button
                          class="btn btn-sm"
                          :class="
                            placement[gladiator.id] === 'dps'
                              ? 'btn-primary'
                              : 'btn-outline-primary'
                          "
                          @click="setPlacement(gladiator.id, 'dps')"
                        >
                          <i class="bi bi-lightning-charge-fill" /> DPS
                        </button>
                        <button
                          class="btn btn-sm"
                          :class="
                            placement[gladiator.id] === 'tank'
                              ? 'btn-info'
                              : 'btn-outline-info'
                          "
                          @click="setPlacement(gladiator.id, 'tank')"
                        >
                          <i class="bi bi-shield-fill" /> Tank
                        </button>
                        <button
                          class="btn btn-sm"
                          :class="
                            placement[gladiator.id] === 'support'
                              ? 'btn-secondary'
                              : 'btn-outline-secondary'
                          "
                          @click="setPlacement(gladiator.id, 'support')"
                        >
                          <i class="bi bi-people-fill" /> Support
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="text-center">
                <label
                  for="betInput"
                  class="form-label"
                >
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
                  >
                  <span class="input-group-text">/ {{ Math.min(gold, maxBet) }} gold</span>
                </div>
                <button
                  class="btn btn-danger btn-lg"
                  :disabled="!placementValid"
                  @click="engage"
                >
                  <i class="bi bi-lightning-fill" /> Engage
                </button>
                <p
                  v-if="!placementValid"
                  class="text-muted mt-2"
                >
                  Assign each gladiator.
                </p>
              </div>
            </div>
          </div>

          <!-- Step 2: battlefield + result -->
          <div
            v-else-if="result"
            class="container-fluid"
          >
            <p class="text-center text-muted mb-2">
              Round {{ currentRound }} / {{ MAX_COMBAT_ROUNDS }}
            </p>
            <div class="row justify-content-center align-items-start g-4">
              <div class="col-auto">
                <h6 class="text-center text-primary">
                  Your Team
                </h6>
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
              <div class="col-auto d-none d-md-flex align-items-center">
                <span class="display-6 text-muted">VS</span>
              </div>
              <div class="col-auto">
                <h6 class="text-center text-danger">
                  Rival Team
                </h6>
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
                      <li class="fw-bold border-top border-success pt-1 mt-1">
                        Total: +{{ totalGoldGained }} gold
                      </li>
                    </ul>
                    <p
                      v-else-if="lastBet > 0"
                      class="mb-0 text-danger"
                    >
                      <i class="bi bi-coin" /> Wager lost: -{{ lastBet }} gold
                    </p>
                  </div>
                </div>
                <div
                  v-if="displayedLog.length > 0"
                  class="text-start mb-3"
                >
                  <h6 class="text-center">
                    Combat log
                  </h6>
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
                          <span
                            v-if="entry.crit"
                            class="text-warning"
                          >(crit!)</span>
                          <span
                            v-if="entry.survivedLethal"
                            class="text-info"
                          >
                            - clings on!</span>
                          <span
                            v-else-if="entry.targetKilled"
                            class="text-danger"
                          >
                            - killed!</span>
                          <span
                            v-else-if="entry.targetDowned"
                            class="text-danger"
                          >- knocked down</span>
                        </template>
                      </span>
                      <span class="text-muted">HP left: {{ Math.round(entry.targetHpAfter) }}</span>
                    </li>
                  </ul>
                </div>
                <div
                  v-if="!animating"
                  class="text-center d-flex gap-2 justify-content-center"
                >
                  <button
                    class="btn btn-outline-secondary"
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
import type { Gladiator, Attribution, CombatUnit } from "@/core/game/types";
import {
  sendGladiatorsToCombat,
  computeAverageTeamPower,
  computeCombatUnits,
  computeRivalBudget,
  distributeRivalBudget,
  resolveCombat,
  applyAttribution,
  applyExperienceGain,
  getTrainingPoints,
  TRAINING_POINT_PER_VICTORY,
  MAX_COMBAT_ROUNDS,
  arenaMaxBet,
} from "@/core/game/gameRules";
import type { CombatResult, CombatLogEntry } from "@/core/game/types";
import {
  traitLabel,
  traitIcon,
  traitBadgeClass,
} from "@/core/game/traitPresentation";
import CombatCard from "@/components/CombatCard.vue";

const emit = defineEmits<{ close: [] }>();

const closeOnBackdrop = (event: Event) => {
  if (event.target === event.currentTarget) emit("close");
};

const { userData, gold, updateUserData } = useGameStore();

const roleIcon = (line: Attribution | null) => {
  if (line === "dps") return "bi bi-lightning-charge-fill";
  if (line === "tank") return "bi bi-shield-fill";
  return "bi bi-people-fill";
};

const roleBorderClass = (line: Attribution | null) => {
  if (line === "dps") return "border-primary";
  if (line === "tank") return "border-info";
  if (line === "support") return "border-secondary";
  return "";
};

const sentGladiators = ref<Gladiator[] | null>(null);
const placement = ref<Record<string, Attribution | null>>({});
const result = ref<CombatResult | null>(null);
const bet = ref(0);
const lastBet = ref(0);

const maxBet = computed(() =>
  arenaMaxBet(userData.value?.buildings.fanDonation.level || 1),
);

// Victory gold breakdown shown to the player: the wager doubled back, plus
// the combat reward from resolveCombat (base + Crowd Favorite bonus).
const totalGoldGained = computed(
  () => (result.value?.goldGained || 0) + lastBet.value * 2,
);

// Battlefield display state - populated in engage() from the exact units
// resolveCombat was called with (never mutated by it - see resolveCombat's
// own cloning), then animated turn-by-turn against liveHp/displayedLog.
const combatTrainerUnits = ref<CombatUnit[]>([]);
const combatRivalUnits = ref<CombatUnit[]>([]);
const liveHp = ref<Record<string, number>>({});
const activeAttackerId = ref<string | null>(null);
const activeTargetId = ref<string | null>(null);
const unitEffect = ref<Record<string, "hit" | "crit" | "dodge" | null>>({});
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
  effect: "hit" | "crit" | "dodge",
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
    }
    displayedLog.value = [...displayedLog.value, entry];
    await sleep(TURN_RESOLVE_DELAY_MS);

    activeAttackerId.value = null;
    activeTargetId.value = null;
    await sleep(TURN_GAP_MS);
  }

  animating.value = false;
};

// Draws 4 gladiators and locks the draw in immediately - reloading the page
// (or reopening this modal) before placement must resume this exact fight,
// not re-roll a new one. The Camp screen only shows the button that leads
// here when at least one gladiator is available to fight.
const startPvECombat = () => {
  if (!userData.value) return;
  const gladiators = sendGladiatorsToCombat(userData.value.gladiators);
  const initialPlacement = Object.fromEntries(
    gladiators.map((g) => [g.id, null]),
  );
  sentGladiators.value = gladiators;
  placement.value = initialPlacement;
  result.value = null;
  bet.value = 0;
  updateUserData(
    {
      pendingCombat: {
        gladiatorIds: gladiators.map((g) => g.id),
        placement: initialPlacement,
        bet: 0,
      },
    },
    { immediate: true },
  );
};

const hydratedPendingCombat = ref(false);

watch(
  userData,
  (data) => {
    if (hydratedPendingCombat.value || !data) return;
    hydratedPendingCombat.value = true;
    const pending = data.pendingCombat;
    if (!pending || pending.gladiatorIds.length === 0) {
      startPvECombat();
      return;
    }
    const gladiators = pending.gladiatorIds
      .map((id) => data.gladiators[id])
      .filter((g): g is Gladiator => !!g);
    if (gladiators.length !== pending.gladiatorIds.length) {
      // A drawn gladiator no longer exists (sold/retired/died elsewhere) -
      // the locked-in fight can't be resumed as-is, drop it and start over.
      updateUserData({ pendingCombat: null }, { immediate: true });
      startPvECombat();
      return;
    }
    sentGladiators.value = gladiators;
    placement.value = { ...pending.placement };
    bet.value = pending.bet;
  },
  { immediate: true },
);

// Persists the in-progress fight so it survives a reload (see the hydration
// watcher above). No-op once a result exists - the draw has been spent.
const persistPendingCombat = () => {
  if (!userData.value || !sentGladiators.value || result.value) return;
  updateUserData({
    pendingCombat: {
      gladiatorIds: sentGladiators.value.map((g) => g.id),
      placement: { ...placement.value },
      bet: bet.value,
    },
  });
};

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

const displayedStats = (gladiator: Gladiator) => {
  const line = placement.value[gladiator.id];
  return line ? applyAttribution(gladiator.stats, line) : gladiator.stats;
};

const roleLabel = (line: Attribution | null) => {
  if (line === "dps") return "DPS";
  if (line === "tank") return "Tank";
  return "Support";
};

const placementValid = computed(() => {
  if (!sentGladiators.value || sentGladiators.value.length === 0) return false;
  return sentGladiators.value.every((g) => placement.value[g.id] != null);
});

const engage = () => {
  if (!userData.value || !sentGladiators.value || !placementValid.value) return;

  clampBet();
  const wager = bet.value;
  lastBet.value = wager;

  const placedGladiators = sentGladiators.value.map((gladiator) => ({
    id: gladiator.id,
    name: gladiator.name,
    stats: gladiator.stats,
    line: placement.value[gladiator.id] as Attribution,
    trait: gladiator.trait,
    battlesFought: gladiator.battlesFought,
  }));
  const trainerUnits = computeCombatUnits(placedGladiators);
  const avgTeamPower = computeAverageTeamPower(placedGladiators);
  const rivalBudget = computeRivalBudget(avgTeamPower, trainerUnits.length);
  const rivalUnits = distributeRivalBudget(rivalBudget, trainerUnits.length);
  const combatResult = resolveCombat(trainerUnits, rivalUnits);
  result.value = combatResult;
  combatTrainerUnits.value = trainerUnits;
  combatRivalUnits.value = rivalUnits;
  playCombatAnimation(combatResult.log, trainerUnits, rivalUnits);

  // PvE sparring: a gladiator only dies if it's hit again after already
  // being knocked down to the HP floor (see computeDownedSurvivalChance in
  // gameRules.ts) - hpCurrent is 0 in that case. Only a win grants the
  // permanent stat bump and training point - see applyExperienceGain.
  const finalHpById = new Map(combatResult.trainerUnits.map((u) => [u.id, u]));
  const gladiators = { ...userData.value.gladiators };
  for (const gladiator of sentGladiators.value) {
    const unit = finalHpById.get(gladiator.id);
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
          (combatResult.victory ? 2 * wager : -wager),
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
