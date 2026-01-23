const admin = require("firebase-admin");
const path = require("path");
const { getFirestore } = require("firebase-admin/firestore");

const SERVICE_ACCOUNT_PATH = path.join(__dirname, "serviceAccount.json");

admin.initializeApp({
  credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH)),
});

async function contarDocs(dbId, coleccion) {
  const db = getFirestore(admin.app(), dbId); // dbId: "(default)", "default-clone", "srcgp1", etc.
  const snap = await db.collection(coleccion).limit(5).get();
  return { size: snap.size, ids: snap.docs.map(d => d.id) };
}

(async () => {
  const bases = ["(default)", "default-clone", "srcgp1"]; // agrega otras si las tienes
  const colecciones = ["usuarios", "unidades", "reportes_dia"];

  for (const dbId of bases) {
    console.log(`\n=== DB: ${dbId} ===`);
    for (const col of colecciones) {
      try {
        const r = await contarDocs(dbId, col);
        console.log(`- ${col}: sampleCount=${r.size} sampleIds=${JSON.stringify(r.ids)}`);
      } catch (e) {
        console.log(`- ${col}: ERROR -> ${e.message}`);
      }
    }
  }

  process.exit(0);
})().catch(e => {
  console.error("❌", e);
  process.exit(1);
});
