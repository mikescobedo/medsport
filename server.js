// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";
import fs from "fs";
import path from "path";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// 🔹 Inicializa Firebase detectando variable de entorno o archivo local
let serviceAccount;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    // Usar variable de entorno en Render o prod
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    }
    console.log("✅ Firebase inicializado desde variable de entorno");
  } else {
    // Usar archivo local serviceAccountKey.json en desarrollo local
    const serviceAccountPath = path.join(process.cwd(), "serviceAccountKey.json");
    if (!fs.existsSync(serviceAccountPath)) {
      throw new Error("No se encontró serviceAccountKey.json ni variable de entorno FIREBASE_SERVICE_ACCOUNT_KEY");
    }
    serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));
    console.log("✅ Firebase inicializado desde archivo local serviceAccountKey.json");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

} catch (err) {
  console.error("❌ ERROR inicializando Firebase:", err);
  process.exit(1);
}

const db = admin.firestore();

// ==================================================
// 🔹 Endpoint de prueba
// ==================================================
app.get("/", (req, res) => res.send("Servidor de notificaciones corriendo correctamente"));

// ==================================================
// 🔹 Enviar notificación inmediata
// ==================================================
app.post("/send", async (req, res) => {
  try {
    const { token, title, body, data } = req.body;

    const message = {
      notification: { title, body },
      token,
      data: data || {},
      webpush: {
        fcmOptions: { link: data?.link || "/" },
        notification: {
          actions: [
            { action: "confirmar", title: "✅ Confirmar" },
            { action: "cancelar", title: "❌ Cancelar" },
          ],
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log("✅ Notificación enviada:", response);
    res.json({ success: true, response });
  } catch (error) {
    console.error("❌ Error enviando notificación:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================================================
// 🔹 Programar recordatorio 30 min antes de la cita
// ==================================================
app.post("/programar-recordatorio", async (req, res) => {
  try {
    const { citaId, userToken, fechaHora, userId, medicoId } = req.body;

    const fechaCita = new Date(fechaHora);
    const ahora = new Date();
    const milisegundosAntes = fechaCita.getTime() - 30 * 60 * 1000;
    const delay = milisegundosAntes - ahora.getTime();

    if (delay <= 0) {
      return res.status(400).json({ error: "La cita ya está demasiado cerca o ya pasó." });
    }

    console.log(`⏰ Recordatorio programado para ${new Date(milisegundosAntes).toLocaleString()}`);

    setTimeout(async () => {
      try {
        const message = {
          notification: {
            title: "Recordatorio de tu cita 🩺",
            body: "Tu cita comienza en 30 minutos. ¿Deseas confirmarla?",
          },
          token: userToken,
          webpush: {
            notification: {
              actions: [
                { action: "confirmar", title: "✅ Confirmar" },
                { action: "cancelar", title: "❌ Cancelar" },
              ],
            },
          },
          data: { citaId, userId, medicoId },
        };

        await admin.messaging().send(message);
        console.log("📩 Recordatorio enviado al usuario:", userId);
      } catch (e) {
        console.error("❌ Error enviando recordatorio:", e);
      }
    }, delay);

    res.json({ success: true, msg: "Recordatorio programado correctamente." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================================================
// 🔹 Endpoint para recibir respuesta del usuario
// ==================================================
app.post("/respuesta-cita", async (req, res) => {
  try {
    const { citaId, userId, medicoId, respuesta } = req.body;

    await db.collection("respuestas_citas").doc(citaId).set({
      userId,
      medicoId,
      respuesta,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    const medicoDoc = await db.collection("medicos").doc(medicoId).get();
    const medicoToken = medicoDoc.data()?.token;

    if (medicoToken) {
      await admin.messaging().send({
        notification: {
          title: `Cita ${respuesta === "confirmar" ? "confirmada ✅" : "cancelada ❌"}`,
          body: `El paciente ha ${respuesta === "confirmar" ? "confirmado" : "cancelado"} su cita.`,
        },
        token: medicoToken,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("❌ Error procesando respuesta:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================================================
// 🔹 Inicio del servidor
// ==================================================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
