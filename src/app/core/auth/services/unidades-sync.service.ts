import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
  DocumentData,
} from '@angular/fire/firestore';

type Empresa = 'General Pintag' | 'Expreso Antisana' | 'Administración';

@Injectable({ providedIn: 'root' })
export class UnidadesSyncService {
  constructor(private firestore: Firestore) {}

  private empresaSlug(empresa: string): string {
    return empresa.replace(/\s+/g, '');
  }

  private extraerNumeroOrden(codigo: string): number {
    // Ej: "P03" => 3, "03" => 3, "P3" => 3
    const match = (codigo ?? '').match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  }

  private normalizarCodigoUnidad(raw: any): string {
    // En su data actual, el doc de subcolección tiene: { nombre: "P03" }
    const codigo = String(raw?.nombre ?? raw?.codigo ?? '').trim();
    return codigo;
  }

  async sincronizarUnidadesGlobales(): Promise<{ creadas: number; omitidas: number; usuariosProcesados: number }> {
    let creadas = 0;
    let omitidas = 0;
    let usuariosProcesados = 0;

    // 1) Tomamos usuarios de Pintag y Antisana.
    // Nota: Firestore permite 'in', pero puede requerir índice si combina con otros filtros.
    // Para evitar problemas, hacemos 2 queries separadas.
    const usuariosRef = collection(this.firestore, 'usuarios');

    const empresasPermitidas: Empresa[] = ['General Pintag', 'Expreso Antisana'];

    // Acumulador de escrituras (batch)
    let batch = writeBatch(this.firestore);
    let ops = 0;

    const commitBatch = async () => {
      if (ops > 0) {
        await batch.commit();
        batch = writeBatch(this.firestore);
        ops = 0;
      }
    };

    for (const empresa of empresasPermitidas) {
      // Si desea excluir usuarios inactivos, mantenga where('estado','==',true).
      // Si algunos usuarios no tienen estado, lo ideal es no filtrar aquí y validar en código.
      const q = query(usuariosRef, where('empresa', '==', empresa));
      const snapUsuarios = await getDocs(q);

      for (const u of snapUsuarios.docs) {
        usuariosProcesados++;

        const userData = u.data() as DocumentData;
        const estado = userData['estado'];
        if (estado === false) {
          // si quiere omitir inactivos
          omitidas++;
          continue;
        }

        const nombres = String(userData['nombres'] ?? '').trim();
        const apellidos = String(userData['apellidos'] ?? '').trim();
        const propietarioNombre = `${nombres} ${apellidos}`.trim();

        const uid = u.id;

        // 2) leer subcolección unidades del usuario
        const subUnidadesRef = collection(this.firestore, `usuarios/${uid}/unidades`);
        const snapUnidades = await getDocs(subUnidadesRef);

        if (snapUnidades.empty) {
          omitidas++;
          continue;
        }

        for (const unDoc of snapUnidades.docs) {
          const unidadData = unDoc.data();
          const codigo = this.normalizarCodigoUnidad(unidadData);

          if (!codigo) {
            omitidas++;
            continue;
          }

          const empresaSlug = this.empresaSlug(empresa);
          const unidadId = `${empresaSlug}_${codigo}`;

          const numeroOrden = this.extraerNumeroOrden(codigo);

          const globalRef = doc(this.firestore, `unidades/${unidadId}`);

          batch.set(
            globalRef,
            {
              codigo,
              numeroOrden,
              empresa,
              uidPropietario: uid,
              propietarioNombre: propietarioNombre || null,
              estado: true,
              updatedAt: serverTimestamp(),
              // createdAt solo si el doc no existe; como usamos merge,
              // lo dejamos igual, o lo seteamos también y no pasa nada.
              createdAt: serverTimestamp(),
            },
            { merge: true }
          );

          creadas++;
          ops++;

          // Firestore recomienda no exceder ~500 operaciones por batch.
          // Usamos 400 como margen.
          if (ops >= 400) {
            await commitBatch();
          }
        }
      }
    }

    await commitBatch();

    return { creadas, omitidas, usuariosProcesados };
  }
}
