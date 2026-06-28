import { useEffect, useRef } from 'react'
import L from 'leaflet'
import s from './AdRouteMap.module.css'

function nearestGpsPoint(gpsTrack, tCurrent) {
  if (!gpsTrack?.length) return null
  let best = gpsTrack[0], bestDiff = Math.abs(gpsTrack[0].t - tCurrent)
  for (const p of gpsTrack) {
    const diff = Math.abs(p.t - tCurrent)
    if (diff < bestDiff) { best = p; bestDiff = diff }
    if (p.t > tCurrent + 10) break
  }
  return best
}

function tileUrl(theme) {
  return theme === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
}

const TILE_ATTR = '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors © <a href="https://carto.com">CARTO</a>'

export function AdRouteMap({ gpsTrack, hoverT, selection, theme = 'light' }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const routeLayerRef = useRef(null)
  const segmentLayerRef = useRef(null)
  const cursorMarkerRef = useRef(null)
  const tileLayerRef = useRef(null)

  // Colours resolved once from CSS, updated on theme change
  const colorsRef = useRef({ accent: '#5b80ff', yellow: '#f4c95d' })

  // Init map (runs once per gpsTrack identity; cleanup handles StrictMode double-mount)
  useEffect(() => {
    const container = containerRef.current
    if (!container || !gpsTrack?.length) return

    const accent = getComputedStyle(container).getPropertyValue('--accent').trim() || '#5b80ff'
    const yellow = getComputedStyle(container).getPropertyValue('--yellow').trim() || '#f4c95d'
    colorsRef.current = { accent, yellow }

    const map = L.map(container, { zoomControl: true })
    mapRef.current = map

    tileLayerRef.current = L.tileLayer(tileUrl(theme), {
      subdomains: 'abcd', maxZoom: 19, attribution: TILE_ATTR,
    }).addTo(map)

    const latlngs = gpsTrack.map(p => [p.lat, p.lng])
    routeLayerRef.current = L.polyline(latlngs, { color: accent, weight: 3, opacity: 0.85 }).addTo(map)
    map.fitBounds(routeLayerRef.current.getBounds(), { padding: [20, 20] })

    requestAnimationFrame(() => { if (mapRef.current) mapRef.current.invalidateSize() })

    return () => {
      map.remove()
      mapRef.current = null
      routeLayerRef.current = null
      segmentLayerRef.current = null
      cursorMarkerRef.current = null
      tileLayerRef.current = null
    }
  }, [gpsTrack]) // eslint-disable-line react-hooks/exhaustive-deps

  // Theme change → swap tile layer + update polyline colour
  useEffect(() => {
    const map = mapRef.current
    const container = containerRef.current
    if (!map || !container) return

    const accent = getComputedStyle(container).getPropertyValue('--accent').trim() || '#5b80ff'
    colorsRef.current.accent = accent

    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current)
    tileLayerRef.current = L.tileLayer(tileUrl(theme), {
      subdomains: 'abcd', maxZoom: 19, attribution: TILE_ATTR,
    }).addTo(map)

    routeLayerRef.current?.setStyle({ color: accent })
  }, [theme])

  // hoverT → move cursor marker
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (hoverT == null) {
      if (cursorMarkerRef.current) { map.removeLayer(cursorMarkerRef.current); cursorMarkerRef.current = null }
      return
    }
    const pt = nearestGpsPoint(gpsTrack, hoverT)
    if (!pt) return
    if (!cursorMarkerRef.current) {
      cursorMarkerRef.current = L.circleMarker([pt.lat, pt.lng], {
        radius: 8, color: '#ffffff', fillColor: '#3B82F6', fillOpacity: 1, weight: 2,
      }).addTo(map)
    } else {
      cursorMarkerRef.current.setLatLng([pt.lat, pt.lng])
    }
  }, [hoverT, gpsTrack])

  // selection → segment highlight + fitBounds
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (segmentLayerRef.current) { map.removeLayer(segmentLayerRef.current); segmentLayerRef.current = null }
    if (!selection) {
      if (routeLayerRef.current) map.fitBounds(routeLayerRef.current.getBounds(), { padding: [20, 20] })
      return
    }
    const { tStart, tEnd } = selection
    const seg = gpsTrack?.filter(p => p.t >= tStart && p.t <= tEnd)
    if (!seg || seg.length < 2) return
    const yellow = colorsRef.current.yellow
    segmentLayerRef.current = L.polyline(seg.map(p => [p.lat, p.lng]), {
      color: yellow, weight: 6, opacity: 0.95,
    }).addTo(map)
    map.fitBounds(segmentLayerRef.current.getBounds(), { padding: [30, 30] })
  }, [selection, gpsTrack])

  if (!gpsTrack?.length) return null

  return (
    <div className={s.wrap}>
      <div ref={containerRef} className={s.mapContainer} />
    </div>
  )
}
