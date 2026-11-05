/**
 * The ProbeSyQ Signal navigation, organised around the Public Health
 * Analyst's workflow: what is happening (Overview), where and why
 * (Surveillance), and what to do about it (Action).
 *
 * Technical capabilities (FHIR ingestion, the detection methods' internals,
 * the SMART sandbox, validation, architecture) stay available under System,
 * apart from the analyst workflow. That separation is organisational only:
 * there is no role-based access control, and nothing here is protected.
 */

export interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** Short explanation, used as the link's title. */
  hint?: string;
}

export interface NavSection {
  heading: string;
  items: NavItem[];
}

/** The analyst workflow. The same in every build. */
export const ANALYST_SECTIONS: NavSection[] = [
  {
    heading: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: '▦' },
      { to: '/simulation', label: 'Simulation', icon: '▶' },
    ],
  },
  {
    heading: 'Surveillance',
    items: [
      { to: '/map', label: 'Outbreak Map', icon: '◎' },
      { to: '/signals', label: 'Signals', icon: '⚠' },
      { to: '/facilities', label: 'Facilities', icon: '⌂' },
      { to: '/laboratory-data', label: 'Laboratory Data', icon: '≡' },
      { to: '/analytics', label: 'Analytics', icon: '◫' },
    ],
  },
  {
    heading: 'Action',
    items: [
      { to: '/investigations', label: 'Investigations', icon: '⌕' },
      { to: '/reports', label: 'Reports', icon: '▤' },
    ],
  },
];

interface SystemItem extends NavItem {
  /** What the page needs to do anything: the API backend, or the SMART build flag. */
  requires?: 'api' | 'smart';
}

const SYSTEM_ITEMS: SystemItem[] = [
  { to: '/fhir-ingestion', label: 'Data Ingestion', icon: '⇄', hint: 'FHIR R4 laboratory ingestion (development)', requires: 'api' },
  { to: '/dynamic-surveillance', label: 'Detection Methods', icon: '∿', hint: 'Dynamic surveillance, EWMA and CUSUM in detail', requires: 'api' },
  { to: '/smart-demo', label: 'Integration Testing', icon: '⚿', hint: 'SMART on FHIR sandbox launch', requires: 'smart' },
  { to: '/evaluation', label: 'Validation', icon: '⚖', hint: 'Method evaluation on synthetic scenarios', requires: 'api' },
  { to: '/architecture', label: 'Architecture', icon: '⊞', hint: 'How ProbeSyQ Signal is built, and what is planned' },
  { to: '/overview', label: 'Project Overview', icon: '◈', hint: 'Workflow, routes and build status' },
];

export const SYSTEM_HEADING = 'System';

/**
 * The System entries this build can use. Pages that need the API or the
 * SMART sandbox are listed only when the build has them; their routes still
 * answer with an explanatory notice otherwise.
 */
export const systemItems = (mode: 'local' | 'api', smartEnabled: boolean): NavItem[] =>
  SYSTEM_ITEMS.filter((item) => (item.requires === 'api' ? mode === 'api' : item.requires === 'smart' ? smartEnabled : true));

/** Every System route, whichever build is running. */
export const SYSTEM_ROUTES = SYSTEM_ITEMS.map((item) => item.to);

export const isSystemPath = (pathname: string): boolean =>
  SYSTEM_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
