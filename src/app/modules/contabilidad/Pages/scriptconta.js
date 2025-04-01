

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA3CLcsQvDjlfaUYDxI1AFvXBXX19Oz-d4",
  authDomain: "srcgp1.firebaseapp.com",
  projectId: "srcgp1",
  storageBucket: "srcgp1.firebasestorage.app",
  messagingSenderId: "204537824818",
  appId: "1:204537824818:web:edbbae5d1fbd4475111e2b",
  measurementId: "G-FJKKGGP89L"
  
};



/* NO TOCAR, AQUI CONFIGURACION BASICA DEL MENU -🔥📌*/

document.addEventListener("DOMContentLoaded", function () {
    let librosContables = document.getElementById("libros-contables");
    let submenu = document.getElementById("submenu-libros");

    librosContables.addEventListener("click", function (event) {
        event.preventDefault(); // Evita que el enlace recargue la página
        submenu.style.display = (submenu.style.display === "block") ? "none" : "block";
    });

    // Cierra el submenú si se hace clic fuera
    document.addEventListener("click", function (event) {
        if (!librosContables.contains(event.target) && !submenu.contains(event.target)) {
            submenu.style.display = "none";
        }
    });
});

//PANTALLA DE CARGA

(function($) {
	"use strict"

	///////////////////////////
	// Preloader
	$(window).on('load', function() {
		$("#preloader").delay(600).fadeOut();
	});
})(jQuery);


/*NO TOCAR, HASTA AQUI CONFIGURACION BASICA DEL MENU 🔥📌*////////



let contador = 1;
const tbody = document.querySelector("#tablaEgresos tbody");
const totalDebeEl = document.getElementById("totalDebe");
const totalHaberEl = document.getElementById("totalHaber");

document.getElementById("egresoForm").addEventListener("submit", function(e) {
  e.preventDefault();

  // Guardar valores globalmente
  window.beneficiarioGlobal = document.getElementById("beneficiario").value;
  window.cedulaGlobal = document.getElementById("cedula").value;

  const codigo = document.getElementById("codigo").value;
  const fecha = document.getElementById("fecha").value;
  const descripcion = document.getElementById("descripcion").value;
  const tipo = document.getElementById("tipo").value;
  const monto = parseFloat(document.getElementById("monto").value);

  if (!codigo || !fecha || !descripcion || isNaN(monto)) return;

  const fila = document.createElement("tr");
  fila.innerHTML = `
    <td>${contador++}</td>
    <td>${codigo}</td>
    <td>${fecha}</td>
    <td>${descripcion}</td>
    <td>${tipo === "Debe" ? monto.toFixed(2) : "-"}</td>
    <td>${tipo === "Haber" ? monto.toFixed(2) : "-"}</td>
    <td><button onclick="eliminarFila(this)">Eliminar</button></td>
  `;

  fila.dataset.tipo = tipo;
  fila.dataset.monto = monto;

  tbody.appendChild(fila);
  actualizarTotales();
  document.getElementById("egresoForm").reset();
});

  
function eliminarFila(btn) {
  btn.closest("tr").remove();
  actualizarTotales();
}

function actualizarTotales() {
  let totalDebe = 0;
  let totalHaber = 0;

  tbody.querySelectorAll("tr").forEach(tr => {
    const tipo = tr.dataset.tipo;
    const monto = parseFloat(tr.dataset.monto);
    if (tipo === "Debe") totalDebe += monto;
    else totalHaber += monto;
  });

  totalDebeEl.textContent = totalDebe.toFixed(2);
  totalHaberEl.textContent = totalHaber.toFixed(2);
}

