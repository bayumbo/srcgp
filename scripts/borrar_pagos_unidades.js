/**
 * ⚠️ BORRA TODOS LOS PAGOS DE TODAS LAS UNIDADES
 * Ruta: unidades/{unidadId}/pagos/{pagoId}
 * USAR SOLO EN ENTORNO DE PRUEBAS
 */

const admin = require('firebase-admin');

// Usa credenciales por defecto (firebase login / GOOGLE_APPLICATION_CREDENTIALS)
const serviceAccount = require('./serviceAccount.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function borrarPagosDeTodasLasUnidades() {
  console.log('🔎 Buscando unidades...');
  const unidadesSnap = await db.collection('unidades').get();

  let totalUnidades = 0;
  let totalPagos = 0;

  for (const unidadDoc of unidadesSnap.docs) {
    totalUnidades++;
    const unidadId = unidadDoc.id;

    const pagosRef = db.collection(`unidades/${unidadId}/pagos`);
    const pagosSnap = await pagosRef.get();

    if (pagosSnap.empty) continue;

    console.log(`🧹 Unidad ${unidadId}: ${pagosSnap.size} pagos`);

    for (const pagoDoc of pagosSnap.docs) {
      await pagoDoc.ref.delete();
      totalPagos++;
    }
  }

  console.log('==============================');
  console.log('✅ Limpieza finalizada');
  console.log('Unidades revisadas:', totalUnidades);
  console.log('Pagos eliminados:', totalPagos);
  console.log('==============================');
}

borrarPagosDeTodasLasUnidades()
  .then(() => {
    console.log('🎯 Script completado correctamente');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error al borrar pagos:', err);
    process.exit(1);
  });
