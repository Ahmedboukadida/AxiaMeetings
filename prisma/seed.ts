import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
// Load environment variables from .env file
dotenv.config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
async function main() {
  // Create a developer user if not exists
  const username = process.env.SEED_DEVELOPER_USERNAME || 'developer';
  const password = process.env.SEED_DEVELOPER_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error('Set SEED_DEVELOPER_PASSWORD (min 12 characters) before running the seed.');
  }
  const developer = await prisma.users.findFirst({ where: { username } });
  if (!developer) {
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.users.create({ data: { fullname: 'Developer User', username, password: passwordHash, role: 'DEVELOPER' } });
  }
  console.log('Seed data created.');
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  }).finally(async () => { await prisma.$disconnect(); });