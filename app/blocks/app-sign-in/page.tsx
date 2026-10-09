"use client";

import { AppSignIn } from "@/components/bjork-ui/blocks/app-sign-in";
import { AppBlockFrame } from "../app-block-frame";

export default function AppSignInDemo() {
  return (
    <AppBlockFrame
      slug="app-sign-in"
      description="A complete sign-in and sign-up page: single sign-on, email and password with validation on blur and submit, a caps-lock warning, a password strength checklist, a passwordless link with a six-digit code fallback and resend timer, plus loading, error and success states. Try a password of “wrong”, or an address ending in @blocked.test, to see the error states."
      usageCode={`import { AppSignIn } from "@/components/bjork-ui/blocks/app-sign-in";

export function SignInPage() {
  return (
    <div className="h-dvh">
      <AppSignIn
        brand={{ name: "Kestrel", tagline: "Incident timelines for teams that ship daily." }}
        onSubmit={async ({ mode, email, password, remember }) => {
          const res = await fetch(mode === "sign-in" ? "/api/login" : "/api/signup", {
            method: "POST",
            body: JSON.stringify({ email, password, remember }),
          });
          if (!res.ok) throw new Error("That email and password don't match.");
        }}
        onSso={(provider) => (window.location.href = \`/auth/\${provider}\`)}
        onMagicLink={(email) => fetch("/api/magic-link", { method: "POST", body: email })}
        onVerifyCode={async (email, code) => {
          /* throw to reject the code */
        }}
        onContinue={() => (window.location.href = "/app")}
      />
    </div>
  );
}`}
    >
      {({ theme }) => <AppSignIn theme={theme} />}
    </AppBlockFrame>
  );
}
