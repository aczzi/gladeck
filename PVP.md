# PvP combat mode (matchmaking lobby) — plan de conception

## Contexte

L'Arène n'a aujourd'hui que le PvE (`startPvECombat` tire 4 gladiateurs au
hasard contre un rival synthétique calibré sur le rang du joueur ; personne
ne meurt, aucun RP n'est gagné — ça a été changé dans une session
précédente). Objectif : ajouter un vrai mode PvP joueur contre joueur, en
plus du PvE, avec les règles suivantes (précisées par l'utilisateur) :

- Même tirage aléatoire que le PvE, mais **toujours exactement 4
  gladiateurs** (le PvE, lui, scale déjà automatiquement de 1 à 4 via
  `pickRandom` qui prend `Math.min(n, pool.length)` — ce n'est pas un
  changement à faire, c'est déjà le comportement actuel). Le PvP, en
  revanche, doit être bloqué si moins de 4 gladiateurs sont éligibles.
- Tant qu'un gladiateur est en attente dans le lobby PvP, il est verrouillé
  : ne peut pas être retiré par un nouveau tirage PvE, ni par une seconde
  tentative de mise en lobby PvP.
- Le joueur peut miser de l'or avant la mise en lobby ; pas de récompense
  d'or fixe en plus (contrairement au PvE) — seule la mise double en cas de
  victoire.
- Quand 2 joueurs sont dans le lobby, le combat se résout automatiquement
  (pas de clic "Engage" — le placement DPS/Tank/Support est verrouillé
  avant la mise en file).
- Combat **létal** en PvP : un gladiateur qui termine le combat au plancher
  de PV du moteur (1 PV, l'état "à terre" en PvE) meurt et est retiré du
  roster, au lieu de survivre juste blessé comme en PvE.
- Le PvP rapporte des points de rang (RP) (le PvE n'en rapporte plus).

Il n'y a pas de backend (pas de Cloud Functions) — seulement Firebase Auth +
lecture/écriture Firestore côté client, et `firestore.rules` n'autorise
aujourd'hui un utilisateur qu'à écrire son propre document `/users/{uid}`.
Le matchmaking temps réel à 2 joueurs doit donc être construit entièrement
côté client, ce qui guide la majorité des choix ci-dessous.

## Approche retenue : document de match partagé, un seul résolveur, chacun n'écrit que ses propres données

Deux nouvelles collections Firestore, toutes deux conçues pour qu'**aucun
client n'ait jamais besoin d'écrire le document `/users/{uid}` d'un autre
joueur, ni le document de lobby d'un autre joueur** — ça préserve le modèle
de sécurité existant sans jamais assouplir la règle sensible d'écriture par
utilisateur.

- `pvpLobby/{uid}` (id du doc = uid du joueur en attente) : `{ uid,
username, team: PvpCombatant[], wager, createdAt, status: "waiting" }`.
  Créé uniquement par son propriétaire, lu par n'importe qui cherchant un
  adversaire, **supprimé par n'importe qui** une fois capturé (voir la note
  sur la sécurité de la course plus bas).
- `pvpMatches/{matchId}` : `{ playerAUid, playerBUid, playerA: {username,
team, wager}, playerB: {...}, status: "ready"|"resolved", result?,
createdAt, resolvedAt? }`. Créé par le client qui réalise l'appariement
  (doit être l'un des deux participants) ; lu/mis à jour uniquement par les
  deux participants.

Déroulé :

1. Le joueur place ses 4 gladiateurs tirés au sort (DPS/Tank/Support + mise),
   clique sur "Rejoindre le lobby PvP". Le client écrit
   `userData.pvpPending` (verrouille les 4 ids de gladiateurs, même schéma
   que l'actuel `pendingCombat`) et `pvpLobby/{monUid}`.
2. Le client interroge `pvpLobby` pour les autres entrées `status ==
"waiting"` (un seul filtre d'égalité — aucun index composite requis —
   filtré et trié côté client, en ignorant tout ce qui date de plus de
   quelques minutes).
3. S'il existe un candidat, exécuter une **transaction** Firestore :
   re-`get()` le document du candidat, s'il existe toujours, `create()` le
   document `pvpMatches` (moi = playerB, le candidat = playerA) et
   `delete()` le document de lobby du candidat dans la même transaction. Le
   mécanisme de retry par concurrence optimiste de Firestore sur ce document
   partagé empêche naturellement deux clients différents de capturer le même
   candidat (la transaction perdante relit le document, le trouve déjà
   supprimé, et retombe en attente).
4. S'il n'y a pas de candidat, le client se contente d'écouter deux requêtes
   — `pvpMatches` où `playerAUid == monUid` et où `playerBUid == monUid` —
   jusqu'à ce que la transaction de capture d'un _autre_ client crée un
   match me référençant.
5. Une fois qu'un match est visible des deux côtés, le client dont
   l'écouteur se déclenche en premier exécute une seconde transaction : si
   `status == "ready"`, calcule `resolveCombat(unitsA, unitsB)` une seule
   fois et écrit `status: "resolved", result`. L'autre client se contente de
   lire ce résultat — pas besoin de RNG partagé/seedé puisqu'un seul
   navigateur exécute jamais la simulation.
6. Chaque client applique indépendamment le **résultat de son propre côté
   uniquement** à son propre document `/users/{uid}` via `updateUserData`
   existant (même fonction que le PvE) — les gladiateurs au plancher de PV
   ou en dessous sont retirés (mort), les survivants reçoivent
   `applyExperienceGain` + un point d'entraînement uniquement en cas de
   victoire, l'or ne bouge que via la mise (± , pas de récompense fixe), les
   points de rang ne sont ajoutés qu'en cas de victoire. Puis nettoie
   `pvpPending` et supprime son propre document `pvpLobby` s'il existe
   encore.

### Ajouts aux règles Firestore (`firestore.rules`)

```
match /pvpLobby/{uid} {
  allow read: if request.auth != null;
  allow create, update: if request.auth != null && request.resource.data.uid == request.auth.uid;
  allow delete: if request.auth != null;
}
match /pvpMatches/{matchId} {
  allow create: if request.auth != null &&
    (request.resource.data.playerAUid == request.auth.uid || request.resource.data.playerBUid == request.auth.uid);
  allow read, update: if request.auth != null &&
    (resource.data.playerAUid == request.auth.uid || resource.data.playerBUid == request.auth.uid);
}
```

La règle de suppression permissive sur `pvpLobby` est ce qui rend possible
la capture sécurisée-contre-la-course de l'étape 3 sans jamais écrire le
document `/users/{uid}` d'un autre utilisateur, ni avoir besoin d'une règle
d'update "seulement certains champs". Dans le pire cas, une suppression
abusive/malveillante de l'entrée de lobby d'un inconnu signifie juste que
cette entrée doit se remettre en file — ça ne peut jamais toucher aux
véritables données de jeu de quiconque, qui restent protégées par la règle
existante par uid.

## Fichiers à modifier

- **`src/core/game/types.ts`** : ajouter `UserData.pvpPending?: PvpPending |
null` (`{ gladiatorIds: string[]; placement: Record<string, Attribution>;
wager: number }` — même famille de forme que `PendingCombat` existant) ;
  ajouter `PvpCombatant` (id/name/stats/line/trait, même forme que
  `placedGladiators` déjà construit dans Arena.vue) ; ajouter `rivalUnits` à
  `CombatResult` (miroir de `trainerUnits` existant, nécessaire pour que le
  PvP puisse lire les PV finaux des _deux_ côtés — le PvE continue de
  l'ignorer).
- **`src/core/game/gameRules.ts`** :
  - `resolveCombat` : ajouter le champ `rivalUnits` à son retour (même
    mapping que celui déjà utilisé pour `trainerUnits`). Aucun changement de
    RNG nécessaire.
  - Généraliser `sendGladiatorsToCombat(gladiators, excludeIds?:
Set<string>)` (vide par défaut) pour que les tirages PvE et PvP puissent
    tous les deux exclure les gladiateurs actuellement verrouillés pour le
    PvP.
  - Ajouter `PVP_RANK_POINTS_BASE` / `PVP_RANK_POINTS_STAT_DIVISOR` +
    `computePvpRankPointsReward(opponentUnits: CombatUnit[]): number`, en
    reprenant la même forme que l'ancienne formule de points de rang du PvE
    (supprimée précédemment).
- **`src/core/firebase/pvp.ts`** (nouveau, dans le style de
  `sessionManager.ts`) : toute la mécanique Firestore — `joinPvpLobby`,
  `leavePvpLobby`, `findAndClaimOpponent` (la transaction de l'étape 3),
  `watchMyMatches` (les deux requêtes `pvpMatches` de l'étape 4),
  `resolveMatchIfReady` (la transaction de l'étape 5). Garde la logique de
  transaction Firestore hors de la couche Vue, cohérent avec la façon dont
  `sessionManager.ts` et `store/index.ts` possèdent déjà l'accès Firestore.
- **`src/components/CombatPlacementCard.vue`** (nouveau, extrait du markup
  existant dans `Arena.vue:29-98`) : la carte de placement DPS/Tank/Support
  d'un gladiateur, prenant le gladiator + le placement courant + un callback
  en props. Réutilisé par l'étape 2 du PvE et le nouveau flux PvP au lieu de
  dupliquer ~70 lignes de markup Bootstrap.
- **`src/components/PvpLobby.vue`** (nouveau) : sa propre machine à états —
  tirage → placement/mise → "Rejoindre le lobby PvP" → écran d'attente
  d'adversaire (avec un bouton Annuler qui appelle `leavePvpLobby` + nettoie
  `pvpPending`) → résolution automatique → écran de résultat (réutilise la
  structure de la carte de résultat du PvE, étendue pour afficher les
  gladiateurs morts). Au montage, si `userData.pvpPending` existe déjà (cas
  du reload), reprend l'écoute au lieu de repartir du tirage — c'est
  nécessaire pour la correction, pas juste l'UX, puisqu'un verrou PvP que
  rien ne résout jamais bloquerait ces gladiateurs indéfiniment.
- **`src/components/Arena.vue`** : ajouter un sélecteur de mode PvE/PvP en
  haut (même pattern que les onglets Camp/Arena dans `MainView.vue`) ; le
  `canFight`/tirage du PvE doit exclure
  `userData.pvpPending?.gladiatorIds` pour qu'un gladiateur verrouillé ne
  puisse pas être tiré dans un second combat PvE sans rapport.
- **`firestore.rules`** : les ajouts ci-dessus.

## Ce qui est volontairement hors scope (v1)

- Pas de sélection manuelle de l'équipe — tirage aléatoire uniquement,
  selon la précision de l'utilisateur.
- Pas de gestion spécifique d'un gladiateur vendu/retiré par un autre onglet
  pendant qu'il est en file PvP : réutilisation du pattern défensif déjà
  présent dans l'hydratation de `pendingCombat` d'Arena.vue (abandon
  silencieux si un id de gladiateur n'existe plus plutôt que d'ajouter une
  UI pour l'empêcher).
- Les entrées de lobby abandonnées de plus de quelques minutes sont juste
  filtrées de la recherche d'adversaire ; pas de TTL/cron côté serveur
  (aucun n'existe dans ce projet). Un joueur qui recharge récupère sa propre
  entrée bloquée via le même chemin de reprise au montage que pour un reload
  légitime.

## Vérification

- `npm run build` et `npm run lint` (scripts existants, pas de suite de
  tests dans ce repo).
- Test manuel à 2 joueurs : `firebase emulators:start --only firestore` +
  `npm run dev`, ouvrir deux profils de navigateur (ou un normal + un
  incognito) connectés avec deux comptes réels différents (l'Auth reste sur
  Firebase Cloud même en mode émulateur, selon la config actuelle de
  `initializeFirebaseForEmulator`) avec ≥4 gladiateurs non-resting chacun.
  Mettre les deux en file PvP et vérifier : l'appariement se fait
  automatiquement, les gladiateurs sont bien exclus des tirages PvE pendant
  qu'ils sont en file, les gladiateurs du perdant tombés au plancher sont
  effectivement retirés de son roster, la mise du gagnant double et il gagne
  des points de rang, et recharger un onglet en pleine file d'attente ne
  bloque pas ses gladiateurs.
