<template>
  <div class="container-fluid">
    <p>
      You are a <b>lanista</b>, manager of your own gladiator stable, hungry for
      gold, glory and the favor of the crowd. Recruit fighters from the slave
      markets, train them, heal their wounds and send them into the arena to
      bleed for your name.
    </p>
    <h4>Camp</h4>
    <p>
      Grow five buildings: <b>Fan donation</b> collects gold from your
      supporters automatically and can also roll, once every 24h, a Luck
      Boost you hand to any gladiator - the higher the building's level, the
      better your odds; the <b>Barracks</b> houses your gladiators (upgrade
      it for more storage), the <b>School</b> trains gladiator stats, the
      <b>Infirmary</b> heals injured gladiators, and the <b>Market</b> lets
      you recruit new gladiators and trade resources. Each gladiator has 4
      stats on a 0-100 scale: Attack, Luck, Health, Defense.
    </p>
    <h4>Combat</h4>
    <p>
      There's no roster to curate - before each fight, 4 gladiators are drawn
      at random from your whole camp and sent into the arena. Place 2 as
      <b>Attacker</b> (+10% Attack/Luck, -10% Health/Defense) and 2 as
      <b>Defender</b> (+10% Health/Defense, -10% Attack/Luck) - it's a stat
      trade-off, not a shield: enemy hits can land on anyone at random
      regardless of line. Combat is then resolved automatically, gladiator by
      gladiator, against a rival trainer's team whose strength is matched to
      your rank. High Luck can also land a critical hit or dodge an incoming
      attack entirely.
    </p>
    <h4>Victory & Defeat</h4>
    <p>
      Winning grants rank points and gold; your surviving gladiators come back
      injured and need the Infirmary to fully heal. Losing removes the 4
      gladiators that fought from your camp - rebuild through the Market.
    </p>
  </div>
</template>

<script setup lang="ts"></script>
