# Trajectoire gratuite avant investissement — conception révisée

## 1. Objectif

Définir une trajectoire de livraison du PvP décrit dans `PVP.md` qui reste sur
le plan Firebase Spark (gratuit) le plus longtemps possible, avant de basculer
vers Blaze et les Cloud Functions autoritaires. L'objectif n'est pas de
remplacer `PVP.md`, mais de proposer une v0 volontairement non compétitive qui
en respecte l'esprit, avec des garde-fous suffisants pour une communauté
restreinte à faible enjeu.

## 2. Constat

`PVP.md` §2 est explicite : un mode PvP avec mise, classement et morts
permanentes exige une résolution autoritaire côté serveur, donc des Cloud
Functions, donc le plan Blaze. Mais `PVP.md` §2.1 anticipe déjà la fenêtre
exploitée ici : _le PvP peut être testé fonctionnellement, mais il ne peut pas
être présenté comme résistant à la triche_ tant que la migration serveur n'est
pas faite. Cette trajectoire consiste à occuper cette fenêtre le plus
longtemps possible avant d'investir.

## 3. Décision d'architecture

Le PvP gratuit est **asymétrique et asynchrone** : l'attaquant combat un
instantané public de l'adversaire, jamais son état live. Il n'y a donc qu'un
seul écrivain par match (l'attaquant, sur son propre document), ce qui élimine
le vrai problème que les Cloud Functions résolvent dans `PVP.md` — coordonner
deux écrivains simultanés de façon atomique.

Le défenseur ne risque ni or ni roster. Seul son `rankPoints` public peut être
modifié par un tiers, et uniquement dans les bornes d'une règle Firestore. Le
reste de son document reste protégé comme aujourd'hui.

Ce mode n'est jamais présenté comme classé ou résistant à la triche. L'UI doit
l'étiqueter clairement (ex. "Ligue amicale — non classé") tant que la
migration vers `PVP.md` n'est pas faite.

### 3.1 Ce que cette v0 ne couvre pas

- Un client malveillant peut mentir sur le résultat d'un combat qu'il a
  calculé localement et créditer un gain plus favorable que la réalité.
- Aucune garantie d'équité si l'attaquant modifie le moteur de combat côté
  client avant de soumettre son résultat.
- L'abus reste possible mais borné en amplitude par les règles Firestore
  (ci-dessous), et détectable a posteriori.

Ces limites sont acceptables pour une communauté restreinte à faible enjeu, et
inacceptables au-delà (voir §7).

## 4. Modèle de données (v0 gratuite)

Réutilise `/leaderboard/{uid}` déjà prévu dans `PVP.md` §3.4 comme source de
vérité publique pour l'appariement, sans file d'attente ni lock de
matchmaking :

```ts
interface LeaderboardEntry {
  uid: string;
  username: string;
  rankPoints: number;
  rosterValue: number;
  rosterSnapshot: PvpCombatant[]; // instantané, pas de lien live vers users/{uid}
  updatedAt: Timestamp;
  lastRpHitAt: Timestamp; // anti-abus, cooldown d'écriture croisée
}
```

`rosterSnapshot` est mis à jour par le propriétaire lui-même (via
`updateUserData()`, accumulateur 25s existant), jamais par un attaquant. Un
attaquant combat donc toujours une version potentiellement légèrement
périmée du roster adverse — acceptable en v0, car documenté et sans impact
pour le défenseur.

Ajout dans `/users/{uid}` (propriétaire uniquement) :

```ts
interface FriendlyPvpState {
  lastAttackAt: Timestamp; // cooldown d'attaque
  wagerInFlight?: number; // nul en dehors d'un combat en cours
}
```

## 5. Déroulé fonctionnel

### 5.1 Choisir une cible

Le client lit une page de `/leaderboard` (requête bornée, pas de `list`
illimité) et propose une sélection de cibles dans une fourchette de
`rankPoints` proche de l'attaquant.

### 5.2 Résoudre le combat localement

1. Le client vérifie son propre cooldown (`lastAttackAt`) avant d'engager.
2. Il exécute `resolveCombat` du moteur partagé (`packages/game-core`) avec le
   `rosterSnapshot` de la cible et son propre roster courant.
3. Le résultat est appliqué **uniquement à son propre document** dans la même
   transaction que le débit de la mise, la mort éventuelle d'un gladiateur au
   plancher `COMBAT_HP_FLOOR`, et le gain plafonné.

### 5.3 Écriture croisée bornée

Dans la même opération, le client écrit `rankPoints` (et seulement ce champ)
sur `/leaderboard/{defenderUid}`, borné à ±1 point, avec un cooldown minimal
entre deux écritures croisées sur la même cible pour limiter le spam.

### 5.4 Annulation

Il n'y a pas d'état "en file" à annuler : le combat se résout en une seule
opération cliente. Seul `wagerInFlight` doit repasser à `null` en cas
d'échec de la transaction, pour éviter un blocage local.

## 6. Règles Firestore (v0 gratuite)

Principes attendus, en complément — pas en remplacement — des règles
existantes :

```text
/leaderboard/{uid}
  lecture : utilisateur authentifié
  écriture propriétaire : username, rosterSnapshot, rosterValue, updatedAt
  écriture tiers authentifié : rankPoints uniquement, ±1, avec cooldown
    (request.time > resource.data.lastRpHitAt + cooldown)
  list : autorisé mais borné (limit + plage de rankPoints), jamais illimité

/users/{uid}
  lecture : propriétaire
  écriture : propriétaire, bornée comme aujourd'hui
    + mise plafonnée à un montant fixe
    + gain plafonné à 2× mise + bonus fixe
    + au plus un gladiateur retiré par combat
    + cooldown d'attaque vérifié via lastAttackAt
```

Exemple de règle pour l'écriture croisée bornée :

```js
match /leaderboard/{uid} {
  allow update: if request.auth != null
    && request.resource.data.diff(resource.data).affectedKeys()
         .hasOnly(['rankPoints', 'lastRpHitAt'])
    && request.resource.data.rankPoints >= resource.data.rankPoints - 1
    && request.resource.data.rankPoints <= resource.data.rankPoints + 1
    && request.time > resource.data.lastRpHitAt + duration.value(30, 's');
}
```

## 7. Nettoyage et observabilité sans Cloud Functions

- **Réconciliation périodique** : un script Node utilisant le SDK Admin,
  exécuté par un cron GitHub Actions (minutes gratuites GitHub, hors
  facturation Firebase). Il journalise les écarts suspects (RP incohérents,
  or anormal, cooldowns contournés) dans un rapport pour intervention
  manuelle, sans jamais écrire automatiquement dans les documents joueurs.
- **Bannissement** : manuel, via `admin/configuration` ou un champ dédié, en
  attendant une vraie modération serveur.
- Pas de nettoyage de lobby à prévoir : ce mode n'a pas de file d'attente
  persistante.

## 8. Limites du plan Spark à surveiller

- Firestore : 50k lectures/jour, 20k écritures/jour, 20k suppressions/jour,
  1 GiB stocké.
- **Hosting** : 10 Go stockés, **360 Mo de transfert/jour** — c'est
  généralement la limite qui sera atteinte en premier en cas de pic
  d'audience, avant Firestore.
- Authentication email/mot de passe : gratuite et illimitée.
- Cloud Functions : indisponibles sur Spark, quel que soit le trigger. Toute
  Cloud Function nécessite Blaze, même pour rester sous le quota gratuit
  mensuel (2M invocations, 400k GB-s, 200k CPU-s).

## 9. Seuils de bascule vers Blaze et `PVP.md`

Basculer vers l'implémentation autoritaire de `PVP.md` dès qu'**un** de ces
signaux apparaît :

1. Le classement doit être présenté comme compétitif, ou une monétisation
   réelle est envisagée sur les mises.
2. Triche constatée et gênante pour la communauté, pas seulement théorique.
3. Besoin d'un PvP simultané en file d'attente plutôt qu'asynchrone contre un
   instantané.
4. Trafic approchant les quotas Spark (§8), notamment le transfert Hosting
   journalier.

Passer à Blaze ne signifie pas commencer à payer : les quotas gratuits
mensuels de Blaze couvrent une audience modeste. Il s'agit de lever le
plafond dur de Spark, pas d'accepter une facture.

## 10. Fichiers à créer ou modifier

### Domaine partagé

- `packages/game-core/src/combatEngine.ts` : réutilisé tel quel (v0 et
  `PVP.md` partagent le même moteur déterministe).
- `packages/game-core/src/pvpRules.ts` : ajout des constantes de plafond v0
  (mise max, gain max, cooldown d'attaque, cooldown d'écriture croisée).

### Frontend

- `src/core/firebase/friendlyPvp.ts` : lecture leaderboard, résolution locale,
  transaction d'écriture propre + écriture croisée bornée.
- `src/components/Arena.vue` : sélection PvE / PvP amical, étiquetage
  "non classé".
- `src/core/game/gameRules.ts` : adaptateur de verrouillage réutilisé de
  `PVP.md` §6 pour les gladiateurs engagés.

### Firebase

- `firestore.rules` : règles §6 ci-dessus, en complément des règles
  existantes.
- `firestore.indexes.json` : index sur `rankPoints` pour la sélection de
  cibles.

### Outillage hors Firebase

- `.github/workflows/pvp-reconciliation.yml` : cron GitHub Actions exécutant
  le script de réconciliation §7.
- `scripts/reconcilePvp.js` : script Admin SDK en lecture seule, produisant un
  rapport.

## 11. Critères d'acceptation

La v0 gratuite est terminée uniquement si :

- aucun combat n'affecte l'or ou le roster du défenseur ;
- l'écriture croisée est bornée à ±1 `rankPoints` avec cooldown, et rejetée
  sinon par les règles Firestore ;
- mise, gain et morts sont plafonnés par les règles Firestore côté
  attaquant ;
- l'UI étiquette explicitement ce mode comme non classé ;
- aucune Cloud Function n'est nécessaire au déploiement ;
- le script de réconciliation détecte les écarts sans jamais écrire dans les
  documents joueurs ;
- les seuils de bascule (§9) sont documentés et connus avant tout dépassement.

## 12. Hors scope v0

- Appariement simultané et file d'attente serveur.
- Résolution garantie contre un client malveillant qui mentirait sur son
  propre résultat de combat.
- Classement compétitif ou avec enjeu réel.
- Modération automatique.
- Tout ce qui, dans `PVP.md` §12, reste hors scope de la v1 autoritaire.
