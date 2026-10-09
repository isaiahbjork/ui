"use client";

import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { TEAM_INVITE_SAMPLE, TeamInviteCard } from "@/components/bjork-ui/cards/team-invite-card";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("team-invite-card");

export default function Page() {
  const isPreview = usePreviewMode();
  return (
    <SimpleComponentDemoPage
      item={item}
      description="Invite people by email: paste or type a list, pick a role and send. Bad addresses, existing members and seat limits are caught before sending; pending invites can be resent or revoked."
      dependencies={["framer-motion", "lucide-react", "next-themes"]}
      interactionRows={[
        { label: "Emails", value: "Enter, comma or space commits; paste splits a list; Backspace removes the last" },
        { label: "Checks", value: "Invalid, already a member, already invited and duplicates are flagged and skipped" },
        { label: "Seats", value: "Segmented meter counts members, pending and the invites you are about to send" },
      ]}
      usageCode={`import { TeamInviteCard } from "@/components/bjork-ui/cards/team-invite-card";

<TeamInviteCard
  team="Northpeak"
  roles={[
    { id: "admin", label: "Admin", description: "Billing, members and every project" },
    { id: "member", label: "Member", description: "Create and edit projects" },
  ]}
  members={team.members.map((m) => m.email)}
  defaultPending={team.invites}
  seats={{ used: team.members.length, total: plan.seats }}
  onInvite={(emails, role) => api.invite(emails, role)} // reject to show an error
  onResend={(invite) => api.resend(invite.id)}
  onRevoke={(invite) => api.revoke(invite.id)}
  inviteLink={team.joinUrl}
/>`}
      previewScaleClassName="w-[440px] scale-[0.82]"
    >
      <TeamInviteCard
        now={TEAM_INVITE_SAMPLE.now}
        key={isPreview ? "preview" : "live"}
        defaultEmails={["lena@fieldnote.studio", "priya@halden.io", "rowan@northpeak.co"]}
      />
    </SimpleComponentDemoPage>
  );
}
