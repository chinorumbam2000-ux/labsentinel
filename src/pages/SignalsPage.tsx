import { useSearchParams } from 'react-router-dom';
import { useSimulation } from '../context/SimulationContext';
import Card from '../components/common/Card';
import PageMeta from '../components/common/PageMeta';
import SignalTable from '../components/signals/SignalTable';
import SignalInvestigation, {
  type InvestigationMode,
} from '../components/signals/SignalInvestigation';
import SeverityBadge from '../components/signals/SeverityBadge';
import { EmptyState, ErrorState, LoadingState } from '../components/common/States';
import { SIGNAL_DISCLAIMER } from '../lib/signalScore';
import { SCORE_DISCLAIMER_TEXT } from '../lib/brand';
import { formatPercent, formatSimulationDateTime } from '../lib/format';
import { findDetection } from '../lib/alerts';
import { useNavigate } from 'react-router-dom';
import MethodNote from '../components/common/MethodNote';
import { usePortfolio } from '../lib/profiles/usePortfolio';
import ProfileSelector from '../components/profiles/ProfileSelector';
import { PROFILE_BY_ID, RVS_PROFILE_ID } from '../lib/profiles/registry';
import { SEVERITY_RANK, findProfileDetection, type ProfileAlert } from '../lib/profiles/portfolio';
import { isScope } from '../lib/profiles/selection';
import ProfileInvestigationShell from '../components/profiles/ProfileInvestigationShell';

/**
 * Investigation context lives in the URL:
 *   ?alert=<id>             investigate that alert, at detection by default
 *   ?alert=<id>&view=current  ... but showing current conditions
 *   ?view=current           investigate current conditions with no alert
 *                           (the dashboard and map entry points)
 *
 * Keeping it in the URL is what makes refresh and browser back/forward restore
 * the right screen.
 */
const ALERT_PARAM = 'alert';
const VIEW_PARAM = 'view';