async function generarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");

  const comprobanteId = "CE-" + String(Date.now()).slice(-6);
  const fecha = new Date().toLocaleDateString();
  const beneficiario = window.beneficiarioGlobal || "__________";
  const cedula = window.cedulaGlobal || "__________";

  let totalDebe = 0;
  let totalHaber = 0;
  let y = 15;

  const transacciones = [];
  document.querySelectorAll("#tablaEgresos tbody tr").forEach(tr => {
    const descripcion = tr.querySelectorAll("td")[3].textContent;
    const debe = tr.querySelectorAll("td")[4].textContent;
    const haber = tr.querySelectorAll("td")[5].textContent;

    const debeNum = debe !== "-" ? parseFloat(debe) : 0;
    const haberNum = haber !== "-" ? parseFloat(haber) : 0;

    transacciones.push({ descripcion, debe: debeNum, haber: haberNum });
    totalDebe += debeNum;
    totalHaber += haberNum;
  });

  // ==== DISEÑO PDF ====
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("CONSORCIO PINTAG EXPRESS", 105, y, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  y += 6;
  doc.text("PINTAG, ANTISANA S2-138", 105, y, { align: "center" });
  y += 5;
  doc.text("consorciopintagexpress@hotmail.com", 105, y, { align: "center" });

  y += 10;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("COMPROBANTE DE EGRESO", 15, y);
  doc.text(`No. ${comprobanteId}`, 160, y);

  y += 8;
  doc.setDrawColor(0);
  doc.rect(15, y, 180, 18);
  doc.setFontSize(10);
  doc.text(`Fecha: ${fecha}`, 20, y + 6);
  doc.text(`PAGADO A: ${beneficiario}`, 20, y + 12);
  doc.text(`CÉDULA / RUC: ${cedula}`, 110, y + 12);

  y += 25;
  doc.setFont("helvetica", "bold");
  doc.setFillColor(240);
  doc.rect(15, y, 110, 8, 'F');
  doc.rect(125, y, 35, 8, 'F');
  doc.rect(160, y, 35, 8, 'F');
  doc.text("Descripción", 17, y + 6);
  doc.text("Debe", 135, y + 6);
  doc.text("Haber", 170, y + 6);
  y += 13;

  transacciones.forEach(item => {
    doc.setFont("helvetica", "normal");
    doc.text(item.descripcion, 17, y);
    doc.text(item.debe ? `$${item.debe.toFixed(2)}` : "-", 135, y);
    doc.text(item.haber ? `$${item.haber.toFixed(2)}` : "-", 170, y);
    y += 8;
  });

  doc.setFont("helvetica", "bold");
  y += 5;
  doc.text(`TOTAL DEBE: $${totalDebe.toFixed(2)}`, 125, y);
  y += 6;
  doc.text(`TOTAL HABER: $${totalHaber.toFixed(2)}`, 125, y);

  // Firma y cuadro de aprobación
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.text("Firma de recibido:", 15, y);
  doc.line(45, y, 110, y);
  y += 8;
  doc.text("C.I / RUC:", 15, y);
  doc.line(35, y, 90, y);
  y += 12;

  const firmaY = y;
  doc.setFillColor(179, 179, 179);
  doc.rect(15, firmaY, 60, 8, 'F');
  doc.rect(75, firmaY, 60, 8, 'F');
  doc.rect(135, firmaY, 60, 8, 'F');
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.text("APROBADO", 45, firmaY + 6, { align: "center" });
  doc.text("CONTABILIZADO", 105, firmaY + 6, { align: "center" });
  doc.text("REVISADO", 165, firmaY + 6, { align: "center" });

  doc.setFillColor(238, 238, 238);
  doc.setDrawColor(200);
  doc.rect(15, firmaY + 8, 60, 22, 'F');
  doc.rect(75, firmaY + 8, 60, 22, 'F');
  doc.rect(135, firmaY + 8, 60, 22, 'F');
  doc.setTextColor(0);

  // === CONVERTIR Y SUBIR PDF ===
  const pdfBlob = doc.output("blob");
  const { db, storage, ref, uploadBytes, getDownloadURL, collection, addDoc, serverTimestamp } = window.firebaseModules;

  try {
    const pdfRef = ref(storage, `comprobantes/${comprobanteId}.pdf`);
  
    // 🟡 Subimos el archivo al Storage
    await uploadBytes(pdfRef, pdfBlob);
  
    // 🔁 Esperamos medio segundo antes de solicitar la URL (opcional pero útil en algunos casos)
    await new Promise(resolve => setTimeout(resolve, 500));
  
    // 🟢 Obtenemos la URL pública de descarga
    const pdfURL = await getDownloadURL(pdfRef);
    console.log("✅ URL del PDF:", pdfURL); // <-- Agrega este log para probar
    
    console.log("Intentando guardar en Firestore...");
    console.log("Módulos de Firebase:", window.firebaseModules);
    
    // 🟣 Guardamos en Firestore
    await addDoc(collection(db, "comprobantes"), {
      comprobanteId,
      fecha,
      beneficiario,
      cedula,
      totalDebe,
      totalHaber,
      transacciones,
      pdfURL,
      creado: serverTimestamp()
    });
  
    alert("✅ Comprobante y PDF guardados exitosamente.");
    doc.save(`${comprobanteId}.pdf`);
  } catch (error) {
    console.error("🔥 Error al guardar comprobante:", error);
    alert("❌ Error al guardar comprobante.");
    doc.save(`${comprobanteId}.pdf`);
  }

}

window.generarPDF = generarPDF;

  