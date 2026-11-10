import { PROFILE_TYPE_LABEL, type SurveillanceProfile } from '../../lib/profiles/registry';

/**
 * A profile's type in words — Aggregate (several tests combined) or Pathogen
 * (one pathogen's tests) — never by colour alone. The title carries the
 * fuller descriptor ("Aggregate respiratory surveillance").
 */
export default function ProfileTypeTag({ profile, className = '' }: { profile: SurveillanceProfile; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border border-hairline bg-canvas px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.05em] text-ink ${className}`}
      title={profile.typeDescriptor}
      data-testid="profile-type"
    >
      {PROFILE_TYPE_LABEL[profile.type]}
      <span className="sr-only"> profile — {profile.typeDescriptor}</span>
    </span>
  );
}
