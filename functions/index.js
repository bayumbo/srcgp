
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
exports.asignarRolDesdeFirestore = functions.https.onCall(async (data, context) => {
  const uid = data.uid;

  // 1️⃣ Seguridad: solo administradores pueden ejecutar esto
  const callerRole = context.auth?.token?.role;
  if (!context.auth || callerRole !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Solo administradores pueden asignar roles.');
  }

  try {
    // 2️⃣ Leer el documento del usuario
    const userDocRef = admin.firestore().doc(`usuarios/${uid}`);
    const userDocSnap = await userDocRef.get();

    if (!userDocSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'El usuario no existe en Firestore.');
    }

    const userData = userDocSnap.data();
    const nuevoRol = userData.rol;

    if (!nuevoRol) {
      throw new functions.https.HttpsError('invalid-argument', 'No se encontró el campo "rol" en el documento.');
    }

    // 3️⃣ Asignar el custom claim
    await admin.auth().setCustomUserClaims(uid, { role: nuevoRol });

    return { success: true, mensaje: `Rol '${nuevoRol}' asignado al usuario ${uid}.` };
  } catch (error) {
    console.error('❌ Error al asignar rol:', error);
    throw new functions.https.HttpsError('unknown', 'Error al asignar rol desde Firestore.', error);
  }
});

exports.eliminarUsuarioAuth = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Solo administradores pueden eliminar usuarios.');
  }
  const uid = data.uid;
  await admin.auth().deleteUser(uid);
  await admin.firestore().doc(`usuarios/${uid}`).delete();
  return { success: true };
});