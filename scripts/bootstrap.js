// Usage: node scripts/bootstrap.js <username> <level>
// Creates a dev user and the admin/configuration doc against the local
// Firestore emulator (npm run emulator).
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  connectFirestoreEmulator,
  Timestamp,
} from "firebase/firestore";

import { firebaseConfig } from "@/core/firebase/index";

function randomStat() {
  return 20 + Math.floor(Math.random() * 41); // 20-60
}

function createCard(name) {
  const hp = randomStat();
  return {
    id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    name,
    inDeck: true,
    injured: false,
    stats: {
      atk: randomStat(),
      luck: randomStat(),
      hpMax: hp,
      hpCurrent: hp,
      def: randomStat(),
    },
  };
}

function getMaxSlots(level) {
  return 6 + (level - 1) * 2;
}

function createUserData(username, level) {
  const maxSlots = getMaxSlots(level);
  const cards = {};
  for (let i = 0; i < maxSlots; i++) {
    const card = createCard(`Recruit ${i + 1}`);
    cards[card.id] = card;
  }

  return {
    profile: {
      username,
      level,
      rankPoints: (level - 1) * 100,
      gold: 200 + level * 50,
      maxSlots,
    },
    buildings: {
      mine: { level, lastHarvest: Timestamp.now() },
      barracks: { level },
      forge: { level },
      infirmary: { level },
      market: { level, dailyTradesLeft: 3 + level * 2 },
    },
    cards,
    user_active: true,
    session: { currentSession: null },
  };
}

async function main() {
  const username = process.argv[2] || "PlayerDev";
  const level = parseInt(process.argv[3], 10) || 1;

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);

  const userRef = doc(db, `users/${username}`);
  const userData = createUserData(username, level);
  await setDoc(userRef, userData);
  console.log(`Player ${username} (level ${level}) created.`);

  const adminRef = doc(db, "admin/configuration");
  const adminConf = {
    active_game: true,
    message: "Welcome Developer!",
  };
  await setDoc(adminRef, adminConf);
  console.log("Admin configuration created.");
}

main().catch((err) => {
  console.error("Bootstrap error:", err);
  process.exit(1);
});
