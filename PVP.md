# Mode de combat PvP — conception révisée

## 1. Objectif

Ajouter à l'Arène un mode PvP joueur contre joueur, en complément du PvE,
avec les règles suivantes :

- l'équipe est tirée aléatoirement et contient toujours exactement 4
  gladiateurs éligibles ;
- les gladiateurs tirés sont verrouillés jusqu'à l'annulation ou au règlement
  du match ;
- le joueur choisit le placement DPS/Tank/Support et une mise avant d'entrer
  dans la file ;
- la mise est débitée à l'entrée dans la file et placée sous séquestre ;
- un vainqueur récupère deux fois sa mise, + un bonus 100Gold + 20% de la mise par gladiateur 'Crowd Favorite'
- le combat se résout automatiquement dès l'appariement ;
- tout gladiateur terminant le combat à `COMBAT_HP_FLOOR` ou moins meurt et est
  retiré du roster, même dans l'équipe victorieuse ;
- seuls les survivants du vainqueur gagnent l'expérience et le point
  d'entraînement ;
- le PvP attribue +1 point de rang PvP par victoire, distinct des points de
  rang PvE (le PvE en attribue aussi, séparément) ;
- une reconnexion reprend l'état courant sans rejouer ni régler deux fois un
  match.

Le PvE conserve son fonctionnement actuel : il sélectionne de 1 à 4
gladiateurs éligibles et calibre le rival sur la puissance moyenne de l'équipe.

## 2. Décision d'architecture

Le PvP est **autoritaire côté serveur**. Une Cloud Function assure le tirage,
l'appariement, la résolution et le règlement atomique des deux joueurs.

Un navigateur ne doit jamais :

- décider du résultat définitif d'un match ;
- écrire le document d'un adversaire ;
- attribuer lui-même de l'or ou des points de rang PvP ;
- supprimer librement le lobby d'un autre joueur ;
- pouvoir appliquer deux fois le même résultat.

Une architecture entièrement côté client ne suffit pas pour un mode avec
mise, classement et morts permanentes : une transaction empêche une course
d'écriture, mais ne rend pas honnête le client qui écrit en premier.

### 2.1 Prérequis de sécurité

Les règles actuelles autorisent encore un joueur à modifier librement son
document `/users/{uid}`. Avant de considérer le classement PvP comme
compétitif, les mutations autoritaires suivantes doivent passer par des Cloud
Functions et ne plus être librement écrites par le client :

- or et points de rang ;
- roster, statistiques, expérience et points d'entraînement ;
- état PvP et règlement d'un match.

Les préférences non sensibles, comme le nom affiché sous contraintes, peuvent
rester modifiables par le propriétaire. Tant que cette migration n'est pas
faite, le PvP peut être testé fonctionnellement, mais il ne peut pas être
présenté comme résistant à la triche.

## 3. Modèle de données

### 3.1 État privé du joueur

Ajout dans `/users/{uid}` :

```ts
interface PvpPending {
  preparationId: string;
  status: "prepared" | "queued";
  gladiatorIds: string[];
  placement: Record<string, Attribution>;
  wager: number;
  preparedAt: Timestamp;
  queuedAt?: Timestamp;
}

interface UserData {
  // champs existants
  pvpPending?: PvpPending | null;
  lastSettledPvpMatchId?: string | null;
}
```

`lastSettledPvpMatchId` constitue une protection d'idempotence. Une
implémentation permettant plusieurs règlements hors ordre devra utiliser une
map bornée ou une sous-collection de reçus à la place d'un identifiant unique.

### 3.2 File d'attente serveur

`pvpLobby/{uid}` :

```ts
interface PvpLobbyEntry {
  uid: string;
  preparationId: string;
  wager: number;
  createdAt: Timestamp; // timestamp serveur
  expiresAt: Timestamp;
  status: "waiting";
}
```

Le lobby ne publie ni roster ni statistiques. Seules les Cloud Functions
créent, modifient ou suppriment ces documents. Le propriétaire peut lire sa
propre entrée pour afficher son état, mais aucune requête cliente globale
n'est nécessaire.

### 3.3 Match partagé

`pvpMatches/{matchId}` :

```ts
interface PvpParticipantSnapshot {
  uid: string;
  username: string;
  wager: number;
  team: PvpCombatant[];
}

interface PvpMatch {
  schemaVersion: 1;
  playerAUid: string;
  playerBUid: string;
  playerA: PvpParticipantSnapshot;
  playerB: PvpParticipantSnapshot;
  seed: string;
  status: "resolved";
  result: PvpMatchResult;
  createdAt: Timestamp;
  resolvedAt: Timestamp;
  expiresAt: Timestamp;
}
```

