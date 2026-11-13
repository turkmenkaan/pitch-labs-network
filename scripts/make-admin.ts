// Creates the first admin (or any admin) without hand-editing SQL.
//   npm run make-admin -- someone@company.com "Full Name"
import { PrismaClient } from "@prisma/client";
import { emailInRole,isValidEmail, normalizeMemberEmail } from "../lib/admin";

const prisma = new PrismaClient();

async function main() {
  const [rawEmail, ...nameParts] = process.argv.slice(2);
  const name = nameParts.join(" ").trim();
  const email = normalizeMemberEmail(rawEmail ?? "");

  if (!isValidEmail(email) || !name) {
    console.error('Usage: npm run make-admin -- <email> "<Full Name>"');
    process.exit(1);
  }
  if (await emailInRole("admin", email)) {
    console.error(`${email} is already an admin.`);
    process.exit(1);
  }

  const admin = await prisma.admin.create({ data: { email, name } });
  console.log(`Admin created: ${admin.name} <${admin.email}>`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
