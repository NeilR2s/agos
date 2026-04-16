import type { User } from "firebase/auth";

export type AuthUserIdentity = Pick<User, "displayName" | "email"> | null | undefined;

export function getSignedInUserIdentity(user: AuthUserIdentity) {
  const displayName = user?.displayName?.trim() || null;
  const email = user?.email?.trim() || null;

  return {
    primary: displayName ?? email ?? "SIGNED IN",
    secondary: displayName && email ? email : null,
  };
}