Les deux participants peuvent lire le match, mais seul le backend peut
l'écrire. Le document contient les snapshots utilisés par le moteur afin que
le résultat reste vérifiable après une évolution ultérieure du roster.

### 3.4 Projection publique du classement

Le classement continue d'utiliser `/leaderboard/{uid}` et jamais les documents
privés `/users/{uid}`. Le règlement serveur met à jour dans la même transaction :

- `username` ;
- `pvpRankPoints` ;
- `rosterValue` ;
- `updatedAt`.

## 4. Moteur de combat déterministe

Le moteur doit être indépendant de Vue et de Firebase. `resolveCombat` accepte
une source aléatoire injectée au lieu d'appeler directement `Math.random()` :

```ts
type RandomSource = () => number;

resolveCombat(
  playerAUnits: CombatUnit[],
  playerBUnits: CombatUnit[],
  random: RandomSource,
): CombatResult;
```

La Cloud Function génère le seed une seule fois avant d'ouvrir la transaction.
Le même seed est réutilisé si Firestore rejoue la transaction. Un PRNG stable et
versionné produit ainsi un résultat reproductible.

`CombatResult` doit contenir les unités finales des deux camps et un résultat
neutre par rapport à l'ordre des joueurs :

```ts
interface CombatResult {
  winner: "playerA" | "playerB" | "draw";
  log: CombatLogEntry[];
  playerAUnits: CombatUnitResult[];
  playerBUnits: CombatUnitResult[];
}
```

Une égalité ne doit pas favoriser implicitement le joueur assigné au camp
`rival`. La règle de départage v1 est : égalité des PV après le dernier round
= match nul et remboursement des deux mises.

Le moteur PvE peut conserver une fonction d'adaptation retournant son actuel
`victory: boolean` et sa récompense fixe.

## 5. Déroulé fonctionnel

### 5.1 Préparer une équipe

1. Le client appelle `preparePvpEntry`.
2. La fonction lit le joueur et vérifie qu'il n'a ni match ni préparation en
   cours.
3. Elle génère avant la transaction un seed de préparation qui restera stable
   si Firestore rejoue la transaction.
4. Elle sélectionne avec ce seed exactement 4 gladiateurs parmi ceux qui ne
   sont ni au repos ni déjà verrouillés.
5. Elle écrit `pvpPending.status = "prepared"` avec les quatre IDs et renvoie
   l'équipe au client.
6. Le client affiche le placement et la mise.

Une préparation existante est toujours renvoyée telle quelle après un reload :
elle ne peut pas être relancée pour obtenir gratuitement un meilleur tirage.

### 5.2 Rejoindre la file

Le client appelle `joinPvpQueue({ placement, wager })` après avoir exécuté
`flushUserDataUpdates()` afin qu'aucune mutation locale antérieure ne puisse
écraser l'état serveur.

Dans une transaction, la fonction :

1. relit le joueur et sa préparation ;
2. valide les 4 IDs, les placements, la mise, le plafond de mise et le solde ;
3. vérifie que les gladiateurs existent encore et sont éligibles ;
4. débite immédiatement la mise ;
5. passe `pvpPending` à `queued` ;
6. crée `pvpLobby/{uid}` avec des timestamps serveur.

Si la transaction échoue, ni l'or ni le lobby ne changent.

### 5.3 Apparier sans double match

Pour la v1, les opérations d'appariement sont sérialisées par un document
`pvpMeta/matchmakingLock`. Ce choix privilégie la correction à la capacité de
montée en charge ; un système shardé pourra le remplacer plus tard.

La Cloud Function :

1. lit et incrémente le verrou dans une transaction ;
2. sélectionne les deux plus anciennes entrées compatibles ;
3. relit les deux utilisateurs et leurs `pvpPending` ;
4. calcule un `matchId` déterministe à partir des deux UID et des identifiants
   de préparation ;
5. supprime **les deux** documents de lobby ;
6. résout le combat avec un seed stable ;
7. règle les deux joueurs et crée le match dans la même transaction.

La lecture et la suppression des deux lobbies empêchent A et B de se capturer
mutuellement dans deux matchs différents.

### 5.4 Régler le match atomiquement

La même transaction applique aux deux joueurs :

