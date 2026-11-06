// Servicio de Geolocalizacion GPS de Alta Precision, Geocodificacion Inversa y Directa (Nominatim + Gacetero Gran Caracas)

export function classifyCaracasQuadrant(lat, lng) {
  if (lng < -66.878) {
    return { code: "C-02", name: "Libertador" };
  }
  if (lat < 10.455 && lng >= -66.85) {
    return { code: "C-05", name: "El Hatillo" };
  }
  if (lat < 10.482 && lng < -66.84) {
    return { code: "C-04", name: "Baruta" };
  }
  if (lng > -66.825) {
    return { code: "C-03", name: "Sucre / Petare" };
  }
  return { code: "C-01", name: "Chacao" };
}

// Gacetero de precision por parroquias y sectores de la Gran Caracas
const CARACAS_SECTOR_GAZETTEER = [
  {
    keywords: ["23 de enero", "calle el mirador", "el mirador", "monte piedad", "sierra maestra", "agua salud", "caño amarillo", "la planicie"],
    lat: 10.5094,
    lng: -66.9358,
    alt: 965,
    quadrant: { code: "C-02", name: "Libertador" }
  },
  {
    keywords: ["catia", "propatria", "perez bonalde", "casalta", "gramoven", "alta vista", "magallanes", "ruperto lugo", "vista al mar"],
    lat: 10.5142,
    lng: -66.9465,
    alt: 950,
    quadrant: { code: "C-02", name: "Libertador" }
  },
  {
    keywords: ["la pastora", "puerta caracas", "lidice", "manicomio", "cotiza", "altagracia"],
    lat: 10.5135,
    lng: -66.9195,
    alt: 990,
    quadrant: { code: "C-02", name: "Libertador" }
  },
  {
    keywords: ["san martin", "artigas", "maternidad", "capuchinos", "san juan", "el silencio", "quinta crespo"],
    lat: 10.4912,
    lng: -66.9325,
    alt: 895,
    quadrant: { code: "C-02", name: "Libertador" }
  },
  {
    keywords: ["el paraiso", "la paz", "washington", "multi", "las fuentes", "vista alegre", "bella vista"],
    lat: 10.4848,
    lng: -66.9362,
    alt: 905,
    quadrant: { code: "C-02", name: "Libertador" }
  },
  {
    keywords: ["la vega", "las casitas", "los cangilones", "montalban", "juan pablo ii", "antimano", "carapita", "mamera"],
    lat: 10.4725,
    lng: -66.944,
    alt: 940,
    quadrant: { code: "C-02", name: "Libertador" }
  },
  {
    keywords: ["caricuao", "ud2", "ud3", "ud4", "ud5", "ud7", "ruiz pineda", "las adjuntas", "macarao"],
    lat: 10.4352,
    lng: -66.9795,
    alt: 980,
    quadrant: { code: "C-02", name: "Libertador" }
  },
  {
    keywords: ["el valle", "los jardines", "coche", "fuerte tiuna", "longaray", "san antonio", "las mayas"],
    lat: 10.4562,
    lng: -66.9065,
    alt: 885,
    quadrant: { code: "C-02", name: "Libertador" }
  },
  {
    keywords: ["santa rosalia", "el cementerio", "prado de maria", "los rosales", "la bandera", "san pedro", "los chaguaramos", "santa monica", "ciudad universitaria", "ucv"],
    lat: 10.482,
    lng: -66.8965,
    alt: 880,
    quadrant: { code: "C-02", name: "Libertador" }
  },
  {
    keywords: ["candelaria", "bellas artes", "parque carabobo", "la hoyada", "centro", "catedral", "san agustin", "parque central", "el conde", "san bernardino"],
    lat: 10.5038,
    lng: -66.9012,
    alt: 910,
    quadrant: { code: "C-02", name: "Libertador" }
  },
  {
    keywords: ["el recreo", "sabana grande", "plaza venezuela", "chacaito", "la florida", "mariperez", "andres bello", "chapellin"],
    lat: 10.4945,
    lng: -66.8815,
    alt: 895,
    quadrant: { code: "C-02", name: "Libertador" }
  },
  {
    keywords: ["petare", "sucre", "la california", "macaracuay", "el marques", "la urbina", "terrazas del avila", "boleita", "los cortijos", "los dos caminos", "sebucan", "los chorros", "montecristo"],
    lat: 10.4815,
    lng: -66.8085,
    alt: 890,
    quadrant: { code: "C-03", name: "Sucre / Petare" }
  },
  {
    keywords: ["baruta", "las mercedes", "chuao", "cafetal", "santa paula", "san luis", "prados del este", "santa fe", "la trinidad", "manzanares", "alto prado", "piedra azul", "hoyo de la puerta", "cumbres de curumo"],
    lat: 10.4565,
    lng: -66.8685,
    alt: 945,
    quadrant: { code: "C-04", name: "Baruta" }
  },
  {
    keywords: ["el hatillo", "la boyera", "los naranjos", "alto hatillo", "la lagunita", "oripoto", "el cigarral", "los geranios"],
    lat: 10.4255,
    lng: -66.8255,
    alt: 1120,
    quadrant: { code: "C-05", name: "El Hatillo" }
  },
  {
    keywords: ["chacao", "altamira", "los palos grandes", "campo alegre", "el rosal", "bello campo", "la castellana", "san marino"],
    lat: 10.4961,
    lng: -66.8532,
    alt: 912,
    quadrant: { code: "C-01", name: "Chacao" }
  }
];

