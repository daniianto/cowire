import type { PeerAwarenessState } from "diagram-crdt-core";

type PresenceIndicatorProps = {
  users: PeerAwarenessState[];
};

// minimal "who's here" list - colored initials, matching each user's live
// cursor color (see RemoteCursors); no richer profile info than that
export const PresenceIndicator = ({ users }: PresenceIndicatorProps) => {
  if (users.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {users.map((user) => (
        <span
          key={user.userId}
          title={user.email}
          style={{ backgroundColor: user.color }}
          className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium text-white"
        >
          {user.email.slice(0, 2).toUpperCase()}
        </span>
      ))}
    </div>
  );
};
