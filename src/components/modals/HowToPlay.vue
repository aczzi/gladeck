<template>
  <div class="container-fluid howtoplay">
    <p class="lead">
      You are a <b class="text-warning">lanista</b>, manager of your own
      gladiator stable, hungry for gold, glory and the favor of the crowd.
      Recruit fighters from the slave markets, train them, heal their wounds and
      send them into the arena to bleed for your name.
    </p>

    <h4 class="section-title"><i class="bi bi-houses-fill"></i> The Camp</h4>
    <div class="row g-3 mb-2">
      <div class="col-sm-6 col-lg-4">
        <div class="card bg-dark text-light h-100 building-card">
          <div class="card-body">
            <h6 class="card-title">
              <i class="bi bi-shield-fill text-warning"></i> Barracks
            </h6>
            <p class="card-text small mb-0 text-muted">
              Houses up to 8 gladiators, +1 slot per retired legend. Name and
              manage them, see them ranked by Power, from Rookie up to Veteran,
              Elite and Legend.
            </p>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-4">
        <div class="card bg-dark text-light h-100 building-card">
          <div class="card-body">
            <h6 class="card-title">
              <i class="bi bi-mortarboard-fill text-warning"></i> Training
              Program
            </h6>
            <p class="card-text small mb-0 text-muted">
              Spend gold to permanently boost one gladiator's Attack, Defense
              (30-min cooldown per gladiator, and costs 1 training point -
              gladiators start with 2 and earn 1 more per victory, so only
              fighters that actually fight can be trained). High-level training
              pushes gladiators hard enough to risk a minor injury.
            </p>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-4">
        <div class="card bg-dark text-light h-100 building-card">
          <div class="card-body">
            <h6 class="card-title">
              <i class="bi bi-heart-pulse-fill text-warning"></i> Infirmary
            </h6>
            <p class="card-text small mb-0 text-muted">
              Instantly heals one injured gladiator for a % of their max HP
              (15-min cooldown per gladiator). Its level also caps how many
              gladiators can be resting at once.
            </p>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-4">
        <div class="card bg-dark text-light h-100 building-card">
          <div class="card-body">
            <h6 class="card-title">
              <i class="bi bi-shop text-warning"></i> Market
            </h6>
            <p class="card-text small mb-0 text-muted">
              Recruit new gladiators or sell ones you own, from a pool of daily
              trades that refills every 24h and grows with level.
            </p>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-4">
        <div class="card bg-dark text-light h-100 building-card">
          <div class="card-body">
            <h6 class="card-title">
              <i class="bi bi-gift-fill text-warning"></i> Fan Donation
            </h6>
            <p class="card-text small mb-0 text-muted">
              Crowd loves your team and offer gold over time. Amount is based on
              its level. Collect it whenever you like - no cap on how long it
              piles up. Its level also caps how much gold you can wager in the
              Arena (100 gold per level).
            </p>
          </div>
        </div>
      </div>
    </div>
    <h4 class="section-title">
      <i class="bi bi-person-badge-fill"></i> Gladiators & Traits
    </h4>
    <p class="small text-muted mb-4">
      Each gladiator has 4 stats
      <span class="badge bg-secondary">Attack</span>
      <span class="badge bg-secondary">Luck</span>
      <span class="badge bg-secondary">Defense</span>
      <span class="badge bg-secondary">Health</span>. Every gladiator is rolled
      with one permanent trait:
    </p>
    <div class="row g-3 mb-3">
      <div class="col-sm-4">
        <div class="card bg-dark text-light h-100 border-warning">
          <div class="card-body">
            <h6 class="card-title"><i class="bi bi-fire"></i> Brute</h6>
            <p class="card-text small mb-0 text-muted">
              +10% extra Attack training effectiveness at the Training Program.
            </p>
          </div>
        </div>
      </div>
      <div class="col-sm-4">
        <div class="card bg-dark text-light h-100 border-info">
          <div class="card-body">
            <h6 class="card-title"><i class="bi bi-heart-fill"></i> Stoic</h6>
            <p class="card-text small mb-0 text-muted">
              Sometimes stays standing on a hit that would otherwise knock them
              down.
            </p>
          </div>
        </div>
      </div>
      <div class="col-sm-4">
        <div class="card bg-dark text-light h-100 border-success">
          <div class="card-body">
            <h6 class="card-title"><i class="bi bi-stars"></i> Lucky</h6>
            <p class="card-text small mb-0 text-muted">
              Gains +2 Luck (instead of +1) on every victory.
            </p>
          </div>
        </div>
      </div>
      <div class="col-sm-4">
        <div class="card bg-dark text-light h-100 border-danger">
          <div class="card-body">
            <h6 class="card-title">
              <i class="bi bi-droplet-fill"></i> Bloodthirsty
            </h6>
            <p class="card-text small mb-0 text-muted">
              Gains +5% Attack, stacking, for the rest of the fight whenever it
              knocks an opponent down.
            </p>
          </div>
        </div>
      </div>
      <div class="col-sm-4">
        <div class="card bg-dark text-light h-100 border-primary">
          <div class="card-body">
            <h6 class="card-title">
              <i class="bi bi-hand-thumbs-up-fill"></i> Crowd Favorite
            </h6>
            <p class="card-text small mb-0 text-muted">
              Victories earn +20% gold.
            </p>
          </div>
        </div>
      </div>
      <div class="col-sm-4">
        <div class="card bg-dark text-light h-100 border-secondary">
          <div class="card-body">
            <h6 class="card-title">
              <i class="bi bi-exclamation-triangle-fill"></i> Incorrigible
            </h6>
            <p class="card-text small mb-0 text-muted">
              Training Program upgrades cost 20% less gold, but carry +10%
              injury risk.
            </p>
          </div>
        </div>
      </div>
    </div>
    <div class="card bg-dark text-light mb-4">
      <div class="card-body small">
        From the Barracks you can open a gladiator's detail panel to see their
        trait and how far their stats have grown since recruitment, put them to
        <i class="bi bi-moon-stars-fill text-warning"></i>
        <b class="text-warning">Rest</b>
        so they're skipped by the random arena draw - limited to the Infirmary's
        number of beds (equal to its level). This is the
        <b>only way to influence who gets drawn</b> into the next fight, so use
        it as your targeting tool: shield an injured or low-HP fighter from
        another risky battle, protect a veteran closing in on the 10 battles
        needed to retire, or bench your strongest gladiator so a loss can't take
        them from you. A resting gladiator can still be healed, but can't be
        trained or sold until they're sent back to duty. Or
        <i class="bi bi-flag text-danger"></i> <b class="text-danger">Retire</b>
        a battle-tested veteran (10+ battles fought) for a permanent +10% Fan
        Donation gold/day bonus and +1 Barracks slot, both stacking with every
        gladiator you retire.
      </div>
    </div>

    <h4 class="section-title"><i class="bi bi-shield-fill"></i> Combat</h4>
    <p class="small text-muted">
      Before each fight, 4 gladiators are drawn at random from everyone who
      isn't resting - there's no roster to hand-pick, only who you've chosen to
      protect with Rest (see The Camp above). Place each on a line:
    </p>
    <div class="row g-3 mb-3">
      <div class="col-sm-4">
        <div class="card bg-dark text-light h-100 border-primary">
          <div class="card-body">
            <h6 class="card-title">
              <i class="bi bi-lightning-charge-fill"></i> DPS
            </h6>
            <p class="card-text small mb-0 text-muted">
              +20% Attack, +10% Luck, -10% Defense.
            </p>
          </div>
        </div>
      </div>
      <div class="col-sm-4">
        <div class="card bg-dark text-light h-100 border-info">
          <div class="card-body">
            <h6 class="card-title"><i class="bi bi-shield-fill"></i> Tank</h6>
            <p class="card-text small mb-0 text-muted">
              -10% Attack, -10% Luck, +20% Defense.
            </p>
          </div>
        </div>
      </div>
      <div class="col-sm-4">
        <div class="card bg-dark text-light h-100 border-secondary">
          <div class="card-body">
            <h6 class="card-title">
              <i class="bi bi-people-fill"></i> Support
            </h6>
            <p class="card-text small mb-0 text-muted">No change.</p>
          </div>
        </div>
      </div>
    </div>
    <ul class="small text-muted">
      <li>
        Health is never affected by the pick - it's a stat trade-off, not a
        shield: enemy hits can land on anyone at random regardless of line.
      </li>
      <li>
        Combat is resolved automatically, gladiator by gladiator, against a
        rival trainer's team whose strength is matched to your rank based on
        your gladiators' base stats, <i>before</i> any line trade-off - so
        DPS/Tank/Support picks only shape how the fight plays out, never how
        tough the rival is.
      </li>
      <li>
        High Luck can also land a critical hit or dodge an incoming attack
        entirely.
      </li>
      <li>
        A gladiator knocked down to 1 HP skips its turn and can't attack for the
        rest of the fight - it stays in the pool and can still be hit. If an
        entire side is knocked down, or the 10-round limit is reached, the fight
        ends immediately (a round-limit tie is broken by total HP remaining).
      </li>
      <li>
        A gladiator that's already knocked down and gets hit again is in real
        danger: a Luck-based roll decides whether they cling to the floor or
        actually go down for good - low Luck is genuinely risky, high Luck is
        much safer.
      </li>
      <li>
        Before engaging, you can wager gold on the outcome: win and it's doubled
        back to you, lose and it's gone.
      </li>
    </ul>

    <h4 class="section-title">
      <i class="bi bi-trophy-fill"></i> Victory & Defeat
    </h4>
    <p class="small text-muted">
      Combat is friendly PvE sparring and doesn't affect rank points - most
      gladiators just come back injured, but one knocked down and hit again can
      still die (see Combat above).
    </p>
    <div class="row g-3">
      <div class="col-md-6">
        <div class="card bg-dark text-light h-100 border-success">
          <div class="card-header text-success">
            <i class="bi bi-trophy-fill"></i> Victory
          </div>
          <div class="card-body">
            <ul class="small mb-0">
              <li>Gold and your wager, doubled.</li>
              <li>
                Surviving gladiators come back injured (heal at the Infirmary)
                but a little stronger - Attack and Defense nudge up permanently,
                plus a flat +1 Max HP and +1 Luck (+2 Luck for Lucky
                gladiators).
              </li>
              <li>
                Any sent gladiator that was knocked down and then finished off
                during the fight doesn't come back, even in a winning fight.
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card bg-dark text-light h-100 border-danger">
          <div class="card-header text-danger">
            <i class="bi bi-x-octagon-fill"></i> Defeat
          </div>
          <div class="card-body">
            <ul class="small mb-0">
              <li>No gold, no permanent stat gain this time.</li>
              <li>
                Your gladiators come back exactly as they fought, possibly
                knocked down and injured - unless one was knocked down and then
                finished off, it isn't removed from your camp.
              </li>
              <li>Your wager is forfeited.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.section-title {
  color: var(--gladiator-gold-bright, #e0b64d);
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
}
.section-title:first-of-type {
  margin-top: 0;
}
.building-card {
  transition: border-color 0.15s ease;
}
.building-card:hover {
  border-color: var(--gladiator-gold, #c9972c);
}
</style>
