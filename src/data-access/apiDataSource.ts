/**
 * API CAPSTONE MODE: React → FastAPI → PostgreSQL.
 *
 * Reads the persisted synthetic demonstration data through the read-only
 * LabSentinel API and maps it into the same frontend domain objects the local
 * source produces. Mapping rules, all checked rather than assumed:
 *
 * - Positivity is the exact ratio of the persisted counts (the prototype's own
 *   definition); the API's two-decimal positivity_rate must agree with it.
 * - Affected facilities are the facilities whose surveillance area is among
 *   the persisted affected geographies; their number must equal the persisted
 *   affected_facilities count.
 * - Observation times are the API's local wall-clock times (it returns them
 *   with the simulation zone's offset); the simulation day is their date.
 */
import type {
  ConfidenceLevel,
  Hospital,
  HospitalId,
  LabObservation,
  ObservationPage,
  ObservationQuery,
  ObservationResult,
  Severity,
  SimulationDay,
  SimulationScenario,
  SurveillanceDay,
  VendorName,
} from '../types';
import { FIRST_DAY, LAST_DAY, SIMULATION_START_DATE } from '../data/simulation';
import { LAB_TESTS } from '../data/tests';
import { ApiError, createApiClient, type FetchLike, type QueryParams } from './apiClient';
import {
  parseDemoDays,
  parseDemoSummary,
  parseFacilities,
  parseFacility,
  parseObservation,
  parseObservationPage,
  parseSignal,
  parseSignals,
  type ApiDemoSummary,
  type ApiFacility,
  type ApiObservation,
  type ApiSignal,
} from './apiSchemas';
import type { BackendHealth, LabSentinelDataSource, SignalValues } from './types';

const SEVERITIES: Severity[] = ['Low', 'Watch', 'Moderate', 'High', 'Critical'];
const CONFIDENCE_LEVELS: ConfidenceLevel[] = ['Very High', 'High', 'Moderate', 'Low'];
const RESULTS: ObservationResult[] = ['Positive', 'Negative'];

const SORT_PARAM: Record<ObservationQuery['sortKey'], string> = {
  effectiveDateTime: 'effective_datetime',
  hospitalName: 'facility_name',
  vendor: 'vendor',
  patientId: 'patient_reference',
  result: 'result',
  testName: 'test_name',
};

const invalid = (message: string): never => {
  throw new ApiError('invalid-response', message);
};

const MS_PER_DAY = 86_400_000;

/** Calendar date "YYYY-MM-DD..." as a UTC midnight timestamp (no zone drift). */
const utcMidnight = (isoDate: string): number => {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  return Date.UTC(year, month - 1, day);
};

const START_UTC = utcMidnight(SIMULATION_START_DATE);

/** Simulation day for a calendar date: the start date is Day 1. */
const dayFromDate = (isoDate: string): SimulationDay => {
  const day = Math.round((utcMidnight(isoDate) - START_UTC) / MS_PER_DAY) + FIRST_DAY;
  if (!Number.isInteger(day) || day < FIRST_DAY || day > LAST_DAY) {
    invalid(`Date ${isoDate} is outside the simulation calendar.`);
  }
  return day as SimulationDay;
};

const toFacility = (api: ApiFacility): Hospital => {
  if (api.postal_code === null || api.subregion === null) {
    invalid(`Facility ${api.facility_code} has no postal code or subregion.`);
  }
  return {
    id: api.facility_code as HospitalId,
    name: api.name,
    vendor: api.vendor as VendorName,
    zipCode: api.postal_code as string,
    city: api.city,
    county: api.subregion as string,
    state: api.region,
    // The prototype's label for a fictional facility's simulated environment.
    environmentLabel: `Simulated ${api.vendor} Environment`,
  };
};

type SignalLike = Pick<
  ApiSignal,
  | 'test_volume'
  | 'positive_count'
  | 'positivity_rate'
  | 'affected_facilities'
  | 'affected_geographies'
  | 'persistence_days'
  | 'composite_score'
  | 'severity'
  | 'data_confidence_score'
  | 'data_confidence_level'
>;

