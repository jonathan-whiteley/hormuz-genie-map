import { useMemo, useState, type ReactNode } from 'react';
import {
  disruptedCount,
  fmtNum,
  fmtPct,
  gulfVisibility,
  hormuzOn,
  noDataCount,
  recOn,
  riskSources,
  volumeAtRisk,
} from '../data/kpi';
import type { Dataset } from '../data/types';
import { RecChip } from '../decisions/RecChip';
import { Sparkline } from '../decisions/Sparkline';
import { recSeries } from '../decisions/series';
import { indexOf, lanesOnIdx, onOrBefore, visibilityOn, type LayerToggles, type Vessel } from '../map/layers';
import { fmtDate, fmtShort } from './dates';
import { genieStatus, useAppConfig } from '../lib/appConfig';

const VESSELS: { id: Vessel; label: string }[] = [
  { id: 'total', label: 'Total' },
  { id: 'tanker', label: 'Tanker' },
  { id: 'container', label: 'Container' },
  { id: 'dry_bulk', label: 'Dry bulk' },
];

const TOGGLES: { key: keyof LayerToggles; label: string }[] = [
  { key: 'chokepoints', label: 'Chokepoints' },
  { key: 'ports', label: 'Ports' },
  { key: 'lanes', label: 'Supply lanes' },
  { key: 'aisCells', label: 'AIS cells' },
  { key: 'regions', label: 'AIS regions' },
  { key: 'genie', label: 'Genie answers' },
];

const heading = {
  fontSize: '0.75rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
  margin: 0,
  color: 'var(--gray-700)',
};

const selectStyle = {
  width: '100%',
  font: 'inherit',
  fontSize: '0.875rem',
  padding: '5px 8px',
  borderRadius: 8,
  border: '1px solid var(--gray-300)',
  background: 'var(--white)',
  color: 'var(--navy-900)',
};

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
const fmtCompact = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? 'no data' : compact.format(v));

