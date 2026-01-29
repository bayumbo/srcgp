
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
    // --- Auth & claims
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesión");
    }

    const role = context.auth.token?.role || null;
    if (role !== "admin") {
      throw new functions.https.HttpsError("permission-denied", "Solo admin");
    }

    const uid = String(data?.uid || "").trim();
    if (!uid) {
      throw new functions.https.HttpsError("invalid-argument", "uid requerido");
    }

    if (context.auth.uid === uid) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "No puedes eliminar tu propio usuario desde aquí"
      );
    }

    const db = admin.firestore();

    // --- (0) Logs de entorno para confirmar proyecto
    console.log("[eliminarUsuarioAuth] projectId:", process.env.GCLOUD_PROJECT, "targetUid:", uid);

    // --- (1) Firestore: borrar usuario principal
    const userRef = db.doc(`usuarios/${uid}`);
    const userSnap = await userRef.get();
    console.log("[eliminarUsuarioAuth] usuarios/{uid} existe antes?", userSnap.exists);

    await userRef.delete().catch((e) => {
      // No tragamos el error silenciosamente si existe y no se puede borrar
      console.error("[eliminarUsuarioAuth] ERROR borrando usuarios/{uid}:", e);
      throw e;
    });

    const userAfter = await userRef.get();
    console.log("[eliminarUsuarioAuth] usuarios/{uid} existe después?", userAfter.exists);

    // --- (2) Limpieza histórica opcional: usuariosPublicos/{uid}
    // Ya no lo usas, pero si quedó basura de versiones anteriores, lo limpia.
    const pubRef = db.doc(`usuariosPublicos/${uid}`);
    const pubSnap = await pubRef.get();
    console.log("[eliminarUsuarioAuth] usuariosPublicos/{uid} existe antes?", pubSnap.exists);

    if (pubSnap.exists) {
      await pubRef.delete().catch((e) => {
        console.error("[eliminarUsuarioAuth] ERROR borrando usuariosPublicos/{uid}:", e);
        // No lo hacemos fatal si ya no usas esta colección,
        // pero lo dejamos logueado para que lo veas.
      });
    }

    const pubAfter = await pubRef.get();
    console.log("[eliminarUsuarioAuth] usuariosPublicos/{uid} existe después?", pubAfter.exists);

    // --- (3) Desvincular unidades (NO borrar histórico)
    const desvinculadas = await desvincularUnidadesPorPropietario(db, uid);
    console.log("[eliminarUsuarioAuth] unidades desvinculadas:", desvinculadas);

    // --- (4) Auth: borrar usuario
    try {
      await admin.auth().deleteUser(uid);
      console.log("[eliminarUsuarioAuth] Auth delete ok:", uid);
    } catch (err) {
      const code = String(err?.code || "");
      if (code.includes("auth/user-not-found")) {
        console.log("[eliminarUsuarioAuth] Auth user-not-found (ok):", uid);
      } else {
        console.error("[eliminarUsuarioAuth] ERROR borrando Auth:", err);
        throw err;
      }
    }

    return {
      ok: true,
      uid,
      usuariosDocEliminado: !userAfter.exists,
      usuariosPublicosEliminado: !pubAfter.exists,
      unidadesDesvinculadas: desvinculadas
    };
  } catch (e) {
    console.error("eliminarUsuarioAuth ERROR:", e);
    if (e instanceof functions.https.HttpsError) throw e;
    throw new functions.https.HttpsError("internal", e?.message || "Error interno");
  }
});

// =====================
// Helpers
// =====================

/**
 * Desvincula unidades donde uidPropietario == uid.
 * No borra docs de unidades, solo quita el propietario para conservar histórico.
 * Maneja lotes grandes con paginación.
 */
async function desvincularUnidadesPorPropietario(db, uid) {
  let total = 0;
  let lastDoc = null;

  while (true) {
    let q = db.collection("unidades").where("uidPropietario", "==", uid).limit(450);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((d) => {
      batch.update(d.ref, {
        uidPropietario: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    await batch.commit();

    total += snap.size;
    lastDoc = snap.docs[snap.docs.length - 1];

    // Si vino menos del límite, ya terminó
    if (snap.size < 450) break;
  }

  return total;
}
