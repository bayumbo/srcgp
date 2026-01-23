/**
 * Restaura "usuarios" desde un databaseId origen hacia "(default)".
 *
 * Uso:
 *  node scripts/restaurar_usuarios_desde_clone.js
 *  node scripts/restaurar_usuarios_desde_clone.js --source=default-clone
 *  node scripts/restaurar_usuarios_desde_clone.js --source=srcgp1
 *  node scripts/restaurar_usuarios_desde_clone.js --dry --source=default-clone
 */

const admin = require("firebase-admin");
const path = require("path");
const { getFirestore } = require("firebase-admin/firestore");

const SERVICE_ACCOUNT_PATH = path.join(__dirname, "serviceAccount.json");

admin.initializeApp({
  credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH)),
});

const args = process.argv.slice(2);
const DRY = args.includes("--dry");

const sourceArg = args.find(a => a.startsWith("--source="));
const SOURCE_DB_ID = sourceArg ? sourceArg.split("=")[1] : "default-clone";

const TARGET_DB_ID = "(default)";
const COLLECTION_NAME = "usuarios";

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function run() {
  const sourceDb = getFirestore(admin.app(), SOURCE_DB_ID);
  const targetDb = getFirestore(admin.app(), TARGET_DB_ID);

  console.log("== Restaurar colección usuarios ==");
  console.log(`Fuente:  ${SOURCE_DB_ID}`);
  console.log(`Destino: ${TARGET_DB_ID}`);
  console.log(`DRY:     ${DRY}`);
  console.log("----------------------------------");

  const snap = await sourceDb.collection(COLLECTION_NAME).get();
  console.log(`Docs en fuente: ${snap.size}`);

  if (snap.empty) {
    console.log("⚠️ No hay documentos en la fuente. Revisa con el script de diagnóstico en qué DB están.");
    return;
  }

  const docs = snap.docs;
  const grupos = chunkArray(docs, 450);

  let total = 0;

  for (let i = 0; i < grupos.length; i++) {
    const batch = targetDb.batch();

    for (const d of grupos[i]) {
      const data = d.data();
      const ref = targetDb.collection(COLLECTION_NAME).doc(d.id);

      if (!DRY) batch.set(ref, data, { merge: true });
      total++;
    }

    if (!DRY) await batch.commit();
    console.log(`Batch ${i + 1}/${grupos.length} OK | acumulado: ${total}`);
  }

  console.log("----------------------------------");
  console.log(`✅ Restauración finalizada. Docs copiados/mergeados: ${total}`);
  if (DRY) console.log("⚠️ DRY activo: no se escribió nada.");
}

run()
  .then(() => process.exit(0))
  .catch(e => {
    console.error("❌ Error:", e);
    process.exit(1);
  });