export default function SignalsPage() {
  const {
    currentDay,
    currentScenario,
    alerts,
    dataConfidence,
    feedHealth,
    dayOverDay,
    getInvestigation,
    runInvestigationAction,
    prepareReport,
    reports,
    acknowledgeAlert,
    isLoading,
    error,
    clearError,
  } = useSimulation();

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // The alert list follows the selected surveillance profile (?profile=):
  // Respiratory Viral Syndrome by default, exactly as before; "All profiles"
  // lists every profile's alerts together, each labelled with its profile.
  const portfolio = usePortfolio();
  const { selection, view } = portfolio;
  const alertParam = searchParams.get(ALERT_PARAM);
  const viewParam = searchParams.get(VIEW_PARAM);

  const keepProfile = (): Record<string, string> => {
    const profile = searchParams.get('profile');
    return profile ? { profile } : {};
  };
  const openList = () => setSearchParams(keepProfile());

  const openInvestigation = (alertId: string) => {
    // Detection-time is the default: the user clicked a specific historical alert.
    // The selected profile stays in the URL, so Back returns to the same list.
    const profile = searchParams.get('profile');
    setSearchParams({ ...(profile ? { profile } : {}), [ALERT_PARAM]: alertId, [VIEW_PARAM]: 'detection' });
  };

  const setMode = (mode: InvestigationMode) => {
    // Only the URL changes. The global simulation day, acknowledgements and the
    // stored alert history are all untouched.
    const next: Record<string, string> = { [VIEW_PARAM]: mode };
    if (alertParam) next[ALERT_PARAM] = alertParam;
    setSearchParams(next);
  };

  if (error) {
    return (
      <Card>
        <ErrorState message={error} onRetry={clearError} />
      </Card>
    );
  }

  const investigatingCurrentOnly = !alertParam && viewParam === 'current';
  const isInvestigating = Boolean(alertParam) || investigatingCurrentOnly;

  if (isInvestigating) {
    const selectedAlert = alertParam
      ? alerts.find((alert) => alert.id === alertParam)
      : undefined;

    // An alert reference we cannot honour: either it does not exist at all, or
    // it exists but has not been detected by the currently selected day.
    // An alert of another profile opens that profile's investigation shell —
    // never the Respiratory Viral Syndrome view. Its review workflow works as
    // for any alert; its detailed evidence view does not exist yet, and says so.
    const profileDetection = alertParam ? findProfileDetection(alertParam) : undefined;
    if (alertParam && !selectedAlert && profileDetection && profileDetection.profileId !== RVS_PROFILE_ID) {
      const profileName = PROFILE_BY_ID[profileDetection.profileId].displayName;
      const profileAlert = portfolio.alerts.find((alert) => alert.id === alertParam);
      if (!profileAlert) {
        return (
          <div className="space-y-5">
            <header>
              <h1 className="text-2xl font-semibold tracking-tight text-ink">Signal Investigation</h1>
            </header>
            <Card>
              <EmptyState
                icon="!"
                title="That alert has not been detected yet"
                message={`"${profileDetection.title}" (${profileName}) is first detected on replay Day ${profileDetection.detectedDay}. The replay is currently on Day ${currentDay}.`}
                action={
                  <button type="button" onClick={openList} className="ls-btn-primary">
                    Back to all signals
                  </button>
                }
              />
            </Card>
          </div>
        );
      }
      return (
        <div className="space-y-5">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink">Signal Investigation</h1>
              <p className="mt-1 max-w-3xl text-sm text-muted">{profileName} · review of a detected signal.</p>
            </div>
            <PageMeta />
          </header>
          <ProfileInvestigationShell
            alert={profileAlert}
            investigation={getInvestigation(profileAlert.id)}
            onAction={(action, note) => runInvestigationAction(profileAlert.id, action, note)}
            onPrepareReport={() => {
              const failure = prepareReport(profileAlert.id);
              if (!failure) navigate(`/reports?profile=${encodeURIComponent(profileAlert.profileId)}`);
              return failure;
            }}
            hasReport={reports.some((report) => report.alertId === profileAlert.id)}
            onBack={openList}
          />
        </div>
      );
    }

    if (alertParam && !selectedAlert) {
      const detection = findDetection(alertParam);
      return (
        <div className="space-y-5">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              Signal Investigation
            </h1>
          </header>
          <Card>
            <EmptyState
              icon="!"
              title={
                detection
                  ? 'That alert has not been detected yet'
                  : 'That alert could not be found'
              }
              message={
                detection
                  ? `"${detection.title}" is first detected on replay Day ${detection.detectedDay}. The replay is currently on Day ${currentDay}, so there is no detection-time breakdown to show. Advance to Day ${detection.detectedDay} or later, then investigate it from the alert list.`
                  : `No alert matches the reference "${alertParam}". It may be from an older session, or the link may be incomplete.`
              }
              action={
                <button type="button" onClick={openList} className="ls-btn-primary">
                  Back to all signals
                </button>
              }
            />
          </Card>
        </div>
      );
    }

    const mode: InvestigationMode = viewParam === 'current' ? 'current' : 'detection';

    return (
      <div className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              Signal Investigation
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted">
              How the composite outbreak signal score was calculated.
            </p>
          </div>
          <PageMeta />
        </header>
        <SignalInvestigation
          alert={selectedAlert}
          currentDay={currentDay}
          mode={mode}
          onModeChange={setMode}
          onBack={openList}
          confidence={dataConfidence}
          feeds={feedHealth}
          dayOverDay={dayOverDay}
          investigation={selectedAlert ? getInvestigation(selectedAlert.id) : undefined}
          onInvestigationAction={(action, note) =>
            selectedAlert
              ? runInvestigationAction(selectedAlert.id, action, note)
              : 'No signal selected.'
          }
          onPrepareReport={() => {
            if (!selectedAlert) return;
            const failure = prepareReport(selectedAlert.id);
            if (!failure) navigate('/reports');
          }}
          hasReport={
            selectedAlert
              ? reports.some((report) => report.alertId === selectedAlert.id)
              : false
          }
        />
      </div>
    );
  }

  const activeProfiles = new Set(
    portfolio.summaries.filter((s) => s.status === 'ACTIVE_SIGNAL').map((s) => s.profile.id),
  );
  const multiProfile = isScope(selection);
  const listAlerts: Array<ProfileAlert | (typeof alerts)[number]> =
    selection === RVS_PROFILE_ID
      ? alerts
      : multiProfile
        ? portfolio.alerts
            .filter((alert) => selection === 'all' || activeProfiles.has(alert.profileId))
            .sort(
              (a, b) =>
                SEVERITY_RANK[b.detection.severity] - SEVERITY_RANK[a.detection.severity] ||
                b.detectedDay - a.detectedDay ||
                PROFILE_BY_ID[a.profileId].displayName.localeCompare(PROFILE_BY_ID[b.profileId].displayName),
            )
        : portfolio.alerts.filter((alert) => alert.profileId === selection);
  const profileNames = multiProfile
    ? Object.fromEntries(portfolio.alerts.map((alert) => [alert.id, PROFILE_BY_ID[alert.profileId].displayName]))
    : undefined;
  const otherProfileAlerts = multiProfile ? 0 : portfolio.alerts.length - listAlerts.length;
  const unacknowledgedCount = listAlerts.filter((alert) => alert.status !== 'Acknowledged').length;
  const newTodayCount = listAlerts.filter((alert) => alert.detectedDay === currentDay).length;
  const acknowledged = listAlerts.filter((alert) => alert.status === 'Acknowledged');
  const focusScore = view.score;
  const focusScenario = view.isNarrated ? currentScenario : view.scenario;
  const nameOf = (alert: { id: string; title: string }) =>
    profileNames?.[alert.id] ? `${profileNames[alert.id]} — ${alert.title}` : alert.title;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Signals &amp; Alerts
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Each alert reports the values recorded when it was detected. Those values do
            not change as the replay advances — current regional figures are shown
            separately below.
          </p>
        </div>
        <PageMeta />
      </header>

      <div className="flex flex-col gap-1">
        <ProfileSelector portfolio={portfolio} />
        {otherProfileAlerts > 0 ? (
          <p className="text-xs text-muted">
            Showing {view.profile.displayName} alerts. {otherProfileAlerts} more{' '}
            {otherProfileAlerts === 1 ? 'alert belongs' : 'alerts belong'} to other profiles —{' '}
            <button
              type="button"
              onClick={() => portfolio.setSelection('all')}
              className="font-semibold text-brand hover:underline"
            >
              show all profiles
            </button>
            .
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="ls-card p-5">
          <p className="ls-label">Alerts awaiting acknowledgement</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
            {unacknowledgedCount}
          </p>
          <p className="mt-1 text-xs text-muted">
            of {listAlerts.length} detected through Day {currentDay}
          </p>
        </div>
        <div className="ls-card p-5">
          <p className="ls-label">Detected on this day</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
            {newTodayCount}
          </p>
          <p className="mt-1 text-xs text-muted">
            {acknowledged.length} acknowledged so far
          </p>
        </div>
        <div className="ls-card p-5">
          <p className="ls-label">Current composite score</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
            {focusScore ? focusScore.composite : '—'}
            {focusScore ? <span className="text-base font-medium text-muted"> / 100</span> : null}
          </p>
          <p className="mt-1 text-xs text-muted">
            {view.isNarrated ? '' : `${view.profile.displayName} · `}
            {focusScore ? `Severity: ${focusScore.severity}` : view.statusReason}
          </p>
        </div>
        <div className="ls-card p-5">
          <p className="ls-label">Current scope</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
            {focusScenario.affectedHospitals.length} / 3
          </p>
          <p className="mt-1 text-xs text-muted">
            facilities · {focusScenario.affectedZipCodes.length} surveillance areas
          </p>
        </div>
      </div>

      <Card
        title="Alert history"
        subtitle="Values are frozen at detection time. Investigate opens that alert's own detection-time breakdown."
        bodyClassName="p-0"
      >
        {isLoading ? (
          <LoadingState label="Loading alert history…" />
        ) : (
          <SignalTable
            alerts={listAlerts}
            onInvestigate={(alert) => openInvestigation(alert.id)}
            onAcknowledge={acknowledgeAlert}
            profileNames={profileNames}
            canReview={(alert) => 'profileId' in alert && alert.profileId !== RVS_PROFILE_ID}
            emptyMessage={
              selection === RVS_PROFILE_ID
                ? undefined
                : `No ${multiProfile ? '' : `${view.profile.displayName} `}alert has been raised through Day ${currentDay}.`
            }
          />
        )}
      </Card>

      {/* Current values kept explicitly separate from the frozen detection values. */}
      <Card
        title={`Current regional figures — ${view.isNarrated ? '' : `${view.profile.displayName}, `}Day ${currentDay}`}
        subtitle="Values for the selected replay day, shown separately from the detection-time values above"
        action={
          view.isNarrated ? (
          <button
            type="button"
            onClick={() => setSearchParams({ ...keepProfile(), [VIEW_PARAM]: 'current' })}
            className="ls-btn px-3 py-1.5 text-xs"
          >
            Investigate current conditions →
          </button>
          ) : undefined
        }
      >
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <div className="rounded-lg bg-canvas p-3">
            <dt className="ls-label">Tests</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
              {focusScenario.totalTests}
            </dd>
          </div>
          <div className="rounded-lg bg-canvas p-3">
            <dt className="ls-label">Positives</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
              {view.display.positives}
            </dd>
          </div>
          <div className="rounded-lg bg-canvas p-3">
            <dt className="ls-label">Positivity</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
              {view.display.regional.suppressed ? view.display.positivity : formatPercent(focusScenario.positivityRate)}
            </dd>
          </div>
          <div className="rounded-lg bg-canvas p-3">
            <dt className="ls-label">Composite score</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
              {focusScore ? `${focusScore.composite} / 100` : 'No score'}
            </dd>
          </div>
          <div className="rounded-lg bg-canvas p-3">
            <dt className="ls-label">Severity</dt>
            <dd className="mt-1.5">
              {focusScore ? <SeverityBadge severity={focusScore.severity} /> : <span className="text-sm text-muted">—</span>}
            </dd>
          </div>
        </dl>
      </Card>

      {acknowledged.length > 0 ? (
        <Card title="Acknowledgement log" bodyClassName="p-0">
          <ul className="divide-y divide-hairline">
            {acknowledged.map((alert) => (
              <li
                key={alert.id}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
              >
                <span className="text-sm text-ink">{nameOf(alert)}</span>
                <span className="text-xs text-muted">
                  Acknowledged on Day {alert.acknowledgement?.day} ·{' '}
                  {alert.acknowledgement
                    ? formatSimulationDateTime(alert.acknowledgement.simulationTime)
                    : ''}{' '}
                  (scenario time)
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="ls-card border-l-4 border-l-severity-critical p-5">
        <p className="text-sm font-semibold text-ink">{SIGNAL_DISCLAIMER}</p>
        <MethodNote className="mt-2">{SCORE_DISCLAIMER_TEXT}</MethodNote>
      </div>
    </div>
  );
}
