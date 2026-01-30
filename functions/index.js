
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
      throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesión");
    }

    const claims = context.auth.token || {};
    if (claims.role !== "admin") {
      throw new functions.https.HttpsError("permission-denied", "Solo admin");
    }

    const uid = String(data?.uid || "").trim();
    if (!uid) {
      throw new functions.https.HttpsError("invalid-argument", "uid requerido");
    }

    if (context.auth.uid === uid) {
      throw new functions.https.HttpsError("failed-precondition", "No puedes eliminar tu propio usuario desde aquí");
    }

    const db = admin.firestore();

    // 0) leer usuario privado para obtener cedula/email (para borrado blindado)
    const userRef = db.doc(`usuarios/${uid}`);
    const userSnap = await userRef.get();

    const cedula = userSnap.exists ? String(userSnap.data()?.cedula || "").trim() : "";
    const email  = userSnap.exists ? String(userSnap.data()?.email  || "").trim().toLowerCase() : "";

    functions.logger.info("[eliminarUsuarioAuth] uid:", uid, "cedula:", cedula, "email:", email);

    // 1) borrar usuarios/{uid}
    if (userSnap.exists) {
      await userRef.delete();
      functions.logger.info("[eliminarUsuarioAuth] usuarios/{uid} borrado:", uid);
    } else {
      functions.logger.info("[eliminarUsuarioAuth] usuarios/{uid} NO existía:", uid);
    }

    // 2) borrar usuariosPublicos/{uid}
    const pubRef = db.doc(`usuariosPublicos/${uid}`);
    const pubAntes = await pubRef.get();
    functions.logger.info("[eliminarUsuarioAuth] usuariosPublicos/{uid} antes existe?", pubAntes.exists);

    await pubRef.delete(); // delete() no falla si no existe
    const pubDespues = await pubRef.get();
    functions.logger.info("[eliminarUsuarioAuth] usuariosPublicos/{uid} después existe?", pubDespues.exists);

    // 3) BLINDAJE: borrar cualquier doc adicional en usuariosPublicos por cedula/email
    let borradosExtra = 0;

    if (cedula) {
      const qCedula = await db.collection("usuariosPublicos")
        .where("cedula", "==", cedula)
        .limit(50)
        .get();

      if (!qCedula.empty) {
        const batch = db.batch();
        qCedula.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        borradosExtra += qCedula.size;
        functions.logger.info("[eliminarUsuarioAuth] usuariosPublicos borrados por cedula:", qCedula.size);
      }
    }

    if (email) {
      const qEmail = await db.collection("usuariosPublicos")
        .where("email", "==", email)
        .limit(50)
        .get();

      if (!qEmail.empty) {
        const batch = db.batch();
        qEmail.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        borradosExtra += qEmail.size;
        functions.logger.info("[eliminarUsuarioAuth] usuariosPublicos borrados por email:", qEmail.size);
      }
    }

    // 4) desvincular unidades (uidPropietario)
    const unidadesSnap = await db.collection("unidades")
      .where("uidPropietario", "==", uid)
      .limit(500)
      .get();

    if (!unidadesSnap.empty) {
      const batch = db.batch();
      unidadesSnap.docs.forEach(d => batch.update(d.ref, {
        uidPropietario: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }));
      await batch.commit();
      functions.logger.info("[eliminarUsuarioAuth] unidades desvinculadas:", unidadesSnap.size);
    } else {
      functions.logger.info("[eliminarUsuarioAuth] unidades desvinculadas: 0");
    }

    // 5) borrar Auth
    try {
      await admin.auth().deleteUser(uid);
      functions.logger.info("[eliminarUsuarioAuth] Auth delete ok:", uid);
    } catch (err) {
      const code = String(err?.code || "");
      if (!code.includes("auth/user-not-found")) throw err;
      functions.logger.info("[eliminarUsuarioAuth] Auth user-not-found (ok):", uid);
    }

    return {
      ok: true,
      uid,
      usuariosPublicosAntes: pubAntes.exists,
      usuariosPublicosDespues: pubDespues.exists,
      borradosExtraUsuariosPublicos: borradosExtra
    };

  } catch (e) {
    functions.logger.error("eliminarUsuarioAuth ERROR:", e);
    if (e instanceof functions.https.HttpsError) throw e;
    throw new functions.https.HttpsError("internal", e?.message || "Error interno");
  }
});
