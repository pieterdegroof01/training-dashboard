import { useState } from 'react'
import { AdHeader } from './components/AdHeader.jsx'
import { AdMetricStrip } from './components/AdMetricStrip.jsx'
import { AdDerivedRow } from './components/AdDerivedRow.jsx'
import { AdSection } from './components/AdSection.jsx'
import { AdRouteMap } from './components/AdRouteMap.jsx'
import { AdDualChart } from './components/AdDualChart.jsx'
import { AdRunChart } from './components/AdRunChart.jsx'
import { AdZoneBar } from './components/AdZoneBar.jsx'
import { AdDecoupling } from './components/AdDecoupling.jsx'
import { AdPlanCompare } from './components/AdPlanCompare.jsx'
import { AdPlannedBlocks } from './components/AdPlannedBlocks.jsx'
import { AdCadenceCard } from './components/AdCadenceCard.jsx'
import { AdAiCard } from './components/AdAiCard.jsx'
import { AdMmpChart } from './components/AdMmpChart.jsx'
import { AdDistributions } from './components/AdDistributions.jsx'
import { AdAnalysis } from './components/AdAnalysis.jsx'
import { AdWbal } from './components/AdWbal.jsx'
import { AdContext } from './components/AdContext.jsx'
import { AdRunImpact } from './components/AdRunImpact.jsx'
import { Card } from './components/Card.jsx'
import s from './ActivityDetailView.module.css'

