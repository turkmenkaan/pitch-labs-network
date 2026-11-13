import { getPreview, getSessionEmail, rolesForEmail, type Role } from "@/lib/session";
import { switchRole } from "../actions";

const LABEL: Record<Role, string> = {
  admin: "Admin",
  advisor: "Advisor",
  founder: "Founder",
};

// Shown only to people who hold more than one role. Lists the other workspaces.
export async function RoleSwitcher({
  current,
  className,
}: {
  current: Role;
  className?: string;
}) {
  if (await getPreview()) return null;
  const email = await getSessionEmail();
  if (!email) return null;
  const others = (await rolesForEmail(email)).filter((r) => r !== current);
  if (others.length === 0) return null;

  return (
    <nav className={className ?? "role-switch"} aria-label="Switch workspace">
      {others.map((role) => (
        <form key={role} action={switchRole}>
          <input type="hidden" name="role" value={role} />
          <button type="submit" className="role-switch-btn">
            {LABEL[role]} view
          </button>
        </form>
      ))}
    </nav>
  );
}
