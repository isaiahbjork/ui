"use client";

import { AppSettings } from "@/components/bjork-ui/blocks/app-settings";
import { AppBlockFrame } from "../app-block-frame";

export default function AppSettingsDemo() {
  return (
    <AppBlockFrame
      slug="app-settings"
      description="A settings page with five sections: profile with inline validation and an avatar upload, a notification matrix with quiet hours, appearance that re-themes the block as you pick, security with a password form, two-factor setup and session sign-out, and billing. Edits are kept per section and one bar saves them all, or press ⌘S. Try the username “admin” or the current password “wrong”."
      usageCode={`import { AppSettings } from "@/components/bjork-ui/blocks/app-settings";

export function SettingsPage() {
  return (
    <div className="h-dvh">
      <AppSettings
        profile={{
          name: "Rhea Castillo",
          username: "rhea",
          email: "rhea@halcyon.app",
          bio: "",
          timezone: "America/Los_Angeles",
        }}
        onSave={async ({ profile, notifications }) => {
          // only the sections that changed are passed; throw to show an error toast
          await fetch("/api/settings", { method: "PATCH", body: JSON.stringify({ profile, notifications }) });
        }}
        onChangePassword={async (current, next) => {
          const res = await fetch("/api/password", { method: "POST", body: JSON.stringify({ current, next }) });
          if (!res.ok) throw new Error("That isn't your current password.");
        }}
        onRevokeSession={(id) => fetch(\`/api/sessions/\${id}\`, { method: "DELETE" })}
        onThemeChange={(theme) => localStorage.setItem("theme", theme)}
        onDeleteAccount={() => fetch("/api/account", { method: "DELETE" })}
      />
    </div>
  );
}`}
    >
      {({ theme }) => <AppSettings theme={theme} />}
    </AppBlockFrame>
  );
}