export function ActivityDetailView({ activity, onBack, layout = 'desktop', theme = 'light' }) {
  const d = activity
  const vi = d.derived.find((x) => x.l === 'VI')?.v

  // Shared interactive state
  const [hoverT, setHoverT] = useState(null)
  const [selection, setSelection] = useState(null)

  const handleHover = (t) => setHoverT(t)
  const handleSelect = (sel) => setSelection(sel)

  // ── Hardloop-layout ─────────────────────────────────────────────────────────

  if (d.kind === 'run') {
    const runRouteCard = d.gpsTrackRaw && (
      <AdSection title="Looproute">
        <AdRouteMap gpsTrack={d.gpsTrackRaw} hoverT={hoverT} selection={selection} theme={theme} />
      </AdSection>
    )

    const runChartCard = (d.speedRaw || d.hrRaw) && (
      <AdSection title="Tempo en hartslag" sub="over de hele activiteit">
        <AdRunChart
          speed={d.speedRaw}
          gap={d.gapRaw}
          hr={d.hrRaw}
          durationMin={d.durationMin}
          hoverT={hoverT}
          selection={selection}
          onHover={handleHover}
          onSelect={handleSelect}
          w={layout === 'desktop' ? 620 : 520}
        />
      </AdSection>
    )

    const runZoneCard = d.zones && (
      <AdSection title="Hartslagzones" sub={d.zonesBasis || 'op basis van hartslag'}>
        <AdZoneBar zones={d.zones} />
      </AdSection>
    )

    const runDecouplingCard = d.decoupling && (
      <AdSection title="Aerobe koppeling">
        <AdDecoupling dc={d.decoupling} kind="run" />
      </AdSection>
    )

    const runDistCard = d.dist && (
      <AdSection title="Verdelingen" sub="tijd per waarde">
        <AdDistributions dist={d.dist} kind="run" />
      </AdSection>
    )

    const runCadenceCard = d.cadence && (
      <AdSection title="Hartslag en cadans">
        <AdCadenceCard activity={d} unit="spm" />
      </AdSection>
    )

    const runImpactCard = (
      <AdSection title="Belasting en interferentie">
        <AdRunImpact impact={d.impact} />
      </AdSection>
    )

    const runAiCard = <AdAiCard text={d.ai} loading={d.aiLoading} />

    if (layout === 'desktop') {
      return (
        <div className={s.desktop}>
          <AdHeader activity={d} onBack={onBack} layout="desktop" />
          <div className={s.metricRow}>
            <AdMetricStrip metrics={d.metrics} cols={Math.min(d.metrics.length, 8)} />
          </div>
          <div className={s.derivedRow}>
            <AdDerivedRow derived={d.derived} />
          </div>
          <div className={s.grid}>
            <div className={s.left}>
              {runRouteCard}
              {runChartCard}
              {runDistCard}
            </div>
            <div className={s.right}>
              {runZoneCard}
              {runDecouplingCard}
              {runCadenceCard}
              {runImpactCard}
              {runAiCard}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className={s.phone}>
        <AdHeader activity={d} onBack={onBack} layout="phone" />
        <div className={s.phoneFeed}>
          <Card radius={18} padding={14}>
            <AdMetricStrip metrics={d.metrics} cols={3} />
          </Card>
          <AdDerivedRow derived={d.derived} />
          {runRouteCard}
          {runChartCard}
          {runZoneCard}
          {runDecouplingCard}
          {runCadenceCard}
          {runDistCard}
          {runImpactCard}
          {runAiCard}
        </div>
      </div>
    )
  }

  // ── Gedeelde kaarten ────────────────────────────────────────────────────────

  const routeCard = d.gpsTrackRaw && (
    <AdSection title="Ritprofiel" sub={d.metrics[0] ? `${d.metrics[0].v} ${d.metrics[0].u}` : ''}>
      <AdRouteMap
        gpsTrack={d.gpsTrackRaw}
        hoverT={hoverT}
        selection={selection}
        theme={theme}
      />
    </AdSection>
  )

  const chartCard = (d.powerRaw || d.hrRaw) && (
    <AdSection title="Vermogen & hartslag" sub="over de hele activiteit">
      <AdDualChart
        power={d.powerRaw}
        hr={d.hrRaw}
        ftp={d.ftp}
        durationMin={d.durationMin}
        hoverT={hoverT}
        selection={selection}
        onHover={handleHover}
        onSelect={handleSelect}
        w={layout === 'desktop' ? 620 : 520}
      />
    </AdSection>
  )

  const mmpCard = d.mmpCurveFull && (
    <AdSection title="Mean Maximal Power" sub="klik op de curve om een piekvenster te selecteren">
      <AdMmpChart
        mmpCurveFull={d.mmpCurveFull}
        mmpBestFull={d.mmpBestFull}
        power={d.powerRaw}
        onSelect={handleSelect}
        w={layout === 'desktop' ? 620 : 520}
      />
    </AdSection>
  )

  const distCard = d.dist && (
    <AdSection title="Distributies" sub="tijd per waarde">
      <AdDistributions dist={d.dist} />
    </AdSection>
  )

  const analyseCard = d.scatter && d.quadrant && d.drift && (
    <AdSection title="Analyse">
      <AdAnalysis
        scatter={d.scatter}
        quadrant={d.quadrant}
        drift={d.drift}
        cadence={d.cadence?.avg}
        ftp={d.ftp}
        layout={layout}
      />
    </AdSection>
  )

  const wbalCard = d.wbal && d.series && (
    <AdSection title="W'bal" sub="Skiba 2014/2015 model">
      <AdWbal
        wbalData={d.wbal}
        powerSeries={d.series.primary.values}
        durationMin={d.durationMin}
        xLabels={d.series.xLabels}
        w={layout === 'desktop' ? 620 : 520}
      />
    </AdSection>
  )

  const zoneCard = d.zones && (
    <AdSection title="Zoneverdeling" sub="op basis van vermogen">
      <AdZoneBar zones={d.zones} />
    </AdSection>
  )

  const decouplingCard = d.decoupling && (
    <AdSection title="Aerobe koppeling">
      <AdDecoupling dc={d.decoupling} vi={vi} />
    </AdSection>
  )

  const planCard = d.planned && d.zones && (
    <AdSection title="Gepland vs werkelijk">
      <AdPlanCompare activity={d} />
    </AdSection>
  )

  const blocksCard = d.planned?.blocks?.length > 0 && d.zones && (
    <AdSection title="Geplande sessie">
      <AdPlannedBlocks planned={d.planned} zones={d.zones} />
    </AdSection>
  )

  const cadenceCard = d.cadence && (
    <AdSection title="Hartslag & cadans">
      <AdCadenceCard activity={d} />
    </AdSection>
  )

  const contextCard = d.context && (
    <AdSection title="Context & interferentie" sub="cross-modaal">
      <AdContext context={d.context} />
    </AdSection>
  )

  const aiCard = <AdAiCard text={d.ai} loading={d.aiLoading} />

  // ── Desktop-layout ─────────────────────────────────────────────────────────
  if (layout === 'desktop') {
    return (
      <div className={s.desktop}>
        <AdHeader activity={d} onBack={onBack} layout="desktop" />
        <div className={s.metricRow}>
          <AdMetricStrip metrics={d.metrics} cols={Math.min(d.metrics.length, 8)} />
        </div>
        <div className={s.derivedRow}>
          <AdDerivedRow derived={d.derived} />
        </div>
        <div className={s.grid}>
          {/* Linkerkolom: brede kant */}
          <div className={s.left}>
            {routeCard}
            {chartCard}
            {mmpCard}
            {wbalCard}
            {distCard}
            {analyseCard}
          </div>
          {/* Rechterkolom: smalle kant */}
          <div className={s.right}>
            {zoneCard}
            {decouplingCard}
            {planCard}
            {blocksCard}
            {cadenceCard}
            {contextCard}
            {aiCard}
          </div>
        </div>
      </div>
    )
  }

  // ── Telefoon-layout (volgorde per spec) ────────────────────────────────────
  return (
    <div className={s.phone}>
      <AdHeader activity={d} onBack={onBack} layout="phone" />
      <div className={s.phoneFeed}>
        <Card radius={18} padding={14}>
          <AdMetricStrip metrics={d.metrics} cols={3} />
        </Card>
        <AdDerivedRow derived={d.derived} />
        {routeCard}
        {chartCard}
        {zoneCard}
        {decouplingCard}
        {mmpCard}
        {cadenceCard}
        {planCard}
        {blocksCard}
        {distCard}
        {analyseCard}
        {wbalCard}
        {contextCard}
        {aiCard}
      </div>
    </div>
  )
}