export const createApiDataSource = (
  baseUrl: string,
  fetchImpl?: FetchLike,
): LabSentinelDataSource => {
  const client = createApiClient(baseUrl, fetchImpl);
  const get = (path: string, params?: QueryParams, signal?: AbortSignal) =>
    client.getJson(path, params, signal);

  // Facilities are needed to map signals and observations; loaded once and
  // shared, and forgotten again if loading fails so a retry starts clean.
  // The shared request deliberately ignores any one caller's AbortSignal:
  // cancelling one caller must not cancel it for every other caller that is
  // waiting on the same promise. (The client's timeout still applies.)
  let facilitiesPromise: Promise<{ list: Hospital[]; byApiId: Map<number, Hospital>; apiIdByCode: Map<string, number> }> | null = null;
  const facilities = (_signal?: AbortSignal) => {
    if (!facilitiesPromise) {
      facilitiesPromise = get('/api/facilities')
        .then(parseFacilities)
        .then((rows) => ({
          list: rows.map(toFacility),
          byApiId: new Map(rows.map((row) => [row.id, toFacility(row)])),
          apiIdByCode: new Map(rows.map((row) => [row.facility_code, row.id])),
        }));
      facilitiesPromise.catch(() => {
        facilitiesPromise = null;
      });
    }
    return facilitiesPromise;
  };

  const toValues = (
    api: SignalLike,
    date: string,
    facilityList: Hospital[],
    where: string,
  ): SignalValues => {
    const positivityRate =
      api.test_volume === 0 ? 0 : (api.positive_count / api.test_volume) * 100;
    if (Math.abs(positivityRate - api.positivity_rate) > 0.005 + 1e-9) {
      invalid(`${where}: positivity ${api.positivity_rate}% does not match ${api.positive_count}/${api.test_volume}.`);
    }
    const affectedHospitals = api.affected_geographies.map((zip) => {
      const facility = facilityList.find((item) => item.zipCode === zip);
      if (!facility) return invalid(`${where}: no facility for affected area ${zip}.`);
      return facility.id;
    });
    if (affectedHospitals.length !== api.affected_facilities) {
      invalid(`${where}: ${api.affected_facilities} affected facilities but ${affectedHospitals.length} affected areas.`);
    }
    if (!SEVERITIES.includes(api.severity as Severity)) invalid(`${where}: unknown severity ${api.severity}.`);
    if (api.data_confidence_level !== null && !CONFIDENCE_LEVELS.includes(api.data_confidence_level as ConfidenceLevel)) {
      invalid(`${where}: unknown confidence level ${api.data_confidence_level}.`);
    }
    return {
      scenario: {
        day: dayFromDate(date),
        simulationDate: date,
        totalTests: api.test_volume,
        totalPositives: api.positive_count,
        positivityRate,
        affectedHospitals,
        affectedZipCodes: [...api.affected_geographies],
        persistenceDays: api.persistence_days,
      },
      compositeScore: api.composite_score,
      severity: api.severity as Severity,
      dataConfidenceScore: api.data_confidence_score,
      dataConfidenceLevel: api.data_confidence_level as ConfidenceLevel | null,
    };
  };

  const toDay = (summary: ApiDemoSummary, facilityList: Hospital[]): SurveillanceDay => {
    const values = toValues(summary, summary.simulation_date, facilityList, `day ${summary.day}`);
    if (values.scenario.day !== summary.day) {
      invalid(`Day ${summary.day} is dated ${summary.simulation_date}.`);
    }
    const scenario: SimulationScenario = {
      ...values.scenario,
      stage: summary.stage,
      description: summary.description,
    };
    return { ...values, scenario };
  };

  const toObservation = (api: ApiObservation, byApiId: Map<number, Hospital>): LabObservation => {
    const facility = byApiId.get(api.facility_id);
    if (!facility) return invalid(`Observation ${api.source_observation_id} has an unknown facility.`);
    if (!RESULTS.includes(api.result_value as ObservationResult)) {
      invalid(`Observation ${api.source_observation_id} has result ${api.result_value}.`);
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(api.effective_datetime)) {
      invalid(`Observation ${api.source_observation_id} has time ${api.effective_datetime}.`);
    }
    return {
      resourceType: 'Observation',
      id: api.source_observation_id,
      status: api.status as LabObservation['status'],
      day: dayFromDate(api.effective_datetime),
      hospitalId: facility.id,
      hospitalName: facility.name,
      vendor: facility.vendor,
      syndrome: api.syndrome,
      testName: api.test_name,
      loincCode: api.loinc_code,
      result: api.result_value as ObservationResult,
      // Wall-clock time in the simulation's zone, as the prototype shows it.
      effectiveDateTime: api.effective_datetime.slice(0, 19),
      zipCode: api.geographic_unit,
      county: facility.county,
      state: facility.state,
      patientId: api.patient_reference,
      // Persisted records are received and stored LOINC-coded (normalized).
      fhirStatus: 'Received',
      normalized: true,
    };
  };

  const observationParams = (
    query: ObservationQuery,
    apiIdByCode: Map<string, number>,
  ): QueryParams | null => {
    const params: QueryParams = {};
    if (query.scope === 'today') params.day = query.currentDay;
    else params.through_day = query.currentDay;
    if (query.day !== 'all') {
      // "Day N only" combined with a different day filter can match nothing.
      if (query.scope === 'today' && Number(query.day) !== query.currentDay) return null;
      params.day = Number(query.day);
    }
    if (query.hospitalId !== 'all') {
      const id = apiIdByCode.get(query.hospitalId);
      if (id === undefined) return null;
      params.facility_id = id;
    }
    if (query.vendor !== 'all') params.vendor = query.vendor;
    if (query.result !== 'all') params.result = query.result;
    if (query.testName !== 'all') {
      const test = LAB_TESTS.find((item) => item.name === query.testName);
      if (!test) return null;
      params.loinc_code = test.loincCode;
    }
    const term = query.search.trim();
    if (term) params.q = term;
    params.sort = SORT_PARAM[query.sortKey];
    params.order = query.sortDirection;
    return params;
  };

  const countOf = async (params: QueryParams, signal?: AbortSignal) =>
    parseObservationPage(await get('/api/observations', { ...params, limit: 1 }, signal)).total;

  return {
    mode: 'api',
    label: baseUrl,

    async getFacilities(signal) {
      return (await facilities(signal)).list;
    },

    async getFacility(id, signal) {
      const { apiIdByCode } = await facilities(signal);
      const apiId = apiIdByCode.get(id);
      if (apiId === undefined) return undefined;
      try {
        return toFacility(parseFacility(await get(`/api/facilities/${apiId}`, undefined, signal)));
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return undefined;
        throw error;
      }
    },

    async getObservations(query, signal) {
      const { byApiId, apiIdByCode } = await facilities(signal);
      const [dayCount, cumulativeCount] = await Promise.all([
        countOf({ day: query.currentDay }, signal),
        countOf({ through_day: query.currentDay }, signal),
      ]);
      const params = observationParams(query, apiIdByCode);
      const empty: ObservationPage = { rows: [], total: 0, page: 1, totalPages: 1, dayCount, cumulativeCount };
      if (params === null) return empty;

      const fetchPage = async (page: number) =>
        parseObservationPage(
          await get(
            '/api/observations',
            { ...params, limit: query.pageSize, offset: (page - 1) * query.pageSize },
            signal,
          ),
        );

      let page = Math.max(1, query.page);
      let result = await fetchPage(page);
      const totalPages = Math.max(1, Math.ceil(result.total / query.pageSize));
      if (page > totalPages) {
        // Clamp to the last page, as the table always has.
        page = totalPages;
        result = await fetchPage(page);
      }
      return {
        rows: result.items.map((item) => toObservation(item, byApiId)),
        total: result.total,
        page,
        totalPages,
        dayCount,
        cumulativeCount,
      };
    },

    async getObservation(id, signal) {
      const { byApiId } = await facilities(signal);
      const page = parseObservationPage(await get('/api/observations', { q: id, limit: 500 }, signal));
      const match = page.items.find((item) => item.source_observation_id === id);
      if (!match) return undefined;
      return toObservation(parseObservation(await get(`/api/observations/${match.id}`, undefined, signal)), byApiId);
    },

    async getSignals(signal) {
      const [{ list }, rawSignals, rawDays] = await Promise.all([
        facilities(signal),
        get('/api/signals', undefined, signal),
        get('/api/demo/days', undefined, signal),
      ]);
      const signals = parseSignals(rawSignals);
      return parseDemoDays(rawDays).map((demoDay) => {
        const persisted = signals.find((item) => item.id === demoDay.signal_id);
        if (!persisted) return invalid(`Day ${demoDay.day} points at a missing signal.`);
        // The day's narrative with the signal history's values.
        return toDay({ ...demoDay, ...persisted, day: demoDay.day, simulation_date: persisted.signal_date }, list);
      });
    },

    async getCurrentSignal(day, signal) {
      const { list } = await facilities(signal);
      const api = parseSignal(await get('/api/signals/current', { day }, signal), '/api/signals/current');
      return toValues(api, api.signal_date, list, `/api/signals/current?day=${day}`);
    },

    async getDemoSummary(day, signal) {
      const { list } = await facilities(signal);
      const summary = parseDemoSummary(await get('/api/demo/summary', { day }, signal));
      if (summary.day !== day) invalid(`Asked for day ${day}, received day ${summary.day}.`);
      return toDay(summary, list);
    },

    async checkHealth(signal): Promise<BackendHealth> {
      const checkedAt = new Date();
      try {
        const health = await get('/api/health', undefined, signal);
        if ((health as { status?: unknown })?.status !== 'healthy') {
          return { api: 'unavailable', database: 'unknown', checkedAt };
        }
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        return { api: 'unavailable', database: 'unknown', checkedAt };
      }
      try {
        await get('/api/health/database', undefined, signal);
        return { api: 'connected', database: 'connected', checkedAt };
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        return { api: 'connected', database: 'unavailable', checkedAt };
      }
    },
  };
};