- retrait de chaque gladiateur dont les PV finaux sont inférieurs ou égaux à
  `COMBAT_HP_FLOOR` ;
- mise à jour des PV et du statut `injured` des survivants ;
- expérience et point d'entraînement pour les survivants du vainqueur ;
- retour de `2 × wager` au vainqueur ;
- remboursement de chaque mise en cas de match nul ;
- attribution des RP selon une formule pure et bornée ;
- suppression de `pvpPending` ;
- enregistrement de `lastSettledPvpMatchId` ;
- mise à jour des deux documents `leaderboard` ;
- création du document `pvpMatches/{matchId}` résolu.

La transaction vérifie avant toute application que le match n'existe pas déjà
et que `lastSettledPvpMatchId` ne correspond pas au match courant.

### 5.5 Annuler

`cancelPvpEntry` est une Cloud Function idempotente :

- `prepared` : supprime simplement la préparation ;
- `queued` : supprime le lobby, rembourse la mise et nettoie `pvpPending` dans
  une transaction ;
- match déjà résolu : l'annulation est sans effet et le client affiche le
  résultat référencé par `lastSettledPvpMatchId`.

Une entrée expirée est annulée par le backend selon la même règle. Les champs
`expiresAt` permettent également d'activer une politique TTL Firestore pour le
nettoyage physique des anciens lobbies et matchs.

## 6. Verrouillage dans l'interface

Tous les composants utilisent une fonction partagée :

```ts
isGladiatorLocked(gladiatorId, userData): boolean
```

Un gladiateur présent dans `pvpPending.gladiatorIds` est exclu ou désactivé dans :

- le tirage PvE de `Arena.vue` ;
- une nouvelle préparation PvP ;
- la vente du Market ;
- la retraite et le repos des Barracks ;
- les soins de l'Infirmary ;
- l'entraînement du Training Program.

Le serveur répète toutes ces validations. Les contrôles de l'interface ne sont
que des protections UX.

## 7. Règles Firestore

Principes attendus :

```text
/users/{uid}
  lecture : propriétaire
  écriture sensible : backend uniquement

/leaderboard/{uid}
  lecture : utilisateur authentifié
  écriture : backend uniquement pour les champs calculés

/pvpLobby/{uid}
  lecture unitaire : propriétaire
  list : refusé côté client
  écriture : backend uniquement

/pvpMatches/{matchId}
  lecture : participant A ou B
  écriture : backend uniquement

/pvpMeta/{document}
  lecture/écriture : backend uniquement
```

Les règles ne doivent pas autoriser `delete` à n'importe quel utilisateur ni
permettre à un participant de modifier équipes, mises, seed, résultat ou UID.
Les accès Admin SDK des Cloud Functions ne dépendent pas de ces règles.

Les règles et index sont déployés par le workflow avant la nouvelle version du
frontend.

## 8. Fichiers à créer ou modifier

### Domaine partagé

- `packages/game-core/src/types.ts` : types de combat partagés et résultat
  symétrique ;
- `packages/game-core/src/combatEngine.ts` : moteur pur avec RNG injecté ;
- `packages/game-core/src/seededRandom.ts` : PRNG stable et versionné ;
- `packages/game-core/src/pvpRules.ts` : formule RP, plafond de mise et règles
  létales ;
- `src/core/game/types.ts` : types d'état frontend, dont `pvpPending`, et
  réexports utiles du package partagé ;
- `src/core/game/gameRules.ts` : adaptateur PvE et helpers de verrouillage.

`packages/game-core` ne dépend ni de Vue, ni de Vite, ni d'un SDK Firebase. Le
frontend et les Functions consomment donc exactement le même moteur.

### Backend

- `functions/src/pvp/preparePvpEntry.ts` ;
- `functions/src/pvp/joinPvpQueue.ts` ;
- `functions/src/pvp/cancelPvpEntry.ts` ;
- `functions/src/pvp/matchmaking.ts` ;
- `functions/src/pvp/settlePvpMatch.ts` ;
- `functions/src/pvp/validation.ts` ;
- `functions/src/index.ts`.

### Frontend

- `src/core/firebase/pvp.ts` : appels aux fonctions et listeners en lecture ;
- `src/components/CombatPlacementCard.vue` : carte de placement réutilisable ;
- `src/components/PvpLobby.vue` : machine à états persistante ;
- `src/components/Arena.vue` : sélection PvE/PvP et exclusion des verrouillés ;
- composants de bâtiments : désactivation des actions sur les gladiateurs
  verrouillés ;
