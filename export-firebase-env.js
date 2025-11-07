// export-firebase-env.js
import fs from "fs";
import path from "path";

const serviceAccountPath = path.join(process.cwd(), "serviceAccountKey.json");

if (!fs.existsSync(serviceAccountPath)) {
  console.error("❌ No se encontró serviceAccountKey.json en el proyecto");
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));

// Escapa los saltos de línea de la private_key
serviceAccount.private_key = serviceAccount.private_key.replace(/\n/g, "\\n");

// Convierte todo a una sola línea
const jsonForRender = JSON.stringify(serviceAccount);

console.log("✅ Copia este JSON en tu variable de entorno FIREBASE_SERVICE_ACCOUNT_KEY en Render:");
console.log(jsonForRender);
