import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { Navigation, MapPin } from "lucide-react";
import {
  acquireHighPrecisionGPS,
  reverseGeocodeCoordinates,
  classifyCaracasQuadrant
} from "../services/gpsAddressService";

export default function LiveGpsMapPicker({
  lat,
  lng,
  onLocationChange,
  height = 215
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const [locating, setLocating] = useState(false);
  const [mapStyle, setMapStyle] = useState("google_streets"); // "google_streets" | "google_hybrid" | "osm"
  const tileLayerRef = useRef(null);

  const safeLat = Number(lat) || 10.4961;
  const safeLng = Number(lng) || -66.8532;

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [safeLat, safeLng],
      zoom: 16,
      zoomControl: true,
      maxZoom: 20
    });

    tileLayerRef.current = L.tileLayer(
      "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=es",
      {
        maxZoom: 20,
        attribution: "Google Maps HD · OpenStreetMap"
      }
    ).addTo(map);

    const pinIcon = L.divIcon({
      className: "",
      html: `<div style="width:26px;height:26px;border-radius:50%;background:#ef4444;border:3px solid #ffffff;box-shadow:0 0 16px rgba(239,68,68,0.85);"></div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });

    const marker = L.marker([safeLat, safeLng], {
      icon: pinIcon,
      draggable: true
    }).addTo(map);

    marker.on("dragend", async () => {
      const pos = marker.getLatLng();
      const newLat = Number(pos.lat.toFixed(5));
      const newLng = Number(pos.lng.toFixed(5));
      const geo = await reverseGeocodeCoordinates(newLat, newLng);
      if (onLocationChange) {
        onLocationChange({
          lat: newLat,
          lng: newLng,
          alt: 920,
          address: geo.formattedAddress,
          quadrant: geo.quadrant
        });
      }
    });

    map.on("click", async (e) => {
      const newLat = Number(e.latlng.lat.toFixed(5));
      const newLng = Number(e.latlng.lng.toFixed(5));
      marker.setLatLng([newLat, newLng]);
      const geo = await reverseGeocodeCoordinates(newLat, newLng);
      if (onLocationChange) {
        onLocationChange({
          lat: newLat,
          lng: newLng,
          alt: 920,
          address: geo.formattedAddress,
          quadrant: geo.quadrant
        });
      }
    });

    markerRef.current = marker;
    mapInstanceRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 180);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Actualizar posicion cuando cambian lat/lng desde afuera
  useEffect(() => {
    if (!mapInstanceRef.current || !markerRef.current) return;
    markerRef.current.setLatLng([safeLat, safeLng]);
    mapInstanceRef.current.setView([safeLat, safeLng], Math.max(mapInstanceRef.current.getZoom(), 16), {
      animate: true
    });
  }, [safeLat, safeLng]);

  // Cambiar capa del mapa
  useEffect(() => {
    if (!tileLayerRef.current) return;
    if (mapStyle === "google_hybrid") {
      tileLayerRef.current.setUrl("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&hl=es");
    } else if (mapStyle === "osm") {
      tileLayerRef.current.setUrl("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
    } else {
      tileLayerRef.current.setUrl("https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=es");
    }
  }, [mapStyle]);

  const handleUseRealGpsNow = async () => {
    setLocating(true);
    try {
      const gps = await acquireHighPrecisionGPS();
      if (mapInstanceRef.current && markerRef.current) {
        markerRef.current.setLatLng([gps.lat, gps.lng]);
        mapInstanceRef.current.flyTo([gps.lat, gps.lng], 17, {
          animate: true,
          duration: 0.9
        });
      }
      if (onLocationChange) {
        onLocationChange(gps);
      }
    } catch {
      // Si el usuario aun no dio permiso, mantiene la posicion actual
    } finally {
      setLocating(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        marginTop: 6
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap"
        }}
      >
        <button
          type="button"
          onClick={handleUseRealGpsNow}
          disabled={locating}
          style={{
            background: "rgba(14, 165, 233, 0.16)",
            border: "1px solid rgba(56, 189, 248, 0.45)",
            color: "#38bdf8",
            borderRadius: 9,
            padding: "7px 11px",
            fontSize: "0.76rem",
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6
          }}
        >
          <Navigation size={14} />
          <span>{locating ? "Capturando GPS..." : "Detectar mi ubicación GPS exacta"}</span>
        </button>

        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            onClick={() => setMapStyle("google_streets")}
            style={{
              background: mapStyle === "google_streets" ? "#0ea5e9" : "rgba(255,255,255,0.06)",
              color: "#ffffff",
              border: "none",
              borderRadius: 7,
              padding: "5px 8px",
              fontSize: "0.7rem",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Calles HD
          </button>
          <button
            type="button"
            onClick={() => setMapStyle("google_hybrid")}
            style={{
              background: mapStyle === "google_hybrid" ? "#0ea5e9" : "rgba(255,255,255,0.06)",
              color: "#ffffff",
              border: "none",
              borderRadius: 7,
              padding: "5px 8px",
              fontSize: "0.7rem",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Satélite
          </button>
          <button
            type="button"
            onClick={() => setMapStyle("osm")}
            style={{
              background: mapStyle === "osm" ? "#0ea5e9" : "rgba(255,255,255,0.06)",
              color: "#ffffff",
              border: "none",
              borderRadius: 7,
              padding: "5px 8px",
              fontSize: "0.7rem",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            OSM
          </button>
        </div>
      </div>

      <div
        ref={mapContainerRef}
        style={{
          width: "100%",
          height,
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid rgba(148, 163, 184, 0.25)"
        }}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.72rem",
          color: "var(--text-sub)"
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <MapPin size={12} color="#ef4444" />
          Toca cualquier calle en el mapa o arrastra el punto rojo para ajustar tu ubicación
        </span>
        <span style={{ fontFamily: "monospace", color: "#38bdf8" }}>
          {safeLat.toFixed(4)}, {safeLng.toFixed(4)}
        </span>
      </div>
    </div>
  );
}
