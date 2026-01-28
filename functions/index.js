
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
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión');
    }

    const claims = context.auth.token || {};
    if (claims.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Solo admin');
    }

    const uid = data.uid;
    if (!uid) {
      throw new functions.https.HttpsError('invalid-argument', 'uid requerido');
    }

    // 1) Borrar Firestore usuario (y lo que corresponda en tu modelo actual)
    await admin.firestore().doc(`usuarios/${uid}`).delete();

    // 2) Borrar Auth
    await admin.auth().deleteUser(uid);

    return { ok: true };
  } catch (e) {
    console.error('eliminarUsuarioAuth ERROR:', e);
    if (e instanceof functions.https.HttpsError) throw e;
    throw new functions.https.HttpsError('internal', e?.message || 'Error interno');
  }
});
