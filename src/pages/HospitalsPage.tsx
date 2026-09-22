import { useState } from 'react';
import { useSimulation } from '../context/SimulationContext';
import { HOSPITALS } from '../data/hospitals';
import Card from '../components/common/Card';
import PageMeta from '../components/common/PageMeta';
import DataConfidenceCard from '../components/common/DataConfidenceCard';
import FeedHealthCard from '../components/common/FeedHealthCard';
import WhyThisSignalPanel from '../components/signals/WhyThisSignalPanel';
import { PrivacyDisclosure } from '../components/common/PrivacyValue';
import { getDisclosureSummary } from '../lib/geographicPrivacy';
import { ErrorState, LoadingState } from '../components/common/States';
import VendorSidecar from '../components/hospitals/VendorSidecar';
import FhirStatusPanel from '../components/hospitals/FhirStatusPanel';
import HospitalDashboard from '../components/hospitals/HospitalDashboard';
import type { HospitalId } from '../types';

/**
 * Each simulated environment gets a visually distinct but entirely generic
 * shell. None of these imitate a real vendor's proprietary interface.
 */
const ENVIRONMENT_THEMES: Record<
  HospitalId,
  { chromeClass: string; accentClass: string; moduleLabels: string[] }
> = {
  'HOSP-A': {
    chromeClass: 'bg-[#123A63]',
    accentClass: 'text-[#8FC0F0]',
    moduleLabels: ['Chart Review', 'Results', 'Orders', 'Notes'],
  },
  'HOSP-B': {
    chromeClass: 'bg-[#1F3B4D]',
    accentClass: 'text-[#7FD0C4]',
    moduleLabels: ['Patient Summary', 'Lab Results', 'Care Plan', 'Messages'],
  },
  'HOSP-C': {
    chromeClass: 'bg-[#2E2A47]',
    accentClass: 'text-[#B8AEE8]',
    moduleLabels: ['Worklist', 'Laboratory', 'Documentation', 'Inbox'],
  },
};