/** Compact KPI tile for the 2x2 grid: label, value, optional sub-line and a source note. */
function Kpi({ label, value, sub, note }: { label: string; value: ReactNode; sub?: ReactNode; note: string }) {
  return (
    <div
      style={{
        background: 'var(--white)',
        border: '1px solid var(--gray-300)',
        borderRadius: 8,
        padding: '8px 10px',
        display: 'grid',
        alignContent: 'start',
        gap: 1,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: '0.75rem', color: 'var(--gray-700)', lineHeight: 1.25 }}>{label}</div>
      <div style={{ fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.25 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', lineHeight: 1.3 }}>{sub}</div>}
      <div style={{ fontSize: '0.6875rem', color: 'var(--gray-500)', lineHeight: 1.3 }}>{note}</div>
    </div>
  );
}

interface Props {
  dataset: Dataset;
  date: string;
  start: string;
  end: string;
  vessel: Vessel;
  onVessel: (v: Vessel) => void;
  toggles: LayerToggles;
  onToggles: (t: LayerToggles) => void;
  laneId?: string;
  onLane?: (id: string) => void;
}

export function LeftRail({ dataset, date, start, end, vessel, onVessel, toggles, onToggles, laneId, onLane }: Props) {
  const hz = hormuzOn(dataset.chokepoints, date, vessel);
  const lanes = lanesOnIdx(dataset, date);
  const risk = volumeAtRisk(lanes);
  const disrupted = disruptedCount(lanes);
  const noData = noDataCount(lanes);
  const noDataNote = noData > 0 ? ` (${noData} ${noData === 1 ? 'lane' : 'lanes'} no data)` : '';
  const vis = gulfVisibility(dataset.visibility, date);
  const laneIds = useMemo(
    () =>
      [...new Map(dataset.lanes.map((l) => [l.lane_id, l.lane])).entries()].sort((a, b) => a[0].localeCompare(b[0])),
    [dataset.lanes]
  );
  const [ownLane, setOwnLane] = useState<string | undefined>(undefined);
  const selLane = laneId ?? ownLane ?? laneIds[0]?.[0];
  const setLane = onLane ?? setOwnLane;
  const series = useMemo(() => (selLane ? recSeries(dataset.recs, selLane) : []), [dataset.recs, selLane]);
  const vLabel = VESSELS.find((v) => v.id === vessel)?.label ?? 'Total';
  // Notes show the date of the row actually used (data can end before the selected date).
  const hzDate = onOrBefore(indexOf(dataset).chokepoints.get('Strait of Hormuz') ?? [], date)?.date;
  const laneDate = lanes.reduce<string | null>((m, l) => (m == null || l.date > m ? l.date : m), null);
  const visHour = visibilityOn(dataset, 'gulf_hormuz', date)?.sample_hour;
  const on = (d: string | null | undefined) => (d ? fmtShort(d) : 'none yet');
  const genieOff = genieStatus(useAppConfig()) === 'off';

  return (
    <aside
      aria-label="Layers and KPIs"
      style={{
        background: 'var(--light)',
        borderRight: '1px solid var(--gray-300)',
        padding: '12px var(--space-2)',
        overflowY: 'auto',
        overflowX: 'hidden',
        minWidth: 0,
        minHeight: 0,
        display: 'grid',
        alignContent: 'start',
        gap: 14,
      }}
    >
      <section style={{ display: 'grid', gap: 6 }}>
        <h2 style={heading}>Layers</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px' }}>
          {TOGGLES.map((t) => {
            const disabled = t.key === 'genie' && genieOff;
            return (
              <label
                key={t.key}
                title={disabled ? 'Genie is not configured for this app' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: '0.875rem',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  color: disabled ? 'var(--gray-500)' : undefined,
                }}
              >
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={!disabled && toggles[t.key]}
                  onChange={(e) => onToggles({ ...toggles, [t.key]: e.target.checked })}
                  style={{ accentColor: 'var(--navy-900)', width: 15, height: 15 }}
                />
                {disabled ? 'Genie (not configured)' : t.label}
              </label>
            );
          })}
        </div>
        <label
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            alignItems: 'center',
            gap: 8,
            fontSize: '0.875rem',
          }}
        >
          <span style={{ color: 'var(--gray-700)' }}>Vessel type</span>
          <select value={vessel} onChange={(e) => onVessel(e.target.value as Vessel)} style={selectStyle}>
            {VESSELS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section style={{ display: 'grid', gap: 6 }}>
        <h2 style={heading}>On {fmtDate(date)}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <Kpi
            label="Hormuz transits"
            value={fmtNum(hz.transits7d, 1)}
            sub={`${fmtPct(hz.pctBaseline)} of pre-war baseline`}
            note={`7-day avg, ${vLabel.toLowerCase()}; PortWatch, ${on(hzDate)}`}
          />
          <Kpi
            label="Lanes disrupted"
            value={disrupted == null ? 'no data' : `${disrupted} of ${lanes.length}`}
            note={`Demo lanes, ${on(laneDate)}${noDataNote}`}
          />
          <Kpi
            label="Volume at risk"
            value={risk.tonnes == null ? 'no data' : `${fmtCompact(risk.tonnes)} t`}
            sub={lanes.length ? (risk.teu == null ? 'TEU: no data' : `${fmtCompact(risk.teu)} TEU`) : undefined}
            note={lanes.length ? `${riskSources(lanes)}${noDataNote}` : 'no lane data'}
          />
          <Kpi
            label="Gulf AIS visibility"
            value={vis == null ? 'no data' : fmtPct(100 * vis)}
            sub={vis == null ? undefined : 'of control density'}
            note={`Visibility, not traffic; ${visHour ? `${visHour.slice(11, 16)} UTC ${on(visHour)}` : 'none yet'}`}
          />
        </div>
      </section>

      {dataset.recsAvailable && laneIds.length > 0 && (
        <section style={{ display: 'grid', gap: 6 }}>
          <h2 style={heading}>Lane recommendation</h2>
          <select aria-label="Lane" value={selLane} onChange={(e) => setLane(e.target.value)} style={selectStyle}>
            {laneIds.map(([id, name]) => (
              <option key={id} value={id}>
                {id}: {name}
              </option>
            ))}
          </select>
          {selLane && <RecChip rec={recOn(dataset.recs, selLane, date)} />}
          <Sparkline series={series} start={start} end={end} date={date} />
          <div style={{ fontSize: '0.6875rem', color: 'var(--gray-500)' }}>
            P(top action), weekly. Calibrated by ai_decide; untuned demo thresholds.
          </div>
        </section>
      )}
    </aside>
  );
}
