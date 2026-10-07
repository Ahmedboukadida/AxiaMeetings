// Load .env only if DATABASE_URL is not already in the environment
if (!process.env.DATABASE_URL) {
  try { require('dotenv/config'); } catch (e) {}
}

module.exports = {
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
};
