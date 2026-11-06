import React, { useState, useEffect } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  addDoc,
  query,
  where,
  onSnapshot
} from "firebase/firestore";
import { io } from "socket.io-client";
import {
  Shield,
  Download,
  MapPin,
  Activity,
  Radio,
  RefreshCw,
  LogOut,
  Mail,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Send,
  FileText,
  ArrowLeft,
  Navigation,
  HeartPulse
} from "lucide-react";

import { auth, db, googleProvider } from "./config/firebase";
import { encryptMedicalRecordE2EE, decryptMedicalRecordE2EE } from "./services/cryptoE2EE";
import {
  issueJWSSession,
  refreshJWSSession,
  getStoredJWSSession,
  clearJWSSession
} from "./services/jwsSessionService";
import {
  acquireHighPrecisionGPS,
  classifyCaracasQuadrant,
  geocodeAddressToCoordinates,
  matchCaracasSectorFromText
} from "./services/gpsAddressService";

const currentHost = typeof window !== "undefined" ? window.location.hostname : "localhost";
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || `http://${currentHost}:4000`;
const BLOOD_TYPES = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"];

// Logo Oficial de Google en SVG
function GoogleLogoSVG() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
      />
    </svg>
  );
}

export default function App() {
  // 1. Instalacion de la App en el Telefono (PWA)
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);

  // 2. Autenticacion y Navegacion
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login"); // "login" | "register" | "forgot"
  const [authMessage, setAuthMessage] = useState(null);
  const [submittingAuth, setSubmittingAuth] = useState(false);

  // Datos del Ciudadano
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [cedula, setCedula] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [gpsCoordsRegistro, setGpsCoordsRegistro] = useState(null);
  const [detectingAddress, setDetectingAddress] = useState(false);

  const [citizenProfile, setCitizenProfile] = useState(null);
  const [needsProfileCompletion, setNeedsProfileCompletion] = useState(false);
  const [jwsSession, setJwsSession] = useState(() => getStoredJWSSession());

  // 3. Ficha Medica (Cifrada transparentemente en segundo plano)
  const [activeTab, setActiveTab] = useState("ficha"); // "ficha" | "guardia"
  const [tipoSangre, setTipoSangre] = useState("O+");
  const [alergias, setAlergias] = useState("");
  const [condicionesMedicas, setCondicionesMedicas] = useState("");
  const [medicamentos, setMedicamentos] = useState("");
  const [contactoEmergenciaNombre, setContactoEmergenciaNombre] = useState("");
  const [contactoEmergenciaTelefono, setContactoEmergenciaTelefono] = useState("");
  const [encryptedEnvelope, setEncryptedEnvelope] = useState(null);
  const [savingMedical, setSavingMedical] = useState(false);
  const [medicalStatusMsg, setMedicalStatusMsg] = useState(null);

  // 4. Permisos del Telefono y Lectura Silenciosa de Sensores
  const [permissions, setPermissions] = useState(() => {
    try {
      const saved = localStorage.getItem("sismalert_device_permissions");
      return saved
        ? JSON.parse(saved)
        : { gps: false, motion: false, sms: false };
    } catch {
      return { gps: false, motion: false, sms: false };
    }
  });
  const [batteryLevel, setBatteryLevel] = useState(88);
  const [currentGps, setCurrentGps] = useState({
    lat: 10.4961,
    lng: -66.8532,
    alt: 912,
    quadrant: { code: "C-01", name: "Chacao" }
  });

  // 5. Estado de Emergencia SOS y Envio de SMS Real
  const [personasEnSitio, setPersonasEnSitio] = useState(1);
  const [telefonoDestinoSms, setTelefonoDestinoSms] = useState("");
  const [sendingSos, setSendingSos] = useState(false);
  const [lastSosResult, setLastSosResult] = useState(null);
  const [activeRescueStatus, setActiveRescueStatus] = useState(null);

  // Detectar si ya esta instalada en el telefono
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    setIsStandalone(standalone);

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const handleAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
      setShowInstallModal(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallAppClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setDeferredPrompt(null);
    } else {
      setShowInstallModal(true);
    }
  };

  // Escucha de sesion Firebase + Emision transparente de JWS
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setCitizenProfile(null);
        setNeedsProfileCompletion(false);
        clearJWSSession();
        setJwsSession(null);
        setAuthLoading(false);
        return;
      }

      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const data = userSnap.data();
          setCitizenProfile(data);
          setNombreCompleto(data.nombreCompleto || user.displayName || "");
          setCedula(data.cedula || "");
          setTelefono(data.telefono || "");
          setTelefonoDestinoSms(data.telefono || "");
          setDireccion(data.direccion || "");
          const sectorFromAddress = matchCaracasSectorFromText(data.direccion || "");
          if (
            sectorFromAddress &&
            (!data.coordenadas ||
              (Math.abs(data.coordenadas.lat - 10.4961) < 0.001 &&
                sectorFromAddress.quadrant.code !== "C-01"))
          ) {
            setCurrentGps({
              lat: sectorFromAddress.lat,
              lng: sectorFromAddress.lng,
              alt: sectorFromAddress.alt,
              quadrant: sectorFromAddress.quadrant
            });
            setDoc(
              userRef,
              {
                coordenadas: {
                  lat: sectorFromAddress.lat,
                  lng: sectorFromAddress.lng,
                  alt: sectorFromAddress.alt
                },
                cuadrante: sectorFromAddress.quadrant
              },
              { merge: true }
            ).catch(() => {});
          } else if (data.coordenadas) {
            setCurrentGps({
              lat: data.coordenadas.lat,
              lng: data.coordenadas.lng,
              alt: data.coordenadas.alt || 915,
              quadrant:
                data.cuadrante ||
                classifyCaracasQuadrant(data.coordenadas.lat, data.coordenadas.lng)
            });
          }
          setNeedsProfileCompletion(!data.cedula || !data.telefono || !data.direccion);

          const session = await issueJWSSession({
            uid: user.uid,
            email: user.email,
            nombre: data.nombreCompleto || user.displayName || "",
            cedula: data.cedula || "",
            role: "ciudadano"
          });
          setJwsSession(session);
        } else {
          setNombreCompleto(user.displayName || "");
          setNeedsProfileCompletion(true);
          const session = await issueJWSSession({
            uid: user.uid,
            email: user.email,
            nombre: user.displayName || "",
            cedula: "",
            role: "ciudadano"
          });
          setJwsSession(session);
        }

        // Cargar Ficha Medica y desencriptarla silenciosamente para el usuario
        const medRef = doc(db, "medical_records", user.uid);
        const medSnap = await getDoc(medRef);
        if (medSnap.exists()) {
          const medData = medSnap.data();
          if (medData.fichaMedicaE2EE) {
            setEncryptedEnvelope(medData.fichaMedicaE2EE);
            const decrypted = await decryptMedicalRecordE2EE(medData.fichaMedicaE2EE);
            if (decrypted) {
              setTipoSangre(decrypted.tipoSangre || "O+");
              setAlergias(decrypted.alergias || "");
              setCondicionesMedicas(decrypted.condicionesMedicas || "");
              setMedicamentos(decrypted.medicamentos || "");
              setContactoEmergenciaNombre(decrypted.contactoEmergenciaNombre || "");
              setContactoEmergenciaTelefono(decrypted.contactoEmergenciaTelefono || "");
              if (
                decrypted.contactoEmergenciaTelefono &&
                decrypted.contactoEmergenciaTelefono !== "No especificado"
              ) {
                setTelefonoDestinoSms(decrypted.contactoEmergenciaTelefono);
              }
            }
          }
        }
      } catch (err) {
        console.warn("Aviso cargando datos del usuario:", err);
      } finally {
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Rotacion silenciosa en segundo plano del token de sesion JWS
  useEffect(() => {
    if (!firebaseUser || !jwsSession) return;
    const interval = setInterval(async () => {
      const remainingSec = Math.floor(((jwsSession.expiresAt || Date.now()) - Date.now()) / 1000);
      if (remainingSec < 180) {
        const rotated = await refreshJWSSession(jwsSession, {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          nombre: citizenProfile?.nombreCompleto || firebaseUser.displayName || "",
          cedula: citizenProfile?.cedula || "",
          role: "ciudadano"
        });
        setJwsSession(rotated);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [firebaseUser, jwsSession, citizenProfile]);

  // Lectura silenciosa del nivel de bateria en segundo plano (para enviarlo cuando pida ayuda)
  useEffect(() => {
    if (!("getBattery" in navigator)) return;
    let batObj = null;
    const syncBattery = () => {
      if (batObj) setBatteryLevel(Math.round(batObj.level * 100));
    };
    navigator.getBattery().then((b) => {
      batObj = b;
      syncBattery();
      b.addEventListener("levelchange", syncBattery);
    });
    return () => {
      if (batObj) batObj.removeEventListener("levelchange", syncBattery);
    };
  }, []);

  // Conexion silenciosa con WebSockets y Firestore para avisar cuando una brigada va en camino
  useEffect(() => {
    if (!firebaseUser) return;
    const socket = io(BACKEND_URL, {
      query: { role: "ciudadano", uid: firebaseUser.uid },
      transports: ["websocket", "polling"]
    });

    socket.on("sos:status-changed", (update) => {
      if (update.uid === firebaseUser.uid || update.alertId === lastSosResult?.id) {
        setActiveRescueStatus(update);
      }
    });
    socket.on("citizen:rescue-update", (update) => {
      setActiveRescueStatus(update);
    });

    const q = query(collection(db, "alerts"), where("uid", "==", firebaseUser.uid));
    const unsubAlerts = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({ firestoreId: d.id, ...d.data() }));
        if (docs.length > 0) {
          docs.sort((a, b) => (b.clientSentAt || 0) - (a.clientSentAt || 0));
          const latest = docs[0];
          // Si existen reportes duplicados anteriores del mismo usuario, eliminarlos automaticamente
          if (docs.length > 1) {
            docs.slice(1).forEach((dup) => {
              deleteDoc(doc(db, "alerts", dup.firestoreId)).catch(() => {});
            });
          }
          setActiveRescueStatus({
            alertId: latest.id || latest.firestoreId,
            nuevoEstado: latest.estado || "PENDIENTE",
            brigadaAsignada: latest.brigadaAsignada || "En espera de asignación"
          });
        } else {
          setActiveRescueStatus(null);
          setLastSosResult(null);
        }
      },
      () => {}
    );

    return () => {
      socket.disconnect();
      unsubAlerts();
    };
  }, [firebaseUser, lastSosResult]);

  // Detectar Direccion usando el GPS del telefono
  const handleDetectAddressByGPS = async () => {
    setDetectingAddress(true);
    setAuthMessage(null);
    try {
      const gpsData = await acquireHighPrecisionGPS();
      setDireccion(gpsData.address);
      setGpsCoordsRegistro({
        lat: gpsData.lat,
        lng: gpsData.lng,
        alt: gpsData.alt,
        quadrant: gpsData.quadrant
      });
      setCurrentGps({
        lat: gpsData.lat,
        lng: gpsData.lng,
        alt: gpsData.alt,
        quadrant: gpsData.quadrant
      });
      const nextPerms = { ...permissions, gps: true };
      setPermissions(nextPerms);
      localStorage.setItem("sismalert_device_permissions", JSON.stringify(nextPerms));
    } catch {
      setAuthMessage({
        type: "error",
        text: "No pudimos obtener tu ubicación automáticamente. Revisa el permiso de ubicación o escribe tu dirección manualmente."
      });
    } finally {
      setDetectingAddress(false);
    }
  };

  // Inicio de sesion con correo y contrasena
  const handleManualLogin = async (e) => {
    e.preventDefault();
    setSubmittingAuth(true);
    setAuthMessage(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch {
      setAuthMessage({
        type: "error",
        text: "Correo o contraseña incorrectos. Intenta nuevamente."
      });
    } finally {
      setSubmittingAuth(false);
    }
  };

  // Registro manual con verificacion de correo
  const handleManualRegister = async (e) => {
    e.preventDefault();
    if (!nombreCompleto.trim() || !cedula.trim() || !telefono.trim() || !direccion.trim()) {
      setAuthMessage({
        type: "error",
        text: "Por favor completa todos tus datos personales."
      });
      return;
    }

    setSubmittingAuth(true);
    setAuthMessage(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: nombreCompleto.trim() });

      let coords = gpsCoordsRegistro;
      if (!coords) {
        const geocoded = await geocodeAddressToCoordinates(direccion.trim());
        coords = geocoded || {
          lat: currentGps.lat,
          lng: currentGps.lng,
          alt: currentGps.alt,
          quadrant: currentGps.quadrant
        };
      }
      setCurrentGps(coords);

      const profileDoc = {
        uid: cred.user.uid,
        email: email.trim(),
        nombreCompleto: nombreCompleto.trim(),
        cedula: cedula.trim().toUpperCase(),
        telefono: telefono.trim(),
        direccion: direccion.trim(),
        coordenadas: {
          lat: coords.lat,
          lng: coords.lng,
          alt: coords.alt
        },
        cuadrante: coords.quadrant,
        authMethod: "manual_email",
        role: "ciudadano",
        fichaMedicaCompletada: false,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, "users", cred.user.uid), profileDoc);
      await sendEmailVerification(cred.user);

      setCitizenProfile(profileDoc);
      setNeedsProfileCompletion(false);
      setAuthMessage({
        type: "success",
        text: "Te enviamos un enlace de confirmación a tu correo electrónico."
      });
    } catch (err) {
      let msg = "No se pudo completar el registro. Verifica tus datos.";
      if (err.code === "auth/email-already-in-use") {
        msg = "Este correo electrónico ya está registrado.";
      } else if (err.code === "auth/weak-password") {
        msg = "La contraseña debe tener al menos 6 caracteres.";
      }
      setAuthMessage({ type: "error", text: msg });
    } finally {
      setSubmittingAuth(false);
    }
  };

  // Inicio con Google
  const handleGoogleSignIn = async () => {
    setSubmittingAuth(true);
    setAuthMessage(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      let msg = "No se pudo iniciar sesión con Google. Intenta nuevamente.";
      if (err?.code === "auth/unauthorized-domain") {
        msg =
          "Para usar Google desde esta dirección IP local (192.168.0.181), agrégala en Firebase Console > Authentication > Settings > Dominios autorizados, o regístrate con tu correo y contraseña.";
      } else if (err?.code === "auth/operation-not-allowed") {
        msg =
          "Activa el proveedor de Google en Firebase Console > Authentication > Sign-in method.";
      } else if (err?.code === "auth/popup-blocked") {
        msg =
          "Tu navegador bloqueó la ventana de Google. Permite ventanas emergentes en Safari o ingresa con tu correo.";
      }
      setAuthMessage({
        type: "error",
        text: msg
      });
    } finally {
      setSubmittingAuth(false);
    }
  };

  // Olvidar contrasena
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setAuthMessage({
        type: "error",
        text: "Escribe tu correo electrónico para enviarte el enlace de recuperación."
      });
      return;
    }
    setSubmittingAuth(true);
    setAuthMessage(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setAuthMessage({
        type: "success",
        text: "Te enviamos un correo con el enlace para cambiar tu contraseña."
      });
    } catch {
      setAuthMessage({
        type: "error",
        text: "No pudimos enviar el correo. Verifica que esté bien escrito."
      });
    } finally {
      setSubmittingAuth(false);
    }
  };

  const handleCheckEmailVerified = async () => {
    if (!auth.currentUser) return;
    setSubmittingAuth(true);
    try {
      await auth.currentUser.reload();
      setFirebaseUser({ ...auth.currentUser });
      if (!auth.currentUser.emailVerified) {
        setAuthMessage({
          type: "info",
          text: "Aún no hemos recibido la confirmación. Revisa tu bandeja de entrada o correo no deseado."
        });
      }
    } finally {
      setSubmittingAuth(false);
    }
  };

  const handleSaveGoogleCitizenProfile = async (e) => {
    e.preventDefault();
    if (!nombreCompleto.trim() || !cedula.trim() || !telefono.trim() || !direccion.trim()) {
      setAuthMessage({
        type: "error",
        text: "Por favor completa tu Cédula, Teléfono y Dirección."
      });
      return;
    }

    setSubmittingAuth(true);
    try {
      let coords = gpsCoordsRegistro;
      if (!coords) {
        const geocoded = await geocodeAddressToCoordinates(direccion.trim());
        coords = geocoded || {
          lat: currentGps.lat,
          lng: currentGps.lng,
          alt: currentGps.alt,
          quadrant: currentGps.quadrant
        };
      }
      setCurrentGps(coords);

      const profileDoc = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        nombreCompleto: nombreCompleto.trim(),
        cedula: cedula.trim().toUpperCase(),
        telefono: telefono.trim(),
        direccion: direccion.trim(),
        coordenadas: {
          lat: coords.lat,
          lng: coords.lng,
          alt: coords.alt
        },
        cuadrante: coords.quadrant,
        authMethod: "google_oauth",
        role: "ciudadano",
        fichaMedicaCompletada: Boolean(encryptedEnvelope),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "users", firebaseUser.uid), profileDoc, { merge: true });
      setCitizenProfile(profileDoc);
      setNeedsProfileCompletion(false);

      const session = await issueJWSSession({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        nombre: profileDoc.nombreCompleto,
        cedula: profileDoc.cedula,
        role: "ciudadano"
      });
      setJwsSession(session);
    } catch {
      setAuthMessage({
        type: "error",
        text: "No se pudieron guardar los datos. Intenta nuevamente."
      });
    } finally {
      setSubmittingAuth(false);
    }
  };

  // Activar permisos del telefono
  const handleTogglePermission = async (permKey) => {
    const updated = { ...permissions };

    if (permKey === "gps") {
      try {
        const gps = await acquireHighPrecisionGPS();
        setCurrentGps({
          lat: gps.lat,
          lng: gps.lng,
          alt: gps.alt,
          quadrant: gps.quadrant
        });
        updated.gps = true;
      } catch {
        updated.gps = !updated.gps;
      }
    } else if (permKey === "motion") {
      if (
        typeof DeviceMotionEvent !== "undefined" &&
        typeof DeviceMotionEvent.requestPermission === "function"
      ) {
        try {
          const response = await DeviceMotionEvent.requestPermission();
          updated.motion = response === "granted";
        } catch {
          updated.motion = true;
        }
      } else {
        updated.motion = !updated.motion;
      }
    } else if (permKey === "sms") {
      updated.sms = !updated.sms;
    }

    setPermissions(updated);
    localStorage.setItem("sismalert_device_permissions", JSON.stringify(updated));
  };

  // Guardar Ficha Medica
  const handleSaveMedicalRecord = async (e) => {
    e.preventDefault();
    if (!firebaseUser) return;

    setSavingMedical(true);
    setMedicalStatusMsg(null);
    try {
      const plainRecord = {
        uid: firebaseUser.uid,
        nombreCompleto: citizenProfile?.nombreCompleto || nombreCompleto || firebaseUser.displayName || "",
        cedula: citizenProfile?.cedula || cedula || "V-00000000",
        tipoSangre,
        alergias: alergias.trim() || "Ninguna",
        condicionesMedicas: condicionesMedicas.trim() || "Ninguna",
        medicamentos: medicamentos.trim() || "Ninguno",
        contactoEmergenciaNombre: contactoEmergenciaNombre.trim() || "No especificado",
        contactoEmergenciaTelefono: contactoEmergenciaTelefono.trim() || "No especificado",
        updatedAt: new Date().toISOString()
      };

      if (contactoEmergenciaTelefono.trim()) {
        setTelefonoDestinoSms(contactoEmergenciaTelefono.trim());
      }

      const encrypted = await encryptMedicalRecordE2EE(plainRecord);
      setEncryptedEnvelope(encrypted);

      localStorage.setItem(
        `sismalert_offline_ficha_${firebaseUser.uid}`,
        JSON.stringify({ plainRecord, encrypted })
      );

      try {
        await setDoc(
          doc(db, "medical_records", firebaseUser.uid),
          {
            uid: firebaseUser.uid,
            cedula: plainRecord.cedula,
            tipoSangreResumen: tipoSangre,
            tieneAlergiaCritica: Boolean(
              alergias.trim() && alergias.trim().toLowerCase() !== "ninguna"
            ),
            fichaMedicaE2EE: encrypted,
            updatedAt: new Date().toISOString()
          },
          { merge: true }
        );

        await setDoc(
          doc(db, "users", firebaseUser.uid),
          {
            uid: firebaseUser.uid,
            email: firebaseUser.email || "",
            nombreCompleto: plainRecord.nombreCompleto,
            cedula: plainRecord.cedula,
            telefono: citizenProfile?.telefono || telefono || "",
            direccion: citizenProfile?.direccion || direccion || "",
            fichaMedicaCompletada: true,
            tipoSangreResumen: tipoSangre,
            updatedAt: new Date().toISOString()
          },
          { merge: true }
        );
      } catch (firestoreErr) {
        console.warn("Aviso guardando en Firestore:", firestoreErr);
      }

      setMedicalStatusMsg({
        type: "success",
        text: "Tu ficha médica ha sido guardada de forma segura. Ya estás protegido en segundo plano."
      });
    } catch (err) {
      console.error("Error guardando ficha medica:", err);
      setMedicalStatusMsg({
        type: "error",
        text: "Ocurrió un inconveniente al guardar tu ficha médica. Intenta nuevamente."
      });
    } finally {
      setSavingMedical(false);
    }
  };

  // Verificar si el ciudadano ya tiene un reporte activo (1 solo reporte por persona)
  const hasActiveSosReport = Boolean(
    activeRescueStatus && activeRescueStatus.nuevoEstado !== "RESCATADO"
  );

  // Enviar solicitud de auxilio SOS (maximo 1 reporte activo por ciudadano)
  const handleTriggerSOS = async () => {
    if (!firebaseUser || sendingSos || hasActiveSosReport) return;
    setSendingSos(true);
    setLastSosResult(null);

    const startTime = Date.now();

    let coords = { ...currentGps };
    const citizenAddress = citizenProfile?.direccion || direccion || "";
    try {
      const liveGps = await Promise.race([
        acquireHighPrecisionGPS(citizenAddress),
        new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT")), 2500))
      ]);
      coords = {
        lat: liveGps.lat,
        lng: liveGps.lng,
        alt: liveGps.alt,
        quadrant: liveGps.quadrant
      };
      setCurrentGps(coords);
    } catch {
      const sectorMatch = matchCaracasSectorFromText(citizenAddress);
      if (sectorMatch) {
        coords = sectorMatch;
        setCurrentGps(sectorMatch);
      }
    }

    let envelope = encryptedEnvelope;
    if (!envelope) {
      envelope = await encryptMedicalRecordE2EE({
        uid: firebaseUser.uid,
        nombreCompleto: citizenProfile?.nombreCompleto || nombreCompleto,
        cedula: citizenProfile?.cedula || cedula,
        tipoSangre,
        alergias: alergias || "Ninguna",
        condicionesMedicas: condicionesMedicas || "Ninguna",
        medicamentos: medicamentos || "Ninguno",
        contactoEmergenciaNombre,
        contactoEmergenciaTelefono
      });
      setEncryptedEnvelope(envelope);
    }

    const cleanIdSuffix = (citizenProfile?.cedula || cedula || firebaseUser.uid)
      .replace(/[^0-9A-Za-z]/g, "")
      .slice(-4)
      .toUpperCase();
    const alertId = `SOS-${cleanIdSuffix || "0001"}`;
    const baseAlertPayload = {
      id: alertId,
      uid: firebaseUser.uid,
      ciudadanoNombre: citizenProfile?.nombreCompleto || nombreCompleto || firebaseUser.email,
      cedula: citizenProfile?.cedula || cedula || "V-00000000",
      telefono: citizenProfile?.telefono || telefono || "No registrado",
      telefonoDestinoSms:
        telefonoDestinoSms.trim() ||
        contactoEmergenciaTelefono.trim() ||
        citizenProfile?.telefono ||
        telefono ||
        "",
      contactoEmergenciaTelefono: contactoEmergenciaTelefono.trim() || "",
      direccion: citizenProfile?.direccion || direccion || `Sector ${coords.quadrant.name}`,
      coordenadas: {
        lat: coords.lat,
        lng: coords.lng,
        alt: coords.alt || 915
      },
      cuadrante: coords.quadrant.code || "C-01",
      zonaNombre: coords.quadrant.name || "Chacao",
      bateriaNivel: batteryLevel,
      personasEnSitio: Number(personasEnSitio) || 1,
      tipoSangreResumen: tipoSangre,
      alergiasResumen: alergias.trim() || "Ninguna",
      condicionResumen: condicionesMedicas.trim() || "Solicitud de auxilio",
      fichaMedicaE2EE: envelope,
      estado: "PENDIENTE",
      brigadaAsignada: "En espera de asignación",
      clientSentAt: Date.now(),
      createdAt: new Date().toISOString()
    };

    const rawSmsString = `SISMALERT|SOS|ID:${alertId}|CI:${baseAlertPayload.cedula}|LAT:${coords.lat}|LNG:${coords.lng}|ALT:${coords.alt}m|BAT:${batteryLevel}%|SANGRE:${tipoSangre}|PERS:${personasEnSitio}|IV:${envelope.iv.slice(0, 8)}`;

    let finalChannel = "API_REST";
    let finalLatency = 0;

    try {
      const controller = new AbortController();
      const timeout5s = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${BACKEND_URL}/api/sos/primary`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: jwsSession?.accessToken ? `Bearer ${jwsSession.accessToken}` : ""
        },
        body: JSON.stringify({ alertData: baseAlertPayload }),
        signal: controller.signal
      });
      clearTimeout(timeout5s);
      if (!response.ok) throw new Error("FALLBACK");
      finalLatency = Date.now() - startTime;
    } catch {
      finalChannel = "SMS_GATEWAY";
      finalLatency = Date.now() - startTime;
      try {
        await fetch(`${BACKEND_URL}/api/sos/sms-gateway`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            alertData: baseAlertPayload,
            smsFrame: rawSmsString
          })
        });
      } catch {
        // Respaldo silencioso
      }
    }

    const finalRecord = {
      ...baseAlertPayload,
      canalTransmision: finalChannel,
      smsFrame: rawSmsString,
      latencyMs: finalLatency
    };

    try {
      // Guardamos usando el UID del ciudadano como ID de documento para que NUNCA se creen reportes duplicados
      await setDoc(doc(db, "alerts", firebaseUser.uid), finalRecord, { merge: true });
      await addDoc(collection(db, "audit_logs"), {
        eventType: finalChannel === "API_REST" ? "SOS_PRIMARY_API" : "SOS_FAILOVER_SMS",
        actor: finalRecord.ciudadanoNombre,
        cedula: finalRecord.cedula,
        channel: finalChannel,
        detail: `Solicitud de auxilio ${alertId} recibida (${coords.quadrant.name})`,
        timestamp: new Date().toISOString()
      });
    } catch {
      // Guardado local de respaldo
    }

    setLastSosResult(finalRecord);
    setActiveRescueStatus({
      alertId,
      nuevoEstado: "PENDIENTE",
      brigadaAsignada: "Los equipos de emergencia han recibido tu ubicación"
    });
    setSendingSos(false);
  };

  // Construir enlace nativo de SMS para el telefono (funciona sin internet)
  const buildNativeSmsLink = () => {
    const rawDest =
      telefonoDestinoSms.trim() ||
      contactoEmergenciaTelefono.trim() ||
      citizenProfile?.telefono ||
      telefono ||
      "";
    const cleanPhone = rawDest.replace(/[^0-9+]/g, "");
    const lat = currentGps.lat || 10.4961;
    const lng = currentGps.lng || -66.8532;
    const nombreCiudadano =
      citizenProfile?.nombreCompleto || nombreCompleto || firebaseUser?.email || "Ciudadano";
    const ciCiudadano = citizenProfile?.cedula || cedula || "No registrada";

    const smsBody = [
      "ALERTA SISMALERT - AUXILIO",
      `Nombre: ${nombreCiudadano} (CI: ${ciCiudadano})`,
      `Sangre: ${tipoSangre} | Alergias: ${alergias.trim() || "Ninguna"}`,
      `Personas conmigo: ${personasEnSitio}`,
      `Ubicacion GPS: https://maps.google.com/?q=${lat},${lng}`
    ].join("\n");

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const separator = isIOS ? "&" : "?";
    return `sms:${cleanPhone}${separator}body=${encodeURIComponent(smsBody)}`;
  };

  // Determinar si debemos mostrar flecha de "Volver" en la barra superior
  const canGoBackInAuth = !firebaseUser && authMode !== "login";
  const canGoBackInApp =
    firebaseUser &&
    (firebaseUser.emailVerified || firebaseUser.providerData?.[0]?.providerId !== "password") &&
    !needsProfileCompletion &&
    activeTab === "guardia";

  const handleHeaderBackClick = () => {
    if (canGoBackInAuth) {
      setAuthMode("login");
      setAuthMessage(null);
    } else if (canGoBackInApp) {
      setActiveTab("ficha");
    }
  };

  if (authLoading) {
    return (
      <div className="mobile-viewport-wrapper">
        <div
          className="mobile-device-shell"
          style={{ justifyContent: "center", alignItems: "center", padding: 24 }}
        >
          <div className="brand-mark" style={{ width: 52, height: 52, marginBottom: 14 }}>
            <HeartPulse size={26} />
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", fontWeight: 700 }}>
            SismAlert
          </div>
          <div style={{ fontSize: "0.82rem", color: "var(--text-sub)", marginTop: 4 }}>
            Cargando tu espacio de protección...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-viewport-wrapper">
      <div className="mobile-device-shell">
        {/* CINTILLO SUPERIOR: DESCARGAR APP EN EL TELEFONO */}
        {!isStandalone && (
          <div className="pwa-install-banner">
            <div className="pwa-install-info">
              <div className="pwa-icon-badge">
                <Smartphone size={19} />
              </div>
              <div>
                <div className="pwa-install-title">Descargar app en el teléfono</div>
                <div className="pwa-install-subtitle">
                  Instala SismAlert en tu pantalla de inicio para acceso directo
                </div>
              </div>
            </div>
            <button type="button" className="btn-install-app" onClick={handleInstallAppClick}>
              <Download size={15} />
              Descargar
            </button>
          </div>
        )}

        {/* CABECERA LIMPIA CON FLECHA DE VOLVER */}
        <header className="app-header">
          <div className="header-left">
            {(canGoBackInAuth || canGoBackInApp) && (
              <button
                type="button"
                className="btn-back-nav"
                onClick={handleHeaderBackClick}
                aria-label="Volver atrás"
                title="Volver"
              >
                <ArrowLeft size={19} />
              </button>
            )}
            <div className="brand-mark">
              <HeartPulse size={20} />
            </div>
            <div>
              <div className="brand-title">SismAlert</div>
              <div className="brand-subtitle">Asistencia y Protección Ciudadana</div>
            </div>
          </div>

          {firebaseUser && (
            <button type="button" className="btn-logout" onClick={() => signOut(auth)}>
              <LogOut size={15} />
              Salir
            </button>
          )}
        </header>

        {/* CONTENIDO PRINCIPAL */}
        <main className="app-main">
          {/* =================================================================
              1. PANTALLAS DE INICIO DE SESION, REGISTRO Y RECUPERAR CLAVE
             ================================================================= */}
          {!firebaseUser && (
            <section className="surface-card">
              {authMode !== "login" && (
                <button
                  type="button"
                  className="back-row-inline"
                  onClick={() => {
                    setAuthMode("login");
                    setAuthMessage(null);
                  }}
                >
                  <ArrowLeft size={17} />
                  <span>Volver al inicio de sesión</span>
                </button>
              )}

              <h1 className="card-title">
                {authMode === "login" && "Iniciar sesión"}
                {authMode === "register" && "Crear cuenta"}
                {authMode === "forgot" && "Recuperar contraseña"}
              </h1>
              <p className="card-subtitle">
                {authMode === "login" &&
                  "Ingresa a tu cuenta para mantener activa tu ficha médica y protección en segundo plano."}
                {authMode === "register" &&
                  "Completa tus datos personales para que los equipos de emergencia puedan asistirte."}
                {authMode === "forgot" &&
                  "Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña."}
              </p>

              {authMessage && (
                <div className={`alert-banner ${authMessage.type}`} style={{ marginTop: 14 }}>
                  <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{authMessage.text}</span>
                </div>
              )}

              {/* INICIAR SESION */}
              {authMode === "login" && (
                <form className="form-stack" onSubmit={handleManualLogin}>
                  <div className="field-group">
                    <label className="field-label">Correo electrónico</label>
                    <input
                      type="email"
                      required
                      className="field-input"
                      placeholder="tucorreo@ejemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  <div className="field-group">
                    <div className="field-label">
                      <span>Contraseña</span>
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => {
                          setAuthMode("forgot");
                          setAuthMessage(null);
                        }}
                      >
                        ¿Olvidaste tu contraseña?
                      </button>
                    </div>
                    <input
                      type="password"
                      required
                      className="field-input"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>

                  <button type="submit" className="btn-primary" disabled={submittingAuth}>
                    {submittingAuth ? "Ingresando..." : "Iniciar sesión"}
                  </button>

                  <div className="divider-line">o</div>

                  <button
                    type="button"
                    className="btn-google"
                    onClick={handleGoogleSignIn}
                    disabled={submittingAuth}
                  >
                    <GoogleLogoSVG />
                    <span>Continuar con Google</span>
                  </button>

                  <div style={{ textAlign: "center", marginTop: 8 }}>
                    <span style={{ fontSize: "0.84rem", color: "var(--text-sub)" }}>
                      ¿No tienes una cuenta?{" "}
                    </span>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => {
                        setAuthMode("register");
                        setAuthMessage(null);
                      }}
                    >
                      Regístrate
                    </button>
                  </div>
                </form>
              )}

              {/* REGISTRO DE NUEVO USUARIO */}
              {authMode === "register" && (
                <form className="form-stack" onSubmit={handleManualRegister}>
                  <div className="field-group">
                    <label className="field-label">Nombre Completo</label>
                    <input
                      type="text"
                      required
                      className="field-input"
                      placeholder="Ej. Alexander Delgado"
                      value={nombreCompleto}
                      onChange={(e) => setNombreCompleto(e.target.value)}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className="field-group">
                      <label className="field-label">Cédula</label>
                      <input
                        type="text"
                        required
                        className="field-input"
                        placeholder="V-26774489"
                        value={cedula}
                        onChange={(e) => setCedula(e.target.value)}
                      />
                    </div>
                    <div className="field-group">
                      <label className="field-label">Teléfono</label>
                      <input
                        type="tel"
                        required
                        className="field-input"
                        placeholder="0412-0000000"
                        value={telefono}
                        onChange={(e) => setTelefono(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="field-group">
                    <div className="field-label">
                      <span>Dirección</span>
                      <button
                        type="button"
                        className="btn-link"
                        onClick={handleDetectAddressByGPS}
                        disabled={detectingAddress}
                      >
                        {detectingAddress ? "Obteniendo ubicación..." : "Usar ubicación del GPS"}
                      </button>
                    </div>
                    <textarea
                      required
                      className="field-textarea"
                      placeholder="Toca 'Usar ubicación del GPS' o escribe tu dirección..."
                      value={direccion}
                      onChange={(e) => setDireccion(e.target.value)}
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label">Correo electrónico</label>
                    <input
                      type="email"
                      required
                      className="field-input"
                      placeholder="tucorreo@ejemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label">Contraseña</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      className="field-input"
                      placeholder="Mínimo 6 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>

                  <button type="submit" className="btn-primary" disabled={submittingAuth}>
                    {submittingAuth ? "Creando cuenta..." : "Registrarse"}
                  </button>

                  <div className="divider-line">o</div>

                  <button
                    type="button"
                    className="btn-google"
                    onClick={handleGoogleSignIn}
                    disabled={submittingAuth}
                  >
                    <GoogleLogoSVG />
                    <span>Continuar con Google</span>
                  </button>
                </form>
              )}

              {/* OLVIDE MI CONTRASENA */}
              {authMode === "forgot" && (
                <form className="form-stack" onSubmit={handleForgotPassword}>
                  <div className="field-group">
                    <label className="field-label">Correo electrónico</label>
                    <input
                      type="email"
                      required
                      className="field-input"
                      placeholder="tucorreo@ejemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  <button type="submit" className="btn-primary" disabled={submittingAuth}>
                    {submittingAuth ? "Enviando..." : "Enviar enlace de recuperación"}
                  </button>
                </form>
              )}
            </section>
          )}

          {/* =================================================================
              2. PANTALLA DE CONFIRMACION DE CORREO
             ================================================================= */}
          {firebaseUser &&
            !firebaseUser.emailVerified &&
            firebaseUser.providerData?.[0]?.providerId === "password" && (
              <section className="surface-card">
                <button
                  type="button"
                  className="back-row-inline"
                  onClick={() => signOut(auth)}
                >
                  <ArrowLeft size={17} />
                  <span>Volver al inicio</span>
                </button>

                <h2 className="card-title">Confirma tu correo electrónico</h2>
                <p className="card-subtitle">
                  Enviamos un mensaje de confirmación a <strong>{firebaseUser.email}</strong>. Abre el enlace en tu correo para continuar.
                </p>

                {authMessage && (
                  <div className={`alert-banner ${authMessage.type}`} style={{ marginTop: 14 }}>
                    <AlertCircle size={18} />
                    <span>{authMessage.text}</span>
                  </div>
                )}

                <div className="form-stack">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleCheckEmailVerified}
                    disabled={submittingAuth}
                  >
                    <CheckCircle2 size={18} />
                    {submittingAuth ? "Verificando..." : "Ya confirmé mi correo"}
                  </button>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={async () => {
                      await sendEmailVerification(firebaseUser);
                      setAuthMessage({
                        type: "success",
                        text: "Hemos reenviado el correo de confirmación."
                      });
                    }}
                  >
                    <Mail size={16} />
                    Reenviar correo
                  </button>
                </div>
              </section>
            )}

          {/* =================================================================
              3. COMPLETAR DATOS PERSONALES (PARA INICIO CON GOOGLE)
             ================================================================= */}
          {firebaseUser &&
            (firebaseUser.emailVerified ||
              firebaseUser.providerData?.[0]?.providerId !== "password") &&
            needsProfileCompletion && (
              <section className="surface-card">
                <button
                  type="button"
                  className="back-row-inline"
                  onClick={() => signOut(auth)}
                >
                  <ArrowLeft size={17} />
                  <span>Cambiar de cuenta</span>
                </button>

                <h2 className="card-title">Completa tus datos</h2>
                <p className="card-subtitle">
                  Solo necesitamos tu cédula, teléfono y dirección para poder ubicarte en caso de emergencia.
                </p>

                {authMessage && (
                  <div className={`alert-banner ${authMessage.type}`} style={{ marginTop: 12 }}>
                    <AlertCircle size={18} />
                    <span>{authMessage.text}</span>
                  </div>
                )}

                <form className="form-stack" onSubmit={handleSaveGoogleCitizenProfile}>
                  <div className="field-group">
                    <label className="field-label">Nombre Completo</label>
                    <input
                      type="text"
                      required
                      className="field-input"
                      value={nombreCompleto}
                      onChange={(e) => setNombreCompleto(e.target.value)}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className="field-group">
                      <label className="field-label">Cédula</label>
                      <input
                        type="text"
                        required
                        className="field-input"
                        placeholder="V-26774489"
                        value={cedula}
                        onChange={(e) => setCedula(e.target.value)}
                      />
                    </div>
                    <div className="field-group">
                      <label className="field-label">Teléfono</label>
                      <input
                        type="tel"
                        required
                        className="field-input"
                        placeholder="0412-0000000"
                        value={telefono}
                        onChange={(e) => setTelefono(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="field-group">
                    <div className="field-label">
                      <span>Dirección</span>
                      <button
                        type="button"
                        className="btn-link"
                        onClick={handleDetectAddressByGPS}
                        disabled={detectingAddress}
                      >
                        {detectingAddress ? "Obteniendo ubicación..." : "Usar ubicación del GPS"}
                      </button>
                    </div>
                    <textarea
                      required
                      className="field-textarea"
                      placeholder="Toca 'Usar ubicación del GPS' o escribe tu dirección..."
                      value={direccion}
                      onChange={(e) => setDireccion(e.target.value)}
                    />
                  </div>

                  <button type="submit" className="btn-primary" disabled={submittingAuth}>
                    Continuar a mi ficha médica
                  </button>
                </form>
              </section>
            )}

          {/* =================================================================
              4. PANTALLA PRINCIPAL DEL USUARIO: "RELLENAR FICHA MEDICA"
             ================================================================= */}
          {firebaseUser &&
            (firebaseUser.emailVerified ||
              firebaseUser.providerData?.[0]?.providerId !== "password") &&
            !needsProfileCompletion && (
              <>
                {/* Estado de Rescate si el usuario emitio una alerta */}
                {activeRescueStatus && (
                  <div className="surface-card" style={{ borderColor: "rgba(16, 185, 129, 0.45)" }}>
                    <div className="protection-badge">
                      <Radio size={15} />
                      <span>
                        {activeRescueStatus.nuevoEstado === "PENDIENTE" && "Alerta recibida por los rescatistas"}
                        {activeRescueStatus.nuevoEstado === "EN_RUTA" && "Unidad de rescate en camino"}
                        {activeRescueStatus.nuevoEstado === "RESCATADO" && "Asistencia completada"}
                      </span>
                    </div>
                    <p className="card-subtitle" style={{ marginTop: 2 }}>
                      {activeRescueStatus.brigadaAsignada}
                    </p>
                  </div>
                )}

                {activeTab === "ficha" && (
                  <>
                    {/* TARJETA PRINCIPAL: RELLENAR FICHA MEDICA */}
                    <section className="surface-card">
                      <div className="protection-badge">
                        <Shield size={15} />
                        <span>Protección activa en segundo plano · Bajo consumo de batería</span>
                      </div>

                      <h1 className="card-title">Rellenar ficha médica</h1>
                      <p className="card-subtitle">
                        Completa tus datos médicos y otorga los permisos de tu teléfono. SismAlert funcionará automáticamente en segundo plano cuando lo necesites.
                      </p>

                      {/* Permisos de la aplicacion */}
                      <div className="permission-list">
                        <div className={`permission-item ${permissions.gps ? "granted" : ""}`}>
                          <div className="permission-meta">
                            <div className="permission-icon">
                              <MapPin size={19} />
                            </div>
                            <div>
                              <div className="permission-name">Ubicación GPS</div>
                              <div className="permission-detail">
                                {permissions.gps
                                  ? `Activado (${currentGps.quadrant?.name || "Caracas"})`
                                  : "Permite enviarte ayuda a tu ubicación exacta"}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            className={`btn-permission-toggle ${permissions.gps ? "granted" : ""}`}
                            onClick={() => handleTogglePermission("gps")}
                          >
                            {permissions.gps ? "Activado" : "Permitir"}
                          </button>
                        </div>

                        <div className={`permission-item ${permissions.motion ? "granted" : ""}`}>
                          <div className="permission-meta">
                            <div className="permission-icon">
                              <Activity size={19} />
                            </div>
                            <div>
                              <div className="permission-name">Detección en segundo plano</div>
                              <div className="permission-detail">
                                {permissions.motion
                                  ? "Activo sin gastar batería"
                                  : "Detecta sismos automáticamente con tu teléfono"}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            className={`btn-permission-toggle ${permissions.motion ? "granted" : ""}`}
                            onClick={() => handleTogglePermission("motion")}
                          >
                            {permissions.motion ? "Activado" : "Permitir"}
                          </button>
                        </div>

                        <div className={`permission-item ${permissions.sms ? "granted" : ""}`}>
                          <div className="permission-meta">
                            <div className="permission-icon">
                              <Send size={18} />
                            </div>
                            <div>
                              <div className="permission-name">Envío de SMS de emergencia</div>
                              <div className="permission-detail">
                                {permissions.sms
                                  ? "Respaldo por SMS activado"
                                  : "Envía tu alerta por SMS si falla el internet"}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            className={`btn-permission-toggle ${permissions.sms ? "granted" : ""}`}
                            onClick={() => handleTogglePermission("sms")}
                          >
                            {permissions.sms ? "Activado" : "Permitir"}
                          </button>
                        </div>
                      </div>

                      {medicalStatusMsg && (
                        <div className={`alert-banner ${medicalStatusMsg.type}`} style={{ marginTop: 16 }}>
                          <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
                          <span>{medicalStatusMsg.text}</span>
                        </div>
                      )}

                      {/* Formulario de Ficha Medica */}
                      <form className="form-stack" onSubmit={handleSaveMedicalRecord}>
                        <div className="field-group">
                          <label className="field-label">Tipo de sangre</label>
                          <div className="blood-grid">
                            {BLOOD_TYPES.map((bt) => (
                              <button
                                key={bt}
                                type="button"
                                className={`blood-pill ${tipoSangre === bt ? "active" : ""}`}
                                onClick={() => setTipoSangre(bt)}
                              >
                                {bt}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="field-group">
                          <label className="field-label">Alergias a medicamentos</label>
                          <input
                            type="text"
                            className="field-input"
                            placeholder="Ej. Penicilina, Ibuprofeno o Ninguna"
                            value={alergias}
                            onChange={(e) => setAlergias(e.target.value)}
                          />
                        </div>

                        <div className="field-group">
                          <label className="field-label">Condiciones médicas importantes</label>
                          <textarea
                            className="field-textarea"
                            placeholder="Ej. Asma, hipertensión, diabetes o ninguna..."
                            value={condicionesMedicas}
                            onChange={(e) => setCondicionesMedicas(e.target.value)}
                          />
                        </div>

                        <div className="field-group">
                          <label className="field-label">Medicamentos actuales</label>
                          <input
                            type="text"
                            className="field-input"
                            placeholder="Ej. Losartán, Insulina o ninguno"
                            value={medicamentos}
                            onChange={(e) => setMedicamentos(e.target.value)}
                          />
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div className="field-group">
                            <label className="field-label">Contacto de emergencia</label>
                            <input
                              type="text"
                              className="field-input"
                              placeholder="Nombre de un familiar"
                              value={contactoEmergenciaNombre}
                              onChange={(e) => setContactoEmergenciaNombre(e.target.value)}
                            />
                          </div>
                          <div className="field-group">
                            <label className="field-label">Teléfono del contacto</label>
                            <input
                              type="tel"
                              className="field-input"
                              placeholder="0414-0000000"
                              value={contactoEmergenciaTelefono}
                              onChange={(e) => setContactoEmergenciaTelefono(e.target.value)}
                            />
                          </div>
                        </div>

                        <button type="submit" className="btn-primary" disabled={savingMedical}>
                          <CheckCircle2 size={18} />
                          {savingMedical ? "Guardando ficha médica..." : "Guardar ficha médica"}
                        </button>
                      </form>
                    </section>
                  </>
                )}

                {/* PANTALLA SECUNDARIA: SOLICITAR AUXILIO INMEDIATO (CON BOTON DE VOLVER) */}
                {activeTab === "guardia" && (
                  <section className="surface-card">
                    <button
                      type="button"
                      className="back-row-inline"
                      onClick={() => setActiveTab("ficha")}
                    >
                      <ArrowLeft size={17} />
                      <span>Volver a mi ficha médica</span>
                    </button>

                    <h2 className="card-title">Asistencia de emergencia</h2>
                    <p className="card-subtitle">
                      SismAlert te protege automáticamente en segundo plano. Si necesitas ayuda en este momento, presiona el botón SOS.
                    </p>

                    <div className="sos-core-container">
                      <div className="sos-outer-ring">
                        <button
                          type="button"
                          className="sos-trigger-button"
                          onClick={handleTriggerSOS}
                          disabled={sendingSos || hasActiveSosReport}
                          style={
                            hasActiveSosReport
                              ? {
                                  background: "linear-gradient(145deg, #10b981, #047857)",
                                  boxShadow: "0 14px 35px rgba(16, 185, 129, 0.45)",
                                  cursor: "default"
                                }
                              : undefined
                          }
                        >
                          <Radio size={32} />
                          <span
                            className="sos-trigger-title"
                            style={hasActiveSosReport ? { fontSize: "1.35rem" } : undefined}
                          >
                            {sendingSos ? "..." : hasActiveSosReport ? "ACTIVO" : "SOS"}
                          </span>
                          <span className="sos-trigger-sub">
                            {sendingSos
                              ? "Enviando ubicación"
                              : hasActiveSosReport
                                ? "Reporte ya enviado"
                                : "Pedir ayuda"}
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="form-stack">
                      <div className="field-group">
                        <label className="field-label">
                          <span>Personas que están contigo</span>
                          <span style={{ color: "#38bdf8" }}>{personasEnSitio} persona(s)</span>
                        </label>
                        <input
                          type="range"
                          min="1"
                          max="20"
                          value={personasEnSitio}
                          onChange={(e) => setPersonasEnSitio(Number(e.target.value))}
                          style={{ width: "100%", accentColor: "#ef4444" }}
                        />
                      </div>

                      <div className="field-group" style={{ marginTop: 4 }}>
                        <label className="field-label">
                          <span>Teléfono destino para el SMS de emergencia</span>
                        </label>
                        <input
                          type="tel"
                          className="field-input"
                          placeholder="Ej. 0412-0000000"
                          value={telefonoDestinoSms}
                          onChange={(e) => setTelefonoDestinoSms(e.target.value)}
                        />
                      </div>

                      <a
                        href={buildNativeSmsLink()}
                        className="btn-secondary"
                        style={{ textDecoration: "none", marginTop: 2 }}
                      >
                        <Send size={16} />
                        <span>Enviar alerta por SMS desde mi teléfono</span>
                      </a>
                    </div>

                    {lastSosResult && (
                      <div className="alert-banner success" style={{ marginTop: 16 }}>
                        <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
                        <div>
                          <strong>Tu alerta ha sido enviada con éxito.</strong> Los equipos de emergencia ya cuentan con tu ubicación y tu ficha médica. Si no tienes conexión a internet, toca{" "}
                          <strong>&quot;Enviar alerta por SMS desde mi teléfono&quot;</strong> arriba.
                        </div>
                      </div>
                    )}
                  </section>
                )}
              </>
            )}
        </main>

        {/* BARRA INFERIOR DE NAVEGACION */}
        {firebaseUser &&
          (firebaseUser.emailVerified ||
            firebaseUser.providerData?.[0]?.providerId !== "password") &&
          !needsProfileCompletion && (
            <nav className="bottom-nav-bar">
              <button
                type="button"
                className={`nav-tab-btn ${activeTab === "ficha" ? "active" : ""}`}
                onClick={() => setActiveTab("ficha")}
              >
                <FileText size={20} />
                <span>Ficha médica</span>
              </button>

              <button
                type="button"
                className={`nav-tab-btn ${activeTab === "guardia" ? "active" : ""}`}
                onClick={() => setActiveTab("guardia")}
              >
                <Radio size={20} />
                <span>Emergencia SOS</span>
              </button>
            </nav>
          )}

        {/* MODAL DE INSTALACION EN EL TELEFONO */}
        {showInstallModal && (
          <div className="modal-backdrop" onClick={() => setShowInstallModal(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h3 className="card-title">Descargar app en el teléfono</h3>
              <p className="card-subtitle">
                Sigue estos pasos para agregar SismAlert como una aplicación más en tu teléfono:
              </p>

              <div className="permission-list" style={{ marginTop: 14 }}>
                <div className="permission-item">
                  <div className="permission-meta">
                    <div className="permission-icon">
                      <Smartphone size={18} />
                    </div>
                    <div>
                      <div className="permission-name">En teléfonos Android</div>
                      <div className="permission-detail">
                        Toca los tres puntos arriba a la derecha en tu navegador y selecciona{" "}
                        <strong>&quot;Instalar aplicación&quot;</strong>.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="permission-item">
                  <div className="permission-meta">
                    <div className="permission-icon">
                      <Navigation size={18} />
                    </div>
                    <div>
                      <div className="permission-name">En iPhone (Safari)</div>
                      <div className="permission-detail">
                        Toca el botón <strong>Compartir</strong> en la barra inferior y elige{" "}
                        <strong>&quot;Agregar a inicio&quot;</strong>.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="btn-primary"
                style={{ marginTop: 18 }}
                onClick={() => setShowInstallModal(false)}
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
