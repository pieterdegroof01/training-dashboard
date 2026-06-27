import { AdHeader } from './components/AdHeader.jsx'
import { AdMetricStrip } from './components/AdMetricStrip.jsx'
import { AdDerivedRow } from './components/AdDerivedRow.jsx'
import { AdSection } from './components/AdSection.jsx'
import { AdRouteMap } from './components/AdRouteMap.jsx'
import { AdDualChart } from './components/AdDualChart.jsx'
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
import { Card } from './components/Card.jsx'
import s from './ActivityDetailView.module.css'

export function ActivityDetailView({ activity, onBack, layout = 'desktop' }) {
  const d = activity
  const vi = d.derived.find((x) => x.l === 'VI')?.v

  // ── Gedeelde kaarten ────────────────────────────────────────────────────────

  const routeCard = (
    <AdSection title="Ritprofiel" sub={`${d.metrics[0].v} ${d.metrics[0].u}`}>
      <AdRouteMap route={d.route} />
    </AdSection>
  )

  const chartCard = d.series && (
    <AdSection title="Vermogen & hartslag" sub="over de hele activiteit">
      <AdDualChart series={d.series} w={layout === 'desktop' ? 620 : 520} />
    </AdSection>
  )

  const mmpCard = d.mmp && (
    <AdSection title="Mean Maximal Power" sub="deze rit vs 90-dagen best">
      <AdMmpChart mmp={d.mmp} w={layout === 'desktop' ? 620 : 520} />
    </AdSection>
  )

  const distCard = d.dist && (
    <AdSection title="Distributies" sub="tijd per waarde">
      <AdDistributions dist={d.dist} />
    </AdSection>
  )

  const analyseCard = d.scatter && (
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

  const wbalCard = d.wbal && (
    <AdSection title="W'bal" sub="Skiba 2014/2015 model">
      <AdWbal
        wbalData={d.wbal}
        powerSeries={d.series.primary.values}
        w={layout === 'desktop' ? 620 : 520}
      />
    </AdSection>
  )

  const zoneCard = (
    <AdSection title="Zoneverdeling" sub="op basis van vermogen">
      <AdZoneBar zones={d.zones} />
    </AdSection>
  )

  const decouplingCard = d.decoupling && (
    <AdSection title="Aerobe koppeling">
      <AdDecoupling dc={d.decoupling} vi={vi} />
    </AdSection>
  )

  const planCard = d.planned && (
    <AdSection title="Gepland vs werkelijk">
      <AdPlanCompare activity={d} />
    </AdSection>
  )

  const blocksCard = d.planned?.blocks && (
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

  const aiCard = <AdAiCard text={d.ai} />

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