export function matchCaracasSectorFromText(addressText = "") {
  const norm = addressText
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (!norm.trim()) return null;

  for (const entry of CARACAS_SECTOR_GAZETTEER) {
    for (const kw of entry.keywords) {
      const kwNorm = kw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (norm.includes(kwNorm)) {
        return {
          lat: entry.lat,
          lng: entry.lng,
          alt: entry.alt,
          quadrant: entry.quadrant
        };
      }
    }
  }
  return null;
}

export async function geocodeAddressToCoordinates(addressText = "") {
  const localMatch = matchCaracasSectorFromText(addressText);

  if (addressText && addressText.trim().length >= 4) {
    try {
      const queryStr = addressText.toLowerCase().includes("caracas")
        ? addressText
        : `${addressText}, Caracas, Venezuela`;
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(queryStr)}&limit=1&accept-language=es`,
        {
          headers: { Accept: "application/json" }
        }
      );
      if (res.ok) {
        const results = await res.json();
        if (Array.isArray(results) && results.length > 0) {
          const lat = Number(parseFloat(results[0].lat).toFixed(5));
          const lng = Number(parseFloat(results[0].lon).toFixed(5));
          if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
            return {
              lat,
              lng,
              alt: localMatch?.alt || 930,
              quadrant: classifyCaracasQuadrant(lat, lng)
            };
          }
        }
      }
    } catch {
      // Si Nominatim no responde, usamos el gacetero local de Caracas
    }
  }

  if (localMatch) {
    return localMatch;
  }

  return null;
}

export async function reverseGeocodeCoordinates(lat, lng) {
  const quadrant = classifyCaracasQuadrant(lat, lng);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=es`,
      {
        headers: {
          Accept: "application/json"
        }
      }
    );
    if (res.ok) {
      const data = await res.json();
      if (data?.display_name) {
        const shortParts = data.display_name
          .split(",")
          .slice(0, 4)
          .map((s) => s.trim())
          .join(", ");
        return {
          formattedAddress: `${shortParts} (${quadrant.name})`,
          quadrant
        };
      }
    }
  } catch {
    // Fallback al cuadrante
  }

  return {
    formattedAddress: `Sector ${quadrant.name}, Gran Caracas (GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)})`,
    quadrant
  };
}

export function acquireHighPrecisionGPS(fallbackAddressText = "") {
  return new Promise((resolve, reject) => {
    const tryFallbackFromAddress = async (originalError) => {
      if (fallbackAddressText && fallbackAddressText.trim()) {
        const geocoded = await geocodeAddressToCoordinates(fallbackAddressText);
        if (geocoded) {
          resolve({
            lat: geocoded.lat,
            lng: geocoded.lng,
            alt: geocoded.alt || 930,
            accuracy: 25,
            address: fallbackAddressText.trim(),
            quadrant: geocoded.quadrant,
            capturedAt: new Date().toISOString()
          });
          return;
        }
      }
      reject(originalError || new Error("No se pudo obtener la ubicacion GPS."));
    };

    if (!("geolocation" in navigator)) {
      tryFallbackFromAddress(
        new Error("El navegador de este dispositivo no soporta geolocalizacion GPS.")
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        const alt = pos.coords.altitude ? Math.round(pos.coords.altitude) : 915;
        const accuracy = pos.coords.accuracy ? Math.round(pos.coords.accuracy) : 12;

        const geoInfo = await reverseGeocodeCoordinates(lat, lng);

        resolve({
          lat,
          lng,
          alt,
          accuracy,
          address: geoInfo.formattedAddress,
          quadrant: geoInfo.quadrant,
          capturedAt: new Date().toISOString()
        });
      },
      (err) => {
        tryFallbackFromAddress(err);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0
      }
    );
  });
}
