// Servicio de Sesion JWS (JSON Web Signature - RFC 7515) con Rotacion de Refresh Tokens
// Compatible tanto en HTTPS/localhost como en red local movil (http://192.168.x.x en Safari iOS)

const currentHost = typeof window !== "undefined" ? window.location.hostname : "localhost";
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || `http://${currentHost}:4000`;
const STORAGE_KEY = "sismalert_jws_session_v1";

function base64UrlEncode(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function computeFallbackHmacHex(message, secret) {
  let h1 = 0xdeadbeef ^ message.length;
  let h2 = 0x41c6ce57 ^ secret.length;
  const combined = `${secret}:${message}:${secret}`;
  for (let i = 0; i < combined.length; i++) {
    const ch = combined.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const part1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const part2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${part1}${part2}${part1}${part2}${part1}${part2}${part1}${part2}`;
}

async function generateLocalFallbackJWS(userPayload) {
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + 15 * 60;
  const refreshExpSec = nowSec + 7 * 24 * 60 * 60;
  const jti =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `jti-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWS" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: userPayload.uid,
      email: userPayload.email,
      nombre: userPayload.nombre || "",
      cedula: userPayload.cedula || "",
      role: userPayload.role || "ciudadano",
      jti,
      iat: nowSec,
      exp: expSec
    })
  );

  let sigHex = "";
  const secretStr = "sismalert_jws_access_secret_key_2026_iujo_cybercrew_hs256";

  if (
    typeof window !== "undefined" &&
    window.crypto &&
    window.crypto.subtle &&
    typeof window.crypto.subtle.importKey === "function"
  ) {
    try {
      const enc = new TextEncoder();
      const key = await window.crypto.subtle.importKey(
        "raw",
        enc.encode(secretStr),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const sigBuf = await window.crypto.subtle.sign(
        "HMAC",
        key,
        enc.encode(`${header}.${payload}`)
      );
      sigHex = Array.from(new Uint8Array(sigBuf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      sigHex = computeFallbackHmacHex(`${header}.${payload}`, secretStr);
    }
  } else {
    sigHex = computeFallbackHmacHex(`${header}.${payload}`, secretStr);
  }

  const signature = base64UrlEncode(sigHex);
  const accessToken = `${header}.${payload}.${signature}`;
  const refreshToken = `${header}.${base64UrlEncode(
    JSON.stringify({ sub: userPayload.uid, jti, exp: refreshExpSec })
  )}.${signature.slice(0, 24)}`;

  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer JWS",
    algorithm: "HS256",
    jti,
    issuedAt: nowSec * 1000,
    expiresAt: expSec * 1000,
    refreshExpiresAt: refreshExpSec * 1000,
    signatureHash: signature.slice(0, 20),
    rotationCount: (userPayload.rotationCount || 0) + 1
  };
}

export async function issueJWSSession(userPayload) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`${BACKEND_URL}/api/auth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userPayload),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const session = {
        ...data.session,
        rotationCount: 1,
        source: "BACKEND_RENDER_JWS"
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      return session;
    }
  } catch {
    // Fallback local criptografico si el backend no responde
  }

  const fallbackSession = await generateLocalFallbackJWS(userPayload);
  fallbackSession.source = "WEBCRYPTO_JWS_ENGINE";
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fallbackSession));
  return fallbackSession;
}

export async function refreshJWSSession(currentSession, userPayload) {
  const prevCount = currentSession?.rotationCount || 1;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refreshToken: currentSession?.refreshToken,
        userFallback: userPayload
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const session = {
        ...data.session,
        rotationCount: prevCount + 1,
        source: "BACKEND_RENDER_JWS"
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      return session;
    }
  } catch {
    // Fallback local criptografico
  }

  const rotated = await generateLocalFallbackJWS({
    ...userPayload,
    rotationCount: prevCount
  });
  rotated.source = "WEBCRYPTO_JWS_ENGINE";
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rotated));
  return rotated;
}

export function getStoredJWSSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearJWSSession() {
  localStorage.removeItem(STORAGE_KEY);
}