- `src/core/store/index.ts` : réception des snapshots serveur sans contourner
  la file d'écriture locale.

### Firebase

- `firestore.rules` : collections PvP et verrouillage des écritures sensibles ;
- `firestore.indexes.json` : index de file sur `status`, `createdAt` et
  `expiresAt` ;
- `firebase.json` : déclaration et émulation des Functions ;
- `.github/workflows/deploy-prod.yml` : build et déploiement des Functions avant
  le frontend.

## 9. Machine à états du client

`PvpLobby.vue` dérive son affichage des données persistées :

```text
idle
  -> preparing
  -> prepared
  -> joining
  -> queued
  -> resolved
  -> idle
```

Au montage :

1. lire `userData.pvpPending` ;
2. si `prepared`, restaurer le placement ;
3. si `queued`, attendre le prochain snapshot du document utilisateur ;
4. lorsque `pvpPending` disparaît et que `lastSettledPvpMatchId` change, lire
   directement le match correspondant et afficher le résultat déjà réglé ;
5. si l'état est incohérent, appeler une fonction de réconciliation plutôt que
   supprimer localement des données.

Chaque listener possède une fonction `unsubscribe` dédiée et est nettoyé au
changement d'état et au démontage du composant.

## 10. Observabilité et réconciliation

Chaque commande reçoit un identifiant idempotent généré par le client. Les
Functions journalisent :

- UID et command ID ;
- préparation et match ID ;
- ancienne et nouvelle machine à états ;
- seed et version du moteur ;
- montants débités ou crédités ;
- RP attribués ;
- erreurs et reprises de transaction.

Une fonction administrateur de réconciliation détecte :

- lobby sans `pvpPending` ;
- `pvpPending.queued` sans lobby ni match ;
- match dont un règlement manque ;
- mise débitée sans lobby ou match correspondant ;
- projection leaderboard désynchronisée.

## 11. Vérification

### Tests unitaires

- même seed = même combat et même journal ;
- ordre des joueurs sans biais implicite ;
- égalité et remboursement ;
- mort au plancher de PV ;
- calcul des RP et bornes ;
- exactement 4 gladiateurs éligibles ;
- verrouillage partagé par toutes les actions.

### Tests d'intégration avec les émulateurs

- deux joueurs rejoignent simultanément la file ;
- trois joueurs cherchent le même adversaire ;
- aucune paire ne produit deux matchs ;
- débit, résultat, rosters et leaderboard sont atomiques ;
- annulation avant et après appariement ;
- double appel avec le même command ID ;
- retry automatique d'une transaction ;
- fermeture du navigateur pendant chaque état ;
- refus des lectures et écritures interdites par les règles ;
- expiration puis réconciliation d'un lobby abandonné.

Utiliser Firebase Emulator Suite, `@firebase/rules-unit-testing` et une suite de
tests TypeScript. `npm run build` et `npm run lint` restent obligatoires, mais
ne constituent pas une validation suffisante du protocole PvP.

### Test manuel

Avec deux comptes et au moins 4 gladiateurs éligibles chacun :

1. préparer les deux équipes ;
2. choisir placements et mises ;
3. rejoindre simultanément ;
4. vérifier qu'un seul match est créé ;
5. vérifier le même résultat dans les deux navigateurs ;
6. contrôler morts, survivants, or, RP et leaderboard ;
7. recharger pendant l'attente puis après le règlement ;
8. vérifier que ni le résultat ni les récompenses ne sont appliqués deux fois.

## 12. Hors scope v1

- sélection manuelle de l'équipe ;
- matchmaking par niveau ou région ;
- spectateurs et replays publics ;
- tournoi ou saison classée ;
- montée en charge au-delà du verrou global de matchmaking ;
- conservation permanente de tous les journaux de combat.

## 13. Critères d'acceptation

La v1 est terminée uniquement si :

- aucun client ne peut résoudre ou régler lui-même un match ;
- chaque entrée en file débite exactement une mise ;
- chaque paire produit au plus un match ;
- le règlement des deux joueurs et du leaderboard est atomique ;
- une commande rejouée reste sans effet supplémentaire ;
- un reload reprend l'état sans nouveau tirage ;
- tous les gladiateurs verrouillés sont protégés dans chaque écran ;
- les règles Firestore refusent les mutations PvP directes ;
- les tests de concurrence et de sécurité passent sur les émulateurs.
