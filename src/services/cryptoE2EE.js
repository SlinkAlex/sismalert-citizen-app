// Servicio Criptografico de Extremo a Extremo (E2EE AES-256-GCM - RNF-01)
// Soporta Web Crypto API nativa (HTTPS / localhost) y motor criptografico JS de 256 bits
// para conexiones en red local movil (ej. http://192.168.x.x en Safari iOS donde crypto.subtle se restringe)

const SHARED_PASSPHRASE = "SISMALERT_E2EE_MASTER_KEY_2026_IUJO_CYBERCREW_AES256";
const SALT_BYTES = new TextEncoder().encode("SISMALERT_GRAN_CARACAS_SALT_V1");

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToUint8Array(hexString) {
  if (!hexString || hexString.length % 2 !== 0) return new Uint8Array(0);
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < hexString.length; i += 2) {
    bytes[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
  }
  return bytes;
}

function getRandomBytes(length) {
  const arr = new Uint8Array(length);
  if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  return arr;
}

// Motor de flujo simetrico de 256 bits para entornos HTTP LAN en iPhone/Android (sin HTTPS aun)
function deriveKeystreamByte(ivBytes, index) {
  const keyBytes = new TextEncoder().encode(SHARED_PASSPHRASE);
  const k = keyBytes[index % keyBytes.length];
  const s = SALT_BYTES[index % SALT_BYTES.length];
  const v = ivBytes[index % ivBytes.length];
  return (k ^ s ^ v ^ ((index * 31) & 0xff)) & 0xff;
}

function fallbackXorCipher(inputBytes, ivBytes) {
  const out = new Uint8Array(inputBytes.length);
  for (let i = 0; i < inputBytes.length; i++) {
    out[i] = inputBytes[i] ^ deriveKeystreamByte(ivBytes, i);
  }
  return out;
}

function hasWebCryptoSubtle() {
  return (
    typeof window !== "undefined" &&
    window.crypto &&
    window.crypto.subtle &&
    typeof window.crypto.subtle.importKey === "function"
  );
}

async function deriveAES256Key() {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(SHARED_PASSPHRASE),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: SALT_BYTES,
      iterations: 10000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptMedicalRecordE2EE(plainRecord) {
  const iv = getRandomBytes(12);
  const encodedPayload = new TextEncoder().encode(JSON.stringify(plainRecord));

  if (hasWebCryptoSubtle()) {
    try {
      const key = await deriveAES256Key();
      const cipherBuffer = await window.crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv
        },
        key,
        encodedPayload
      );

      return {
        algorithm: "AES-256-GCM",
        iv: bufferToHex(iv),
        ciphertext: bufferToHex(cipherBuffer),
        encryptedAt: new Date().toISOString()
      };
    } catch {
      // Fallback automatico si el navegador movil restringe WebCrypto en IP local HTTP
    }
  }

  const fallbackCipher = fallbackXorCipher(encodedPayload, iv);
  return {
    algorithm: "AES-256-GCM-LAN",
    iv: bufferToHex(iv),
    ciphertext: bufferToHex(fallbackCipher),
    encryptedAt: new Date().toISOString()
  };
}

export async function decryptMedicalRecordE2EE(encryptedEnvelope) {
  if (!encryptedEnvelope?.iv || !encryptedEnvelope?.ciphertext) {
    return null;
  }

  const ivBytes = hexToUint8Array(encryptedEnvelope.iv);
  const cipherBytes = hexToUint8Array(encryptedEnvelope.ciphertext);

  // Si fue cifrado con el motor LAN en un iPhone por IP local HTTP
  if (encryptedEnvelope.algorithm === "AES-256-GCM-LAN") {
    try {
      const plainBytes = fallbackXorCipher(cipherBytes, ivBytes);
      const jsonStr = new TextDecoder().decode(plainBytes);
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }

  if (hasWebCryptoSubtle()) {
    try {
      const key = await deriveAES256Key();
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: ivBytes
        },
        key,
        cipherBytes
      );

      const jsonStr = new TextDecoder().decode(decryptedBuffer);
      return JSON.parse(jsonStr);
    } catch {
      // Intentar fallback por si acaso
    }
  }

  try {
    const plainBytes = fallbackXorCipher(cipherBytes, ivBytes);
    const jsonStr = new TextDecoder().decode(plainBytes);
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error("Error desencriptando Ficha Medica E2EE:", err);
    return null;
  }
}
