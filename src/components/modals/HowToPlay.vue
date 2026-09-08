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
      supporters automatically; the <b>Barracks</b> houses up to 8 gladiators,
      lets you rename them and ranks them by power so your best fighters stand
      out; the <b>Training Program</b> trains gladiator stats, the
      <b>Infirmary</b> heals injured gladiators, and the <b>Market</b> lets you
      recruit new gladiators and trade resources. Each gladiator has 4 stats:
      Attack, Luck and Defense on a 0-200 scale, and Health with no upper
      bound.
    </p>
    <h4>Combat</h4>
    <p>
      There's no roster to curate - before each fight, 4 gladiators are drawn at
      random from your whole camp and sent into the arena. Place 2 as
      <b>DPS</b> (+10% Attack/Luck, -10% Health/Defense) and 2 as
      <b>Tank</b> (+10% Health/Defense, -10% Attack/Luck) - it's a stat
      trade-off, not a shield: enemy hits can land on anyone at random
      regardless of line. Combat is then resolved automatically, gladiator by
      gladiator, against a rival trainer's team whose strength is matched to
      your rank. High Luck can also land a critical hit or dodge an incoming
      attack entirely.
    </p>
    <h4>Victory & Defeat</h4>
    <p>
      Winning grants rank points and gold; your surviving gladiators come back
      injured (heal at the Infirmary) but also a little stronger - each fight
      won permanently nudges up Attack and Defense, on top of Training
      Program upgrades, and grants a flat +1 Max HP and +1 Luck, so veterans
      are worth keeping. Losing removes the 4 gladiators that fought from
      your camp - rebuild through the Market.
    </p>
  </div>
</template>

<script setup lang="ts"></script>
