import type { PresenceInfo } from "diagram-supabase-wrapper";

type PresenceIndicatorProps = {
  users: PresenceInfo[];
};

// minimal "who's here" list - initials only, no live cursors/colors (Stage 7)
export const PresenceIndicator = ({ users }: PresenceIndicatorProps) => {
  if (users.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {users.map((user) => (
        <span
          key={user.userId}
          title={user.email}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground"
        >
          {user.email.slice(0, 2).toUpperCase()}
        </span>
      ))}
    </div>
  );
};
