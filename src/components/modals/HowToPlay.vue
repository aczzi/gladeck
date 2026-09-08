<template>
  <div class="container-fluid">
    <p>
      You are a <b>lanista</b>, manager of your own
      gladiator stable, hungry for gold, glory and the favor of the crowd.
      Recruit fighters from the slave markets, train them, heal their wounds
      and send them into the arena to bleed for your name. Every gladiator
      who falls in the sand can be replaced - your reputation as a trainer
      cannot.
    </p>
    <h4>Camp</h4>
    <p>
      Grow five buildings: <b>Fan donation</b> collects gold from your
      supporters automatically, the <b>Barracks</b> houses your gladiators and
      lets you pick who fights, the <b>School</b> trains gladiator stats, the
      <b>Infirmary</b> heals injured gladiators, and the <b>Market</b> lets you
      recruit new gladiators and trade resources.
    </p>
    <h4>Roster</h4>
    <p>
      Your trainer level sets your roster size: 6 slots at level 1, plus 2 more
      slots per level. You must fill every slot before you can start a fight.
      Each gladiator has 4 stats on a 0-100 scale: Attack, Luck, Health,
      Defense.
    </p>
    <h4>Combat</h4>
    <p>
      Before each fight, you send 4 gladiators at random from your roster into
      the arena. Place 2 on the <b>Frontline</b> (+10% Attack/Luck, -10%
      Health/Defense) and 2 on the <b>Backline</b> (+10% Health/Defense, -10%
      Attack/Luck). Combat is then resolved automatically against a rival
      trainer's team, whose strength is matched to your rank.
    </p>
    <h4>Victory & Defeat</h4>
    <p>
      Winning grants rank points and gold; your surviving gladiators come back
      injured and need the Infirmary to fully heal. Losing removes the 4
      gladiators that fought from your roster - rebuild through the Barracks or
      the Market.
    </p>
  </div>
</template>

<script setup lang="ts"></script>
