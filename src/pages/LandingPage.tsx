import { useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BrandMark from '../components/common/BrandMark';
import { useDemoSession } from '../context/DemoSessionContext';
import { DEMO_ROLE, NAME_MAX_LENGTH, safeReturnPath, validateSignIn, type SignInErrors } from '../lib/demoSession';

/**
 * The LabSentinel access screen: name, the fixed Public Health Analyst role,
 * and a password. Any non-empty name and password sign in; nothing is sent
 * anywhere.
 *
 * The password field is uncontrolled: its value is read once on submit,
 * checked for presence, then cleared from the input. It never enters React
 * state, storage, the URL or a log.
 *
 * `ls-shell` keeps the screen one viewport tall; auto margins on the first
 * and last child centre the content while still letting it scroll on a very
 * short viewport (the document itself never scrolls).
 */
export default function LandingPage() {
  const { signIn } = useDemoSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<SignInErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateSignIn(name, passwordRef.current?.value ?? '');
    setErrors(found);
    if (found.name) {
      nameRef.current?.focus();
      return;
    }
    if (found.password) {
      passwordRef.current?.focus();
      return;
    }
    // Presence was all that was checked: discard the password before going on.
    if (passwordRef.current) passwordRef.current.value = '';
    signIn(name);
    const from = (location.state as { from?: unknown } | null)?.from;
    navigate(safeReturnPath(from), { replace: true });
  };

  return (
    <main className="ls-shell ls-auth-backdrop flex flex-col items-center overflow-y-auto overflow-x-hidden overscroll-y-contain bg-canvas px-4 py-10 [&>:first-child]:mt-auto [&>:last-child]:mb-auto">
      <div className="ls-auth-brand flex flex-col items-center text-center">
        <BrandMark size={64} className="h-14 w-14 shrink-0 sm:h-16 sm:w-16" />
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">LabSentinel</h1>
        <p className="mt-1.5 text-base font-medium text-muted sm:text-lg">Outbreak Intelligence</p>
      </div>

      <form
        onSubmit={onSubmit}
        noValidate
        aria-label="Sign in to LabSentinel"
        className="ls-card mt-8 w-full max-w-sm p-6 text-left sm:p-7"
      >
        <div>
          <label htmlFor="signin-name" className="block text-sm font-medium text-ink">
            Name
          </label>
          <input
            ref={nameRef}
            id="signin-name"
            name="name"
            type="text"
            autoComplete="name"
            maxLength={NAME_MAX_LENGTH}
            placeholder="Enter your name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (errors.name && event.target.value.trim()) setErrors((current) => ({ ...current, name: undefined }));
            }}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'signin-name-error' : undefined}
            className="ls-input mt-1.5"
          />
          {errors.name ? (
            <p id="signin-name-error" role="alert" className="mt-1.5 text-sm font-medium text-[#B91C1C]">
              {errors.name}
            </p>
          ) : null}
        </div>

        <div className="mt-4">
          <label htmlFor="signin-role" className="block text-sm font-medium text-ink">
            Role
          </label>
          <input
            id="signin-role"
            name="role"
            type="text"
            value={DEMO_ROLE}
            readOnly
            aria-readonly="true"
            className="ls-input mt-1.5 cursor-default bg-canvas text-ink"
          />
        </div>

        <div className="mt-4">
          <label htmlFor="signin-password" className="block text-sm font-medium text-ink">
            Password
          </label>
          <div className="relative mt-1.5">
            <input
              ref={passwordRef}
              id="signin-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="off"
              placeholder="Enter your password"
              onInput={() => {
                if (errors.password) setErrors((current) => ({ ...current, password: undefined }));
              }}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? 'signin-password-error' : undefined}
              className="ls-input pr-16"
            />
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-controls="signin-password"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 my-1 mr-1 rounded-md px-2.5 text-xs font-semibold text-brand hover:bg-brand-light"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {errors.password ? (
            <p id="signin-password-error" role="alert" className="mt-1.5 text-sm font-medium text-[#B91C1C]">
              {errors.password}
            </p>
          ) : null}
        </div>

        <button type="submit" className="ls-btn-primary mt-6 w-full py-2.5 text-base">
          Sign in to LabSentinel
        </button>
      </form>
    </main>
  );
}