export default function HospitalsPage() {
  const {
    currentDay,
    currentScenario,
    signalScore,
    hospitalMetrics,
    dataConfidence,
    feedHealth,
    lastUpdated,
    isLoading,
    error,
    clearError,
  } = useSimulation();

  const [activeId, setActiveId] = useState<HospitalId>('HOSP-A');
  const activeHospital = HOSPITALS.find((hospital) => hospital.id === activeId) ?? HOSPITALS[0];
  const metrics =
    hospitalMetrics.find((item) => item.hospital.id === activeHospital.id) ??
    hospitalMetrics[0];
  const theme = ENVIRONMENT_THEMES[activeHospital.id];
  const activeFeed =
    feedHealth.find((feed) => feed.hospitalId === activeHospital.id) ?? feedHealth[0];

  if (error) {
    return (
      <Card>
        <ErrorState message={error} onRetry={clearError} />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Hospitals &amp; Vendor Sidecar
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            The simulated EHR shell changes for every vendor. The LabSentinel sidecar
            inside it does not — it is the same component rendered in all three.
          </p>
        </div>
        <PageMeta />
      </header>

      <div className="rounded-xl border border-hairline bg-white p-3 shadow-card">
        <p className="ls-label mb-2">Vendor Environment</p>
        <div
          role="tablist"
          aria-label="Simulated vendor environments"
          className="flex flex-wrap gap-2"
        >
          {HOSPITALS.map((hospital) => {
            const isActive = hospital.id === activeHospital.id;
            return (
              <button
                key={hospital.id}
                role="tab"
                type="button"
                aria-selected={isActive}
                onClick={() => setActiveId(hospital.id)}
                className={`rounded-lg border px-4 py-2 text-left transition-colors ${
                  isActive
                    ? 'border-brand bg-brand-light'
                    : 'border-hairline bg-white hover:bg-canvas'
                }`}
              >
                <span
                  className={`block text-sm font-semibold ${
                    isActive ? 'text-brand' : 'text-ink'
                  }`}
                >
                  {hospital.vendor}
                </span>
                <span className="block text-[11px] text-muted">
                  {hospital.name} · {hospital.zipCode}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {isLoading || !metrics ? (
        <Card>
          <LoadingState label="Synchronising simulated vendor environment…" />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            {/* Generic simulated EHR shell — deliberately not a vendor UI clone. */}
            <div className="ls-card overflow-hidden xl:col-span-2">
              <div className={`flex flex-wrap items-center gap-3 px-4 py-3 ${theme.chromeClass}`}>
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 items-center justify-center rounded bg-white/15 text-[11px] font-bold text-white"
                >
                  {activeHospital.vendor.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {activeHospital.environmentLabel}
                  </p>
                  <p className={`truncate text-[11px] ${theme.accentClass}`}>
                    Generic demonstration shell — not a reproduction of any vendor
                    interface
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1 border-b border-hairline bg-canvas px-4 py-2">
                {theme.moduleLabels.map((label, index) => (
                  <span
                    key={label}
                    className={`rounded px-2.5 py-1 text-[11px] font-medium ${
                      index === 1 ? 'bg-white text-ink shadow-card' : 'text-muted'
                    }`}
                  >
                    {label}
                  </span>
                ))}
              </div>

              <div className="p-5">
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <dt className="ls-label">Hospital</dt>
                    <dd className="mt-1 text-sm font-semibold text-ink">
                      {activeHospital.name}
                    </dd>
                  </div>
                  <div>
                    <dt className="ls-label">Vendor</dt>
                    <dd className="mt-1 text-sm font-semibold text-ink">
                      {activeHospital.vendor}
                    </dd>
                  </div>
                  <div>
                    <dt className="ls-label">ZIP</dt>
                    <dd className="mt-1 text-sm font-semibold tabular-nums text-ink">
                      {activeHospital.zipCode} · {activeHospital.city}, {activeHospital.state}
                    </dd>
                  </div>
                </dl>

                <div className="mt-5 rounded-lg border border-dashed border-hairline bg-canvas p-4">
                  <p className="text-xs leading-relaxed text-muted">
                    This panel stands in for the host EHR workspace. LabSentinel is
                    embedded beside it as a SMART-on-FHIR style sidecar and receives only
                    normalized, de-identified synthetic Observation resources — never
                    chart content, never patient identifiers beyond the synthetic
                    placeholders shown in this prototype.
                  </p>
                </div>
              </div>
            </div>

            {/* The SAME reusable sidecar renders in every environment. */}
            <div className="xl:col-span-1">
              <VendorSidecar
                scenario={currentScenario}
                score={signalScore}
                lastUpdated={lastUpdated}
                confidence={dataConfidence}
                feed={activeFeed}
              />
              <p className="mt-2 px-1 text-[11px] leading-snug text-muted">
                Rendered from a single shared <code className="font-mono">VendorSidecar</code>{' '}
                component — identical in all three simulated environments.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <DataConfidenceCard confidence={dataConfidence} />
            <FeedHealthCard
              feeds={activeFeed ? [activeFeed] : []}
              title={`${activeHospital.vendor} Feed Health`}
              className="xl:col-span-2"
            />
          </div>

          <WhyThisSignalPanel
            scenario={currentScenario}
            score={signalScore}
            confidence={dataConfidence}
            feeds={feedHealth}
            lastUpdated={lastUpdated}
          />

          <PrivacyDisclosure summary={getDisclosureSummary(currentDay)} />

          <FhirStatusPanel
            vendor={activeHospital.vendor}
            lastUpdated={lastUpdated}
            observationCount={metrics.cumulativeTests}
          />

          <HospitalDashboard
            metrics={metrics}
            lastUpdated={lastUpdated}
            currentDay={currentDay}
          />
        </>
      )}
    </div>
  );
}
